import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import pg from 'pg';

const { Client } = pg;

const empresaRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/empresa/public — Retorna nome e logo para exibição no cabeçalho (qualquer usuário logado)
  fastify.get('/public', { preHandler: [fastify.authenticate] }, async (_req, reply) => {
    let config = await fastify.prisma.empresaConfig.findUnique({
      where: { id: 'default' },
      select: {
        nomeFantasia: true,
        razaoSocial: true,
        logomarca: true,
        erpSoftware: true,
        erpTipoIntegracao: true,
        erpAtivo: true,
        erpStatus: true,
        erpHost: true,
        erpDatabase: true,
      },
    });

    if (!config) {
      config = await fastify.prisma.empresaConfig.create({
        data: { id: 'default' },
        select: {
          nomeFantasia: true,
          razaoSocial: true,
          logomarca: true,
          erpSoftware: true,
          erpTipoIntegracao: true,
          erpAtivo: true,
          erpStatus: true,
          erpHost: true,
          erpDatabase: true,
        },
      });
    }

    return reply.send({ success: true, empresa: config });
  });

  // GET /api/empresa — Dados completos para o painel administrativo
  fastify.get('/', { preHandler: [fastify.requireAdmin] }, async (_req, reply) => {
    let config = await fastify.prisma.empresaConfig.findUnique({
      where: { id: 'default' },
    });

    if (!config) {
      config = await fastify.prisma.empresaConfig.create({
        data: { id: 'default' },
      });
    }

    // Mascara a senha do ERP por segurança
    const { erpSenha, ...rest } = config;
    return reply.send({
      success: true,
      empresa: {
        ...rest,
        hasErpSenha: Boolean(erpSenha && erpSenha.trim().length > 0),
      },
    });
  });

  // PUT /api/empresa — Atualiza configurações cadastrais, logomarca e parâmetros do ERP
  fastify.put('/', { preHandler: [fastify.requireAdmin] }, async (req, reply) => {
    const schema = z.object({
      razaoSocial: z.string().min(1, 'Razão Social é obrigatória'),
      nomeFantasia: z.string().min(1, 'Nome Fantasia é obrigatório'),
      cnpj: z.string().optional().default(''),
      inscricaoEstadual: z.string().optional().nullable(),
      telefone: z.string().optional().nullable(),
      email: z.string().optional().nullable(),
      cidade: z.string().optional().nullable(),
      uf: z.string().optional().nullable(),
      logomarca: z.string().optional().nullable(),

      erpSoftware: z.string().default('VRSOFTWARE'),
      erpTipoIntegracao: z.enum(['BANCO', 'PLANILHA']).default('BANCO'),
      erpTipo: z.string().default('POSTGRESQL'),
      erpHost: z.string().optional().nullable(),
      erpPorta: z.number().int().default(5432),
      erpDatabase: z.string().optional().nullable(),
      erpUsuario: z.string().optional().nullable(),
      erpSenha: z.string().optional().nullable(),
      erpSsl: z.boolean().default(false),
      erpAtivo: z.boolean().default(false),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
    }

    const { erpSenha, ...data } = parsed.data;

    // Obtém configuração atual para preservar a senha se não foi reenviada
    const current = await fastify.prisma.empresaConfig.findUnique({ where: { id: 'default' } });

    const updateData: Record<string, unknown> = { ...data };
    if (erpSenha !== undefined && erpSenha !== null && erpSenha.trim() !== '') {
      updateData.erpSenha = erpSenha;
    } else if (current?.erpSenha) {
      updateData.erpSenha = current.erpSenha;
    }

    const updated = await fastify.prisma.empresaConfig.upsert({
      where: { id: 'default' },
      update: updateData,
      create: {
        id: 'default',
        ...updateData,
      },
    });

    const { erpSenha: _, ...rest } = updated;
    return reply.send({
      success: true,
      empresa: {
        ...rest,
        hasErpSenha: Boolean(updated.erpSenha && updated.erpSenha.trim().length > 0),
      },
    });
  });

  // POST /api/empresa/testar-conexao — Testa a conexão ativa com o banco PostgreSQL do ERP
  fastify.post('/testar-conexao', { preHandler: [fastify.requireAdmin] }, async (req, reply) => {
    const schema = z.object({
      host: z.string().optional(),
      port: z.number().int().optional(),
      database: z.string().optional(),
      user: z.string().optional(),
      password: z.string().optional(),
      ssl: z.boolean().optional(),
    });

    const parsed = schema.safeParse(req.body);
    const params = parsed.success ? parsed.data : {};

    // Se algum campo não foi passado no body, pega da configuração salva
    const saved = await fastify.prisma.empresaConfig.findUnique({ where: { id: 'default' } });

    const host = params.host || saved?.erpHost;
    const port = params.port || saved?.erpPorta || 5432;
    const database = params.database || saved?.erpDatabase;
    const user = params.user || saved?.erpUsuario;
    const password = params.password || saved?.erpSenha;
    const ssl = params.ssl ?? saved?.erpSsl ?? false;

    if (!host) {
      return reply.status(400).send({ success: false, error: 'O endereço (Host / IP) do servidor é obrigatório.' });
    }
    if (!database) {
      return reply.status(400).send({ success: false, error: 'O nome do banco de dados (Database) é obrigatório.' });
    }
    if (!user) {
      return reply.status(400).send({ success: false, error: 'O usuário do banco de dados é obrigatório.' });
    }

    const client = new Client({
      host,
      port: Number(port),
      database,
      user,
      password: password || undefined,
      ssl: ssl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 6000,
      options: '-c default_transaction_read_only=on',
    });

    const start = Date.now();
    try {
      await client.connect();
      const res = await client.query<{ version: string }>('SELECT version();');
      await client.end();

      const latencyMs = Date.now() - start;
      const versionStr = res.rows[0]?.version?.split(' on ')[0] ?? 'PostgreSQL detectado';
      const successMsg = `Conectado com sucesso (${latencyMs}ms): ${versionStr}`;

      await fastify.prisma.empresaConfig.upsert({
        where: { id: 'default' },
        create: {
          id: 'default',
          erpStatus: 'CONECTADO',
          erpUltimoTeste: new Date(),
          erpMensagem: successMsg,
        },
        update: {
          erpStatus: 'CONECTADO',
          erpUltimoTeste: new Date(),
          erpMensagem: successMsg,
        },
      });

      return reply.send({
        success: true,
        latencyMs,
        version: versionStr,
        message: successMsg,
      });
    } catch (err: unknown) {
      try {
        await client.end();
      } catch {
        // Ignora erro no fechamento de conexão que já falhou
      }

      const errorMsg = err instanceof Error ? err.message : 'Falha desconhecida ao conectar ao banco';
      fastify.log.error(err, 'Erro ao testar conexão com ERP');

      await fastify.prisma.empresaConfig.upsert({
        where: { id: 'default' },
        create: {
          id: 'default',
          erpStatus: 'ERRO',
          erpUltimoTeste: new Date(),
          erpMensagem: errorMsg,
        },
        update: {
          erpStatus: 'ERRO',
          erpUltimoTeste: new Date(),
          erpMensagem: errorMsg,
        },
      });

      return reply.status(200).send({
        success: false,
        error: errorMsg,
      });
    }
  });

  // POST /api/empresa/erp/preview-vendatef — Busca amostra de vendas da tabela pdv.vendatef
  fastify.post('/erp/preview-vendatef', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const saved = await fastify.prisma.empresaConfig.findUnique({ where: { id: 'default' } });
    if (!saved || !saved.erpHost || !saved.erpDatabase || !saved.erpUsuario) {
      return reply.status(400).send({ success: false, error: 'Banco do ERP não configurado.' });
    }

    const client = new Client({
      host: saved.erpHost,
      port: saved.erpPorta,
      database: saved.erpDatabase,
      user: saved.erpUsuario,
      password: saved.erpSenha || undefined,
      ssl: saved.erpSsl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 5000,
      options: '-c default_transaction_read_only=on',
    });

    try {
      await client.connect();

      // Verifica se a tabela existe
      const tableCheck = await client.query<{ exists: boolean }>(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_schema = 'pdv' AND table_name = 'vendatef'
        ) as exists;
      `);

      if (!tableCheck.rows[0]?.exists) {
        await client.end();
        return reply.send({
          success: false,
          error: 'Tabela pdv.vendatef não foi encontrada no banco do ERP especificado.',
        });
      }

      // Mapeamento dinâmico de colunas para suportar qualquer versão do VRSoftware
      const colsRes = await client.query<{ column_name: string }>(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_schema = 'pdv' AND table_name = 'vendatef'
      `);
      const colSet = new Set(colsRes.rows.map(c => c.column_name.toLowerCase()));

      const idLojaExpr = colSet.has('id_loja') ? 'id_loja' : '1 as id_loja';
      const pdvExpr = colSet.has('ecf') ? 'ecf as pdv' : colSet.has('pdv') ? 'pdv' : '1 as pdv';
      const cupomExpr = colSet.has('cupom') ? 'cupom' : colSet.has('matricula') ? 'matricula as cupom' : '0 as cupom';
      const nsuExpr = colSet.has('nsusitef') ? 'nsusitef::text as nsu' : colSet.has('nsu') ? 'nsu::text as nsu' : "'' as nsu";
      const nsuHostExpr = colSet.has('nsuhost') ? 'nsuhost::text as nsu_host' : colSet.has('nsu_host') ? 'nsu_host::text as nsu_host' : "'' as nsu_host";
      const authExpr = colSet.has('codigoautorizacao') ? 'codigoautorizacao as autorizacao' : colSet.has('autorizacao') ? 'autorizacao' : "'' as autorizacao";
      const cardExpr = colSet.has('nomecartao') ? 'nomecartao' : colSet.has('bandeira') ? 'bandeira' : "'CARTAO' as nomecartao";
      const parcExpr = colSet.has('numeroparcela') ? 'numeroparcela as parcelas' : colSet.has('parcelas') ? 'parcelas' : '1 as parcelas';
      const statusFilter = colSet.has('id_situacaotef') ? '(id_situacaotef = 1)' : '(cancelado IS NULL OR cancelado = FALSE)';

      const countRes = await client.query<{ count: string }>(`
        SELECT count(*)::text as count 
        FROM pdv.vendatef 
        WHERE ${statusFilter}
      `);

      const rowsRes = await client.query(`
        SELECT 
          id,
          ${idLojaExpr},
          ${pdvExpr},
          ${cupomExpr},
          data::text as data,
          hora::text as hora,
          ${nsuExpr},
          ${nsuHostExpr},
          ${authExpr},
          valor::float as valor,
          ${cardExpr} as nomecartao,
          ${cardExpr} as bandeira,
          ${cardExpr} as rede,
          ${cardExpr} as tipo,
          ${parcExpr},
          'APROVADO' as status
        FROM pdv.vendatef
        WHERE ${statusFilter}
        ORDER BY data DESC, hora DESC
        LIMIT 10
      `);

      await client.end();

      return reply.send({
        success: true,
        total: Number(countRes.rows[0]?.count || 0),
        rows: rowsRes.rows,
      });
    } catch (err: unknown) {
      try { await client.end(); } catch {}
      const errorMsg = err instanceof Error ? err.message : 'Erro ao consultar pdv.vendatef';
      return reply.status(500).send({ success: false, error: errorMsg });
    }
  });

  // POST /api/empresa/erp/sync-sistema — Sincroniza vendas TEF formatadas para a aba Sistema
  fastify.post('/erp/sync-sistema', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const filterSchema = z.object({
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
      idLoja: z.number().int().optional(),
    });

    const parsed = filterSchema.safeParse(req.body);
    const { dataInicio, dataFim, idLoja } = parsed.success ? parsed.data : {};

    const saved = await fastify.prisma.empresaConfig.findUnique({ where: { id: 'default' } });
    if (!saved || !saved.erpHost || !saved.erpDatabase || !saved.erpUsuario) {
      return reply.status(400).send({ success: false, error: 'Banco do ERP não configurado.' });
    }

    const client = new Client({
      host: saved.erpHost,
      port: saved.erpPorta,
      database: saved.erpDatabase,
      user: saved.erpUsuario,
      password: saved.erpSenha || undefined,
      ssl: saved.erpSsl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 6000,
      options: '-c default_transaction_read_only=on',
    });

    try {
      await client.connect();

      // Mapeamento dinâmico de colunas para suportar qualquer versão do VRSoftware
      const colsRes = await client.query<{ column_name: string }>(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_schema = 'pdv' AND table_name = 'vendatef'
      `);
      const colSet = new Set(colsRes.rows.map(c => c.column_name.toLowerCase()));

      const idLojaExpr = colSet.has('id_loja') ? 'id_loja' : '1 as id_loja';
      const pdvExpr = colSet.has('ecf') ? 'ecf as pdv' : colSet.has('pdv') ? 'pdv' : '1 as pdv';
      const cupomExpr = colSet.has('cupom') ? 'cupom' : colSet.has('matricula') ? 'matricula as cupom' : '0 as cupom';
      const nsuExpr = colSet.has('nsusitef') ? 'nsusitef::text as nsu' : colSet.has('nsu') ? 'nsu::text as nsu' : "'' as nsu";
      const nsuHostExpr = colSet.has('nsuhost') ? 'nsuhost::text as nsu_host' : colSet.has('nsu_host') ? 'nsu_host::text as nsu_host' : "'' as nsu_host";
      const authExpr = colSet.has('codigoautorizacao') ? 'codigoautorizacao as autorizacao' : colSet.has('autorizacao') ? 'autorizacao' : "'' as autorizacao";
      const cardExpr = colSet.has('nomecartao') ? 'nomecartao' : colSet.has('bandeira') ? 'bandeira' : "'CARTAO' as nomecartao";
      const parcExpr = colSet.has('numeroparcela') ? 'numeroparcela as parcelas' : colSet.has('parcelas') ? 'parcelas' : '1 as parcelas';
      const statusFilter = colSet.has('id_situacaotef') ? '(id_situacaotef = 1)' : '(cancelado IS NULL OR cancelado = FALSE)';

      const query = `
        SELECT 
          id,
          ${idLojaExpr},
          ${pdvExpr},
          ${cupomExpr},
          data::text as data,
          hora::text as hora,
          ${nsuExpr},
          ${nsuHostExpr},
          ${authExpr},
          valor::float as valor,
          ${cardExpr} as nomecartao,
          ${parcExpr}
        FROM pdv.vendatef
        WHERE ${statusFilter}
          AND ($1::text IS NULL OR data >= $1::date)
          AND ($2::text IS NULL OR data <= $2::date)
          AND ($3::int IS NULL OR ${colSet.has('id_loja') ? 'id_loja' : '1'} = $3::int)
        ORDER BY data ASC, hora ASC
      `;

      const res = await client.query(query, [
        dataInicio || null,
        dataFim || null,
        idLoja || null,
      ]);

      await client.end();

      // Mapeia para o formato SystemStatement
      const daysMap = new Map<string, {
        date: string;
        bank: string;
        saldoAnt: number;
        totDeb: number;
        totCred: number;
        saldoDia: number;
        items: Array<{
          sid: string;
          date: string;
          desc: string;
          deb: number;
          cred: number;
          value: number;
          obs: string;
          doc: string;
          sysConc: boolean;
        }>;
      }>();

      const allItems: Array<{
        sid: string;
        date: string;
        desc: string;
        deb: number;
        cred: number;
        value: number;
        obs: string;
        doc: string;
        sysConc: boolean;
      }> = [];

      let runningIndex = 0;
      for (const row of res.rows) {
        const d = row.data as string;
        const val = Number(row.valor) || 0;
        const sid = `vr_${row.id ?? ++runningIndex}`;
        const cardName = String(row.nomecartao || 'Cartão').trim();
        const desc = [cardName, row.nsu ? `NSU ${row.nsu}` : ''].filter(Boolean).join(' ');
        const obsParts = [];
        if (row.pdv) obsParts.push(`PDV ${row.pdv}`);
        if (row.cupom && row.cupom !== '0' && row.cupom !== 0) obsParts.push(`Cupom ${row.cupom}`);
        if (row.autorizacao) obsParts.push(`Aut: ${row.autorizacao}`);
        const obs = obsParts.join(' | ');

        const item = {
          sid,
          date: d,
          desc,
          deb: 0,
          cred: val,
          value: val, // crédito positivo
          obs,
          doc: '',
          sysConc: false,
        };

        allItems.push(item);

        if (!daysMap.has(d)) {
          daysMap.set(d, {
            date: d,
            bank: `VRSoftware - Loja ${row.id_loja || 1}`,
            saldoAnt: 0,
            totDeb: 0,
            totCred: 0,
            saldoDia: 0,
            items: [],
          });
        }

        const day = daysMap.get(d)!;
        day.items.push(item);
        day.totCred = Math.round((day.totCred + val) * 100) / 100;
        day.saldoDia = Math.round((day.saldoDia + val) * 100) / 100;
      }

      return reply.send({
        success: true,
        file: `VRSoftware (pdv.vendatef) [${res.rows.length} lançamentos]`,
        total: res.rows.length,
        days: Array.from(daysMap.entries()).map(([k, v]) => ({ key: k, day: v })),
        items: allItems,
      });
    } catch (err: unknown) {
      try { await client.end(); } catch {}
      const errorMsg = err instanceof Error ? err.message : 'Erro ao sincronizar do ERP';
      return reply.status(500).send({ success: false, error: errorMsg });
    }
  });

  // ── POST /api/empresa/erp/sync-sitef ──────────────────────────────
  // Sincroniza vendas TEF do ERP (pdv.vendatef) diretamente para o lote e transações de SITEF
  fastify.post('/erp/sync-sitef', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const syncSchema = z.object({
      dataInicio: z.string().optional(),
      dataFim:    z.string().optional(),
      idLoja:     z.number().optional(),
    });

    const parsed = syncSchema.safeParse(req.body);
    const { dataInicio, dataFim, idLoja } = parsed.success ? parsed.data : {};

    const saved = await fastify.prisma.empresaConfig.findUnique({ where: { id: 'default' } });
    if (!saved || !saved.erpHost || !saved.erpDatabase || !saved.erpUsuario) {
      return reply.status(400).send({ success: false, error: 'Banco do ERP não configurado.' });
    }

    const client = new Client({
      host: saved.erpHost,
      port: saved.erpPorta,
      database: saved.erpDatabase,
      user: saved.erpUsuario,
      password: saved.erpSenha || undefined,
      ssl: saved.erpSsl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 6000,
      options: '-c default_transaction_read_only=on',
    });

    try {
      await client.connect();

      const colsRes = await client.query<{ column_name: string }>(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_schema = 'pdv' AND table_name = 'vendatef'
      `);
      const colSet = new Set(colsRes.rows.map(c => c.column_name.toLowerCase()));

      const idLojaExpr = colSet.has('id_loja') ? 'id_loja' : '1 as id_loja';
      const pdvExpr = colSet.has('ecf') ? 'ecf as pdv' : colSet.has('pdv') ? 'pdv' : '1 as pdv';
      const cupomExpr = colSet.has('cupom') ? 'cupom' : colSet.has('matricula') ? 'matricula as cupom' : '0 as cupom';
      const nsuExpr = colSet.has('nsusitef') ? 'nsusitef::text as nsu' : colSet.has('nsu') ? 'nsu::text as nsu' : "'' as nsu";
      const nsuHostExpr = colSet.has('nsuhost') ? 'nsuhost::text as nsu_host' : colSet.has('nsu_host') ? 'nsu_host::text as nsu_host' : "'' as nsu_host";
      const authExpr = colSet.has('codigoautorizacao') ? 'codigoautorizacao as autorizacao' : colSet.has('autorizacao') ? 'autorizacao' : "'' as autorizacao";
      const cardExpr = colSet.has('nomecartao') ? 'nomecartao' : colSet.has('bandeira') ? 'bandeira' : "'CARTAO' as nomecartao";
      const parcExpr = colSet.has('numeroparcela') ? 'numeroparcela as parcelas' : colSet.has('parcelas') ? 'parcelas' : '1 as parcelas';
      const statusFilter = colSet.has('id_situacaotef') ? '(id_situacaotef = 1)' : '(cancelado IS NULL OR cancelado = FALSE)';

      const query = `
        SELECT 
          id,
          ${idLojaExpr},
          ${pdvExpr},
          ${cupomExpr},
          data::text as data,
          hora::text as hora,
          ${nsuExpr},
          ${nsuHostExpr},
          ${authExpr},
          valor::float as valor,
          ${cardExpr} as nomecartao,
          ${parcExpr}
        FROM pdv.vendatef
        WHERE ${statusFilter}
          AND ($1::text IS NULL OR data >= $1::date)
          AND ($2::text IS NULL OR data <= $2::date)
          AND ($3::int IS NULL OR ${colSet.has('id_loja') ? 'id_loja' : '1'} = $3::int)
        ORDER BY data ASC, hora ASC
      `;

      const res = await client.query(query, [
        dataInicio || null,
        dataFim || null,
        idLoja || null,
      ]);

      await client.end();

      if (res.rows.length === 0) {
        return reply.send({
          success: true,
          total: 0,
          adicionadas: 0,
          ignoradas: 0,
          message: 'Nenhuma venda TEF encontrada para o período selecionado no ERP.',
        });
      }

      const userId = req.user?.id;
      const loteDesc = `VRSoftware pdv.vendatef [${dataInicio || 'início'} a ${dataFim || 'fim'}]`;

      const lote = await fastify.prisma.sitefLote.create({
        data: {
          arquivo: loteDesc,
          importadoPor: userId,
        },
      });

      const transacoes = res.rows.map((row, idx) => {
        const dataDia = String(row.data);
        const pdv = String(row.pdv || '1');
        const codLoja = String(row.id_loja || '1');
        const rede = String(row.nomecartao || 'CARTAO').trim().toUpperCase();
        const nsu = String(row.nsu || '').trim();
        const nsuHost = String(row.nsu_host || nsu).trim();
        const aut = String(row.autorizacao || '').trim();
        const hora = String(row.hora || '00:00:00');
        const dataTrans = `${dataDia}T${hora}`;
        const idempotencyKey = nsu
          ? `${nsu}::${pdv}::${codLoja}::${rede}::${dataDia}`
          : `VR::${row.id ?? idx}::${pdv}::${codLoja}::${dataDia}`;

        return {
          idempotencyKey,
          loteId: lote.id,
          dataTrans,
          dataDia,
          dataFiscal: dataDia,
          codigoLoja: codLoja,
          cartao: rede,
          pdv,
          nsu,
          nsuHost,
          valor: Number(row.valor) || 0,
          valorSaque: 0,
          rede,
          tipoProduto: 'CARTAO',
          tipoProdutoRaw: rede,
          autorizacao: aut,
          estabelecimento: codLoja,
          modoEntrada: 'TEF',
          produto: rede,
          descricaoTransacao: `Venda TEF PDV ${pdv}`,
          nrParcelas: Number(row.parcelas) || 1,
          estadoTransacao: 'EFETIVADA',
          estadoTransacaoRaw: 'EFETIVADA',
          operador: '',
          terminalLogico: pdv,
          codSitef: '',
          cupomFiscal: String(row.cupom || ''),
        };
      });

      const insertResult = await fastify.prisma.sitefTransacao.createMany({
        data: transacoes,
        skipDuplicates: true,
      });

      const ignoradas = transacoes.length - insertResult.count;
      await fastify.prisma.sitefLote.update({
        where: { id: lote.id },
        data: {
          adicionadas: insertResult.count,
          ignoradas,
        },
      });

      return reply.send({
        success: true,
        total: transacoes.length,
        adicionadas: insertResult.count,
        ignoradas,
        loteId: lote.id,
        arquivo: loteDesc,
      });
    } catch (err: unknown) {
      try { await client.end(); } catch {}
      const errorMsg = err instanceof Error ? err.message : 'Erro ao sincronizar vendas TEF do ERP';
      return reply.status(500).send({ success: false, error: errorMsg });
    }
  });
};

export default empresaRoutes;
