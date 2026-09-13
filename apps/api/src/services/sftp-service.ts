import SftpClient from 'ssh2-sftp-client';
import { Cron } from 'croner';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { parseGetnetEdiFile } from '@themisflow/core';

// Mapa em memória com jobs agendados ativos por ID de configuração
const activeJobs = new Map<string, Cron>();

export interface SftpConnectionParams {
  host: string;
  porta: number;
  usuario: string;
  senha?: string;
  pastaRemota?: string;
}

export interface TestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
  filesFound?: number;
  sampleFiles?: string[];
}

/**
 * Testa conectividade com o servidor SFTP e lista arquivos na pasta remota.
 */
export async function testSftpConnection(params: SftpConnectionParams): Promise<TestResult> {
  const client = new SftpClient();
  const t0 = Date.now();
  const remotePath = params.pastaRemota?.trim() || '/';

  try {
    await client.connect({
      host: params.host,
      port: params.porta || 22,
      username: params.usuario,
      password: params.senha,
      readyTimeout: 15000,
    });

    const latencyMs = Date.now() - t0;
    const fileList = await client.list(remotePath);
    const textFiles = fileList
      .filter((f) => f.type === '-' && (f.name.endsWith('.txt') || f.name.includes('getnet')))
      .map((f) => f.name);

    await client.end();

    return {
      success: true,
      message: `Conectado com sucesso em ${latencyMs}ms! Encontrados ${fileList.length} itens (${textFiles.length} arquivos de extrato).`,
      latencyMs,
      filesFound: textFiles.length,
      sampleFiles: textFiles.slice(0, 5),
    };
  } catch (err: unknown) {
    try { await client.end(); } catch { /* ignore */ }
    const msg = err instanceof Error ? err.message : 'Falha desconhecida na conexão SFTP';
    return {
      success: false,
      message: `Erro ao conectar via SFTP: ${msg}`,
      latencyMs: Date.now() - t0,
    };
  }
}

/**
 * Converte horário "HH:MM" (ex: "05:00") para expressão Croner diária ("0 0 5 * * *")
 */
export function timeToCronExpression(timeStr: string): string {
  const clean = (timeStr || '').trim();
  const match = clean.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '0 0 5 * * *'; // default 05:00 da manhã
  const h = parseInt(match[1]!, 10);
  const m = parseInt(match[2]!, 10);
  // croner aceita 6 campos: segundo minuto hora dia mes diasemana
  return `0 ${m} ${h} * * *`;
}

/**
 * Executa o fluxo de download e processamento de arquivos do SFTP da Getnet.
 */
export async function runSftpSync(
  configId: string,
  tipo: 'AGENDADO' | 'MANUAL',
  prisma: PrismaClient
): Promise<{
  success: boolean;
  arquivosBaixados: number;
  arquivosProcessados: number;
  mensagem: string;
}> {
  const config = await prisma.sftpConfig.findUnique({
    where: { id: configId },
  });

  if (!config) {
    throw new Error(`Configuração SFTP "${configId}" não encontrada.`);
  }

  if (!config.host || !config.usuario) {
    throw new Error('Host e Usuário SFTP são obrigatórios para sincronização.');
  }

  // Cria log de execução
  const log = await prisma.sftpJobLog.create({
    data: {
      configId: config.id,
      tipo,
      status: 'EM_ANDAMENTO',
      mensagem: `Sincronização iniciada via ${tipo}...`,
    },
  });

  const client = new SftpClient();
  let baixados = 0;
  let processados = 0;
  const lotesCriados: string[] = [];

  try {
    const localDir = path.resolve(process.cwd(), config.pastaLocal || 'storage/sftp/getnet');
    await fs.mkdir(localDir, { recursive: true });

    await client.connect({
      host: config.host,
      port: config.porta || 22,
      username: config.usuario,
      password: config.senha || undefined,
      readyTimeout: 30000,
    });

    const remoteDir = config.pastaRemota?.trim() || '/';
    const remoteItems = await client.list(remoteDir);
    const targetFiles = remoteItems.filter(
      (f) => f.type === '-' && (f.name.endsWith('.txt') || f.name.toLowerCase().includes('getnet'))
    );

    for (const item of targetFiles) {
      const localFilePath = path.join(localDir, item.name);

      // Download via streaming buffer compatível com IBM Sterling Mailbox / Getnet
      let buffer: Buffer;
      try {
        buffer = (await client.get(item.name)) as Buffer;
      } catch {
        const remoteFilePath = remoteDir === '/' ? item.name : `${remoteDir.replace(/\/$/, '')}/${item.name}`;
        buffer = (await client.get(remoteFilePath)) as Buffer;
      }

      await fs.writeFile(localFilePath, buffer);
      baixados++;

      // Se autoProcessar estiver ativo, decodifica com o getnet-edi-parser e persiste ambos os lotes
      if (config.autoProcessar) {
        const fileContent = buffer.toString('latin1');
        const resProc = await processarConteudoEdiGetnet(fileContent, item.name, undefined, prisma);
        processados++;
        if (resProc.loteVendasId) lotesCriados.push(resProc.loteVendasId);
        if (resProc.loteRecebiveisId) lotesCriados.push(resProc.loteRecebiveisId);
      }
    }

    await client.end();

    const msg = `Sincronização concluída com sucesso: ${baixados} arquivos baixados e ${processados} processados.`;

    // Atualiza log
    await prisma.sftpJobLog.update({
      where: { id: log.id },
      data: {
        status: 'SUCESSO',
        finalizadoEm: new Date(),
        arquivosEncontrados: targetFiles.length,
        arquivosBaixados: baixados,
        arquivosProcessados: processados,
        mensagem: msg,
        detalhes: { lotesCriados },
      },
    });

    // Atualiza status da configuração
    await prisma.sftpConfig.update({
      where: { id: config.id },
      data: {
        ultimoStatus: 'SUCESSO',
        ultimoDownload: new Date(),
        ultimaMensagem: msg,
      },
    });

    return {
      success: true,
      arquivosBaixados: baixados,
      arquivosProcessados: processados,
      mensagem: msg,
    };
  } catch (err: unknown) {
    try { await client.end(); } catch { /* ignore */ }
    const errorMsg = err instanceof Error ? err.message : 'Erro na sincronização SFTP';

    await prisma.sftpJobLog.update({
      where: { id: log.id },
      data: {
        status: 'ERRO',
        finalizadoEm: new Date(),
        mensagem: `Falha na sincronização: ${errorMsg}`,
      },
    });

    await prisma.sftpConfig.update({
      where: { id: config.id },
      data: {
        ultimoStatus: 'ERRO',
        ultimaMensagem: errorMsg,
      },
    });

    throw err;
  }
}

/**
 * Registra ou atualiza o agendamento em background via croner
 */
export function registerSftpScheduler(
  configId: string,
  horarioExecucao: string,
  ativo: boolean,
  prisma: PrismaClient
) {
  // Cancela job existente se houver
  const existing = activeJobs.get(configId);
  if (existing) {
    existing.stop();
    activeJobs.delete(configId);
  }

  if (!ativo) {
    return;
  }

  const cronPattern = timeToCronExpression(horarioExecucao);
  const job = new Cron(cronPattern, { timezone: 'America/Sao_Paulo' }, async () => {
    try {
      console.log(`[SFTP Scheduler] Disparando download diário agendado para "${configId}"...`);
      await runSftpSync(configId, 'AGENDADO', prisma);
      console.log(`[SFTP Scheduler] Execução diária para "${configId}" concluída.`);
    } catch (err) {
      console.error(`[SFTP Scheduler] Erro na execução agendada para "${configId}":`, err);
    }
  });

  activeJobs.set(configId, job);
  console.log(`[SFTP Scheduler] Agendamento diário registrado para "${configId}" no horário ${horarioExecucao} (cron: ${cronPattern}).`);
}

/**
 * Inicializa os agendadores ativos ao iniciar o servidor
 */
export async function initSftpSchedulers(prisma: PrismaClient) {
  try {
    const configs = await prisma.sftpConfig.findMany({
      where: { ativo: true },
    });

    for (const conf of configs) {
      registerSftpScheduler(conf.id, conf.horarioExecucao, conf.ativo, prisma);
    }
  } catch (err) {
    console.error('[SFTP Scheduler] Falha ao inicializar schedulers:', err);
  }
}

/**
 * Processa o conteúdo de um arquivo EDI Getnet e cria os DOIS lotes (VENDAS e RECEBÍVEIS)
 * com idempotência e precisão matemática.
 */
export async function processarConteudoEdiGetnet(
  fileContent: string,
  fileName: string,
  userId?: string,
  prismaClient?: PrismaClient
): Promise<{ loteVendasId?: string; loteRecebiveisId?: string; vendasCount: number; recebiveisCount: number }> {
  const db = prismaClient || prisma;
  const ediResult = parseGetnetEdiFile(fileContent, fileName);
  const dataInicio = ediResult.header?.dataMovimento || new Date().toISOString().substring(0, 10);
  const dataFim = ediResult.header?.dataMovimento || new Date().toISOString().substring(0, 10);

  let loteVendasId: string | undefined;
  let loteRecebiveisId: string | undefined;

  // 1. Lote de Vendas (CVs)
  if (ediResult.vendas.length > 0) {
    let loteVendas = await db.adquirenteLote.findFirst({
      where: { arquivo: fileName, gateway: 'GETNET', tipo: 'VENDAS' },
    });

    if (!loteVendas) {
      loteVendas = await db.adquirenteLote.create({
        data: {
          arquivo: fileName,
          gateway: 'GETNET',
          tipo: 'VENDAS',
          dataInicio: new Date(`${dataInicio}T00:00:00`),
          dataFim: new Date(`${dataFim}T23:59:59`),
          importadoPor: userId,
          adicionadas: ediResult.vendas.length,
          ignoradas: 0,
        },
      });
    } else {
      await db.adquirenteLote.update({
        where: { id: loteVendas.id },
        data: { adicionadas: ediResult.vendas.length },
      });
    }

    loteVendasId = loteVendas.id;

    const vendasData = ediResult.vendas.map((v) => ({
      idempotencyKey:   v.idempotencyKey,
      loteId:           loteVendas!.id,
      gateway:          v.gateway,
      ec:               v.ec,
      cnpj:             v.cnpj,
      bandeira:         v.bandeira,
      bandeiraBruta:    v.bandeiraBruta,
      modalidade:       v.modalidade,
      formaPagamento:   v.formaPagamento,
      dataHoraVenda:    new Date(v.dataHoraVenda),
      status:           v.status,
      parcelas:         v.parcelas,
      dataPrimeiroPgto: v.dataPrimeiroPgto ? new Date(v.dataPrimeiroPgto) : null,
      cartaoMascarado:  v.cartaoMascarado,
      autorizacao:      v.autorizacao,
      nsu:              v.nsu,
      terminal:         v.terminal,
      meioCaptura:      v.meioCaptura,
      valorBruto:       v.valorBruto,
      valorTaxa:        v.valorTaxa,
      valorLiquido:     v.valorLiquido,
    }));

    await db.adquirenteVenda.createMany({
      data: vendasData,
      skipDuplicates: true,
    });
  }

  // 2. Lote de Recebíveis (RVs / Previsões / Liquidações)
  if (ediResult.recebiveis.length > 0) {
    let loteRecebiveis = await db.adquirenteLote.findFirst({
      where: { arquivo: fileName, gateway: 'GETNET', tipo: 'RECEBIVEIS' },
    });

    if (!loteRecebiveis) {
      loteRecebiveis = await db.adquirenteLote.create({
        data: {
          arquivo: fileName,
          gateway: 'GETNET',
          tipo: 'RECEBIVEIS',
          dataInicio: new Date(`${dataInicio}T00:00:00`),
          dataFim: new Date(`${dataFim}T23:59:59`),
          importadoPor: userId,
          adicionadas: ediResult.recebiveis.length,
          ignoradas: 0,
        },
      });
    } else {
      await db.adquirenteLote.update({
        where: { id: loteRecebiveis.id },
        data: { adicionadas: ediResult.recebiveis.length },
      });
    }

    loteRecebiveisId = loteRecebiveis.id;

    const recData = ediResult.recebiveis.map((r) => ({
      idempotencyKey:  r.idempotencyKey,
      loteId:          loteRecebiveis!.id,
      gateway:         r.gateway,
      ec:              r.ec,
      ecCentralizador: r.ecCentralizador,
      cnpj:            r.cnpj,
      dataVencimento:  new Date(`${r.dataVencimento}T00:00:00`),
      bandeira:        r.bandeira,
      modalidade:      r.modalidade,
      tipoLancamento:  r.tipoLancamento,
      lancamento:      r.lancamento,
      valorLiquido:    r.valorLiquido,
      valorLiquidado:  r.valorLiquidado,
      dataVenda:       r.dataVenda ? new Date(`${r.dataVenda}T00:00:00`) : null,
      valorVenda:      r.valorVenda,
      descontos:       r.descontos,
      parcelasInfo:    r.parcelasInfo,
    }));

    await db.adquirenteRecebivel.createMany({
      data: recData,
      skipDuplicates: true,
    });

    const recKeys = recData.map(r => r.idempotencyKey);
    await db.adquirenteRecebivel.updateMany({
      where: { idempotencyKey: { in: recKeys } },
      data: { loteId: loteRecebiveisId },
    });
  }

  return {
    loteVendasId,
    loteRecebiveisId,
    vendasCount: ediResult.vendas.length,
    recebiveisCount: ediResult.recebiveis.length,
  };
}

/**
 * Reprocessa arquivos EDI existentes localmente (em storage/sftp/getnet ou docs/conciliacao/getnet/extratos)
 */
export async function reprocessarArquivosLocais(fileNames?: string[], prismaClient?: PrismaClient) {
  const db = prismaClient || prisma;
  const dirs = [
    path.resolve(process.cwd(), 'storage/sftp/getnet'),
    path.resolve(process.cwd(), '../../docs/conciliacao/getnet/extratos'),
    path.resolve(process.cwd(), 'docs/conciliacao/getnet/extratos'),
  ];

  const processed: Array<{ file: string; vendas: number; recebiveis: number; loteVendasId?: string; loteRecebiveisId?: string }> = [];

  for (const dir of dirs) {
    try {
      const files = await fs.readdir(dir);
      const textFiles = files.filter(f => f.endsWith('.txt') && (f.includes('getnetextr') || f.includes('getnet')));
      for (const f of textFiles) {
        if (fileNames && !fileNames.includes(f)) continue;
        if (processed.some(p => p.file === f)) continue;

        const fullPath = path.join(dir, f);
        const content = await fs.readFile(fullPath, 'latin1');
        const res = await processarConteudoEdiGetnet(content, f, undefined, db);
        processed.push({
          file: f,
          vendas: res.vendasCount,
          recebiveis: res.recebiveisCount,
          loteVendasId: res.loteVendasId,
          loteRecebiveisId: res.loteRecebiveisId,
        });
      }
    } catch {
      // dir doesn't exist, ignore
    }
  }

  return processed;
}
