import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  testSftpConnection,
  runSftpSync,
  registerSftpScheduler,
  reprocessarArquivosLocais,
} from '../services/sftp-service.js';

const sftpConfigSchema = z.object({
  host:            z.string().min(1, 'Host é obrigatório'),
  porta:           z.number().int().min(1).max(65535).default(22),
  usuario:         z.string().min(1, 'Usuário é obrigatório'),
  senha:           z.string().optional(),
  pastaRemota:     z.string().default('/'),
  pastaLocal:      z.string().default('storage/sftp/getnet'),
  horarioExecucao: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário deve ser no formato HH:MM (ex: 05:00)').default('05:00'),
  ativo:           z.boolean().default(false),
  autoProcessar:   z.boolean().default(true),
});

const sftpTestSchema = z.object({
  host:        z.string().optional(),
  porta:       z.number().optional(),
  usuario:     z.string().optional(),
  senha:       z.string().optional(),
  pastaRemota: z.string().optional(),
});

export const sftpRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/sftp/config
  fastify.get('/config', async (_req, reply) => {
    let config = await fastify.prisma.sftpConfig.findUnique({
      where: { id: 'getnet' },
    });

    if (!config) {
      config = await fastify.prisma.sftpConfig.create({
        data: {
          id: 'getnet',
          provedor: 'GETNET',
          porta: 22,
          pastaRemota: '/',
          pastaLocal: 'storage/sftp/getnet',
          horarioExecucao: '05:00',
          ativo: false,
          autoProcessar: true,
        },
      });
    }

    return reply.send({
      success: true,
      data: {
        id:              config.id,
        provedor:        config.provedor,
        host:            config.host || '',
        porta:           config.porta,
        usuario:         config.usuario || '',
        hasSenha:        Boolean(config.senha && config.senha.length > 0),
        pastaRemota:     config.pastaRemota,
        pastaLocal:      config.pastaLocal,
        horarioExecucao: config.horarioExecucao,
        ativo:           config.ativo,
        autoProcessar:   config.autoProcessar,
        ultimoStatus:    config.ultimoStatus,
        ultimoDownload:  config.ultimoDownload?.toISOString() ?? null,
        ultimaMensagem:  config.ultimaMensagem,
      },
    });
  });

  // PUT /api/sftp/config
  fastify.put('/config', async (req, reply) => {
    const parsed = sftpConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }

    const { host, porta, usuario, senha, pastaRemota, pastaLocal, horarioExecucao, ativo, autoProcessar } = parsed.data;

    // Busca configuração atual
    const current = await fastify.prisma.sftpConfig.findUnique({
      where: { id: 'getnet' },
    });

    // Se senha não foi informada, mantém a anterior
    const senhaFinal = senha && senha.trim().length > 0 ? senha.trim() : (current?.senha || null);

    const updated = await fastify.prisma.sftpConfig.upsert({
      where: { id: 'getnet' },
      create: {
        id: 'getnet',
        provedor: 'GETNET',
        host,
        porta,
        usuario,
        senha: senhaFinal,
        pastaRemota,
        pastaLocal,
        horarioExecucao,
        ativo,
        autoProcessar,
      },
      update: {
        host,
        porta,
        usuario,
        senha: senhaFinal,
        pastaRemota,
        pastaLocal,
        horarioExecucao,
        ativo,
        autoProcessar,
      },
    });

    // Atualiza agendador em background em tempo real
    registerSftpScheduler(updated.id, updated.horarioExecucao, updated.ativo, fastify.prisma);

    return reply.send({
      success: true,
      message: 'Configurações de SFTP e agendamento atualizadas com sucesso!',
      data: {
        id:              updated.id,
        host:            updated.host,
        porta:           updated.porta,
        usuario:         updated.usuario,
        hasSenha:        Boolean(updated.senha),
        pastaRemota:     updated.pastaRemota,
        pastaLocal:      updated.pastaLocal,
        horarioExecucao: updated.horarioExecucao,
        ativo:           updated.ativo,
        autoProcessar:   updated.autoProcessar,
      },
    });
  });

  // POST /api/sftp/test — Testa conectividade com o servidor SFTP
  fastify.post('/test', async (req, reply) => {
    const body = sftpTestSchema.parse(req.body || {});

    // Se parâmetros não vieram no body, usa os salvos no banco
    let host = body.host;
    let porta = body.porta;
    let usuario = body.usuario;
    let senha = body.senha;
    let pastaRemota = body.pastaRemota;

    if (!host || !usuario) {
      const saved = await fastify.prisma.sftpConfig.findUnique({
        where: { id: 'getnet' },
      });
      if (saved) {
        host = host || saved.host || '';
        porta = porta || saved.porta || 22;
        usuario = usuario || saved.usuario || '';
        senha = senha || saved.senha || undefined;
        pastaRemota = pastaRemota || saved.pastaRemota || '/';
      }
    }

    if (!host || !usuario) {
      return reply.status(400).send({
        success: false,
        message: 'Host e Usuário são obrigatórios para testar a conexão.',
      });
    }

    const testRes = await testSftpConnection({
      host,
      porta: porta || 22,
      usuario,
      senha,
      pastaRemota: pastaRemota || '/',
    });

    // Atualiza status no banco
    await fastify.prisma.sftpConfig.upsert({
      where: { id: 'getnet' },
      create: {
        id: 'getnet',
        provedor: 'GETNET',
        host,
        porta: porta || 22,
        usuario,
        senha: senha || null,
        ultimoStatus: testRes.success ? 'CONECTADO' : 'ERRO',
        ultimaMensagem: testRes.message,
      },
      update: {
        ultimoStatus: testRes.success ? 'CONECTADO' : 'ERRO',
        ultimaMensagem: testRes.message,
      },
    });

    return reply.send(testRes);
  });

  // POST /api/sftp/sync-now — Dispara download e processamento imediato
  fastify.post('/sync-now', async (_req, reply) => {
    try {
      const result = await runSftpSync('getnet', 'MANUAL', fastify.prisma);
      return reply.send(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao executar sincronização';
      return reply.status(500).send({ success: false, error: msg });
    }
  });

  // POST /api/sftp/reprocessar — Reprocessa arquivos locais e garante lotes de Vendas e Recebíveis
  fastify.post('/reprocessar', async (_req, reply) => {
    try {
      const result = await reprocessarArquivosLocais(undefined, fastify.prisma);
      return reply.send({ success: true, processados: result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao reprocessar arquivos locais';
      return reply.status(500).send({ success: false, error: msg });
    }
  });

  // GET /api/sftp/logs — Histórico de execuções
  fastify.get('/logs', async (req, reply) => {
    const query = req.query as { page?: string; limit?: string };
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const [total, logs] = await Promise.all([
      fastify.prisma.sftpJobLog.count({ where: { configId: 'getnet' } }),
      fastify.prisma.sftpJobLog.findMany({
        where: { configId: 'getnet' },
        orderBy: { iniciadoEm: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return reply.send({
      success: true,
      paginacao: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      logs,
    });
  });
};

export default sftpRoutes;
