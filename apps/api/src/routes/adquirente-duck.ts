import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { rastreiaTransacao } from '@themisflow/core';
import type { DuckVenda, DuckSitef } from '../plugins/duckdb.js';

// Reutiliza o mesmo schema do rastreio original
const rastreioQuerySchema = z.object({
  gateway:        z.string().optional(),
  loteId:         z.string().optional(),
  bandeira:       z.string().optional(),
  modalidade:     z.string().optional(),
  statusConc:     z.string().optional(),
  tipoLancamento: z.string().optional(),
  dataInicio:     z.string().optional(),
  dataFim:        z.string().optional(),
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const adquirenteDuckRoutes: FastifyPluginAsync = async (fastify) => {
  const pre = [fastify.authenticate];

  // ── GET /api/adquirente/rastreio-duck ─────────────────────────────
  //
  // Drop-in do /rastreio com DuckDB fazendo a cascade de SITEF.
  //
  // O que muda vs o original:
  //   • fastify.duck.matchSitef() substitui os Maps JS de busca SITEF
  //   • _perf incluído na resposta para comparação de tempos
  //
  // O que permanece igual:
  //   • Todas as queries Prisma (sem alteração)
  //   • Lógica de recebiveis NSU-first
  //   • rastreiaTransacao() para divergências campo a campo
  //   • Shape de resposta idêntico ao original
  fastify.get<{ Querystring: unknown }>('/rastreio-duck', { preHandler: pre }, async (req, reply) => {
    const q = rastreioQuerySchema.safeParse(req.query);
    if (!q.success) return reply.status(400).send({ success: false, error: q.error.message });

    const { gateway, loteId, bandeira, modalidade, statusConc,
            dataInicio, dataFim, page, limit } = q.data;

    const whereVenda = {
      ...(gateway    && { gateway }),
      ...(loteId     && { loteId }),
      ...(bandeira   && { bandeira }),
      ...(modalidade && { modalidade }),
      ...(statusConc && { statusConc }),
      ...(dataInicio && dataFim && {
        dataHoraVenda: {
          gte: new Date(dataInicio),
          lte: new Date(dataFim + 'T23:59:59'),
        },
      }),
    };

    // ── Prisma: count + paginação (idêntico ao original) ─────────────
    const tPrisma0 = performance.now();

    const [total, concContagem] = await Promise.all([
      fastify.prisma.adquirenteVenda.count({ where: whereVenda }),
      fastify.prisma.adquirenteVenda.groupBy({
        by:    ['statusConc'],
        where: whereVenda,
        _count: { idempotencyKey: true },
      }),
    ]);

    const vendas = await fastify.prisma.adquirenteVenda.findMany({
      where:   whereVenda,
      orderBy: { dataHoraVenda: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
    });

    if (vendas.length === 0) {
      return reply.send({
        success: true, total, page, limit,
        resumoConc: concContagem, transacoes: [],
        _perf: { note: 'Sem vendas na página' },
      });
    }

    const nsus        = [...new Set(vendas.map(v => v.nsu).filter(Boolean))] as string[];
    const autorizacoes = [...new Set(vendas.map(v => v.autorizacao).filter(Boolean))] as string[];
    const sitefKeys   = vendas.map(v => v.sitefKey).filter(Boolean) as string[];

    const dataSitefInicio = dataInicio ?? vendas[vendas.length - 1].dataHoraVenda.toISOString().slice(0, 10);
    const dataSitefFim    = dataFim    ?? vendas[0].dataHoraVenda.toISOString().slice(0, 10);

    // Mesmas queries batch do original (3 em paralelo)
    const [sitefPorKey, sitefAdHoc, recebiveis] = await Promise.all([
      sitefKeys.length > 0
        ? fastify.prisma.sitefTransacao.findMany({
            where:  { idempotencyKey: { in: sitefKeys } },
            select: {
              idempotencyKey: true, nsu: true, nsuHost: true, autorizacao: true,
              terminalLogico: true, valor: true, dataDia: true,
              estadoTransacao: true, tipoProduto: true, nrParcelas: true,
            },
          })
        : Promise.resolve([]),
      (nsus.length > 0 || autorizacoes.length > 0)
        ? fastify.prisma.sitefTransacao.findMany({
            where: {
              dataDia: { gte: dataSitefInicio, lte: dataSitefFim },
              OR: [
                ...(nsus.length > 0         ? [{ nsuHost:     { in: nsus } }]         : []),
                ...(autorizacoes.length > 0  ? [{ autorizacao: { in: autorizacoes } }] : []),
              ],
            },
            select: {
              idempotencyKey: true, nsu: true, nsuHost: true, autorizacao: true,
              terminalLogico: true, valor: true, dataDia: true,
              estadoTransacao: true, tipoProduto: true, nrParcelas: true,
            },
          })
        : Promise.resolve([]),
      (nsus.length > 0 || autorizacoes.length > 0)
        ? fastify.prisma.adquirenteRecebivel.findMany({
            where: {
              ...(gateway && { gateway }),
              OR: [
                ...(nsus.length > 0         ? [{ nsu:        { in: nsus } }]         : []),
                ...(autorizacoes.length > 0  ? [{ autorizacao: { in: autorizacoes } }] : []),
              ],
            },
            select: {
              idempotencyKey: true, nsu: true, autorizacao: true, gateway: true,
              valorLiquido: true, parcelasInfo: true, tipoLancamento: true,
              dataVencimento: true, bandeira: true, modalidade: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const tPrismaMs = Math.round(performance.now() - tPrisma0);

    // Pool SITEF consolidado (sitefPorKey sobrescreve ad-hoc — mais confiável)
    const sitefPool = new Map<string, typeof sitefPorKey[0]>();
    for (const s of sitefAdHoc)  sitefPool.set(s.idempotencyKey, s);
    for (const s of sitefPorKey) sitefPool.set(s.idempotencyKey, s);

    // ── DuckDB: cascade SITEF match ───────────────────────────────────
    // Substitui os Maps JS + loop de busca do original.
    // Ganha relevância em páginas grandes ou quando o pool SITEF é extenso.
    const tDuck0 = performance.now();

    const duckVendas: DuckVenda[] = vendas.map(v => ({
      idempotencyKey: v.idempotencyKey,
      nsu:            v.nsu,
      autorizacao:    v.autorizacao,
      terminal:       v.terminal,
      valorBruto:     Number(v.valorBruto),
      parcelas:       v.parcelas,
      sitefKey:       v.sitefKey,
    }));

    const duckSitef: DuckSitef[] = [...sitefPool.values()].map(s => ({
      idempotencyKey: s.idempotencyKey,
      nsuHost:        s.nsuHost,
      nsu:            s.nsu,
      autorizacao:    s.autorizacao,
      terminalLogico: s.terminalLogico,
      valor:          Number(s.valor),
    }));

    const matches   = await fastify.duck.matchSitef(duckVendas, duckSitef);
    const matchMap  = new Map(matches.map(m => [m.vendaKey, m]));
    const tDuckMs   = Math.round(performance.now() - tDuck0);

    // ── Recebiveis NSU-first (inalterado) ─────────────────────────────
    type RecebivelItem = (typeof recebiveis)[number];
    const recByNsu         = new Map<string, RecebivelItem[]>();
    const recByAutorizacao = new Map<string, RecebivelItem[]>();
    for (const r of (recebiveis as RecebivelItem[])) {
      if (r.nsu) {
        if (!recByNsu.has(r.nsu)) recByNsu.set(r.nsu, []);
        recByNsu.get(r.nsu)!.push(r);
      }
      if (r.autorizacao) {
        if (!recByAutorizacao.has(r.autorizacao)) recByAutorizacao.set(r.autorizacao, []);
        recByAutorizacao.get(r.autorizacao)!.push(r);
      }
    }

    // ── Monta resultado (shape idêntico ao /rastreio original) ────────
    const transacoes = vendas.map(v => {
      const duckMatch = matchMap.get(v.idempotencyKey);
      const sitef     = duckMatch?.sitefKey ? (sitefPool.get(duckMatch.sitefKey) ?? null) : null;

      // NSU-first para recebiveis
      const recsPorNsu = v.nsu ? (recByNsu.get(v.nsu) ?? []) : [];
      const recsVenda  = recsPorNsu.length > 0
        ? recsPorNsu
        : (v.autorizacao ? (recByAutorizacao.get(v.autorizacao) ?? []) : []);

      // rastreiaTransacao() permanece — contém toda a lógica de divergências
      const analise = rastreiaTransacao(
        {
          idempotencyKey: v.idempotencyKey,
          nsu:            v.nsu            ?? '',
          autorizacao:    v.autorizacao    ?? '',
          terminal:       v.terminal       ?? '',
          valorBruto:     Number(v.valorBruto),
          valorLiquido:   Number(v.valorLiquido),
          parcelas:       v.parcelas,
        },
        sitef ? {
          idempotencyKey: sitef.idempotencyKey,
          nsu:            sitef.nsu,
          nsuHost:        sitef.nsuHost,
          autorizacao:    sitef.autorizacao    ?? '',
          terminalLogico: sitef.terminalLogico ?? '',
          valor:          Number(sitef.valor),
        } : null,
        recsVenda.map(r => ({
          idempotencyKey: r.idempotencyKey,
          nsu:            r.nsu,
          autorizacao:    r.autorizacao,
          valorLiquido:   Number(r.valorLiquido),
          parcelasInfo:   r.parcelasInfo ?? null,
        })),
      );

      return {
        idempotencyKey:  v.idempotencyKey,
        gateway:         v.gateway,
        bandeira:        v.bandeira,
        modalidade:      v.modalidade,
        dataHoraVenda:   v.dataHoraVenda.toISOString(),
        nsu:             v.nsu,
        autorizacao:     v.autorizacao,
        terminal:        v.terminal,
        cartaoMascarado: v.cartaoMascarado,
        valorBruto:      Number(v.valorBruto),
        valorTaxa:       Number(v.valorTaxa),
        valorLiquido:    Number(v.valorLiquido),
        parcelas:        v.parcelas,
        statusConc:      v.statusConc,
        meioCaptura:     v.meioCaptura,

        sitef: sitef ? {
          idempotencyKey: sitef.idempotencyKey,
          nsu:            sitef.nsu,
          nsuHost:        sitef.nsuHost,
          autorizacao:    sitef.autorizacao,
          terminalLogico: sitef.terminalLogico,
          valor:          Number(sitef.valor),
          dataDia:        sitef.dataDia,
          estadoTransacao: sitef.estadoTransacao,
          tipoProduto:    sitef.tipoProduto,
          nrParcelas:     sitef.nrParcelas,
        } : null,

        recebiveis: recsVenda.map(r => ({
          idempotencyKey: r.idempotencyKey,
          nsu:            r.nsu,
          autorizacao:    r.autorizacao,
          dataVencimento: r.dataVencimento.toISOString().slice(0, 10),
          valorLiquido:   Number(r.valorLiquido),
          tipoLancamento: r.tipoLancamento,
          parcelasInfo:   r.parcelasInfo,
          bandeira:       r.bandeira,
          modalidade:     r.modalidade,
        })),

        statusTriplo: analise.statusTriplo,
        matchVia:     duckMatch?.matchVia ?? analise.matchVia,
        divergencias: analise.divergencias,
      };
    });

    return reply.send({
      success: true,
      total,
      page,
      limit,
      resumoConc: concContagem,
      transacoes,
      // Métricas de desempenho para comparação — remover em produção se preferir
      _perf: {
        prismaMsTotalQueries: tPrismaMs,
        duckMsCascadeMatch:   tDuckMs,
        registros: {
          vendas:      vendas.length,
          sitef:       sitefPool.size,
          recebiveis:  recebiveis.length,
        },
      },
    });
  });

  // ── POST /api/adquirente/lotes/:loteId/conciliar-duck ─────────────
  //
  // Drop-in do /conciliar com DuckDB fazendo o cascade match analítico.
  //
  // O que muda vs o original:
  //   • conciliaAdquirenteComSitef() (JS loop O(n×m)) → DuckDB SQL multi-core
  //   • _perf por fase: fetch Prisma / cascade DuckDB / update Prisma
  //
  // Para lotes de 10k+ transações, o cascade DuckDB é ordens de grandeza
  // mais rápido que o loop JS equivalente.
  fastify.post<{ Params: { loteId: string } }>(
    '/lotes/:loteId/conciliar-duck',
    { preHandler: pre },
    async (req, reply) => {
      const { loteId } = req.params;

      const lote = await fastify.prisma.adquirenteLote.findUnique({ where: { id: loteId } });
      if (!lote) return reply.status(404).send({ success: false, error: 'Lote não encontrado' });
      if (lote.tipo !== 'VENDAS') {
        return reply.status(400).send({
          success: false,
          error:   'Conciliação só disponível para lotes do tipo VENDAS',
        });
      }

      const isoInicio = lote.dataInicio.toISOString().slice(0, 10);
      const isoFim    = lote.dataFim.toISOString().slice(0, 10);

      // ── Fase 1: Fetch Prisma (inalterado) ────────────────────────
      const tFetch0 = performance.now();
      const [vendas, sitefTxs] = await Promise.all([
        fastify.prisma.adquirenteVenda.findMany({ where: { loteId } }),
        fastify.prisma.sitefTransacao.findMany({
          where: {
            estadoTransacao: 'EFETIVADA',
            dataDia:         { gte: isoInicio, lte: isoFim },
          },
          select: {
            idempotencyKey: true, nsu: true, nsuHost: true, autorizacao: true,
            terminalLogico: true, valor: true, dataDia: true,
          },
        }),
      ]);
      const tFetchMs = Math.round(performance.now() - tFetch0);

      // ── Fase 2: DuckDB cascade match ─────────────────────────────
      const tDuck0 = performance.now();

      const duckVendas: DuckVenda[] = vendas.map(v => ({
        idempotencyKey: v.idempotencyKey,
        nsu:            v.nsu,
        autorizacao:    v.autorizacao,
        terminal:       v.terminal,
        valorBruto:     Number(v.valorBruto),
        parcelas:       v.parcelas,
      }));

      const duckSitef: DuckSitef[] = sitefTxs.map(s => ({
        idempotencyKey: s.idempotencyKey,
        nsuHost:        s.nsuHost,
        nsu:            s.nsu,
        autorizacao:    s.autorizacao,
        terminalLogico: s.terminalLogico,
        valor:          Number(s.valor),
      }));

      const resultado = await fastify.duck.conciliar(duckVendas, duckSitef);
      const tDuckMs   = Math.round(performance.now() - tDuck0);

      // ── Resumo (inclui SEM_ADQ: registros SITEF sem par Getnet) ──
      const vendaKeysMatched = new Set(resultado.filter(r => r.sitefKey !== null).map(r => r.sitefKey));
      const resumo = {
        conciliados: resultado.filter(r => r.statusConc === 'CONCILIADO').length,
        divergentes: resultado.filter(r => r.statusConc === 'DIVERGENTE').length,
        semSitef:    resultado.filter(r => r.statusConc === 'SEM_SITEF').length,
        semAdq:      sitefTxs.filter(s => !vendaKeysMatched.has(s.idempotencyKey)).length,
      };

      // ── Fase 3: Persistência (Promise.all — mesmo do original) ───
      // Para lotes maiores, considerar UPDATE ... FROM VALUES via $executeRaw.
      const tUpdate0 = performance.now();
      await Promise.all(
        resultado.map(rv =>
          fastify.prisma.adquirenteVenda.update({
            where: { idempotencyKey: rv.vendaKey },
            data: {
              statusConc: rv.statusConc as 'CONCILIADO' | 'DIVERGENTE' | 'SEM_SITEF',
              sitefKey:   rv.sitefKey,
            },
          }),
        ),
      );
      const tUpdateMs = Math.round(performance.now() - tUpdate0);

      return reply.send({
        success: true,
        loteId,
        periodo:  { dataInicio: isoInicio, dataFim: isoFim },
        resumo,
        _perf: {
          prismaMsFetch:      tFetchMs,
          duckMsCascadeMatch: tDuckMs,
          prismaMsUpdate:     tUpdateMs,
          totalMs:            tFetchMs + tDuckMs + tUpdateMs,
          registros: {
            vendas: vendas.length,
            sitef:  sitefTxs.length,
          },
        },
      });
    },
  );
};

export default adquirenteDuckRoutes;
