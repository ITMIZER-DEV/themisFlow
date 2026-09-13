import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Prisma } from '@prisma/client';

const dashboardQuerySchema = z.object({
  mes:         z.string().regex(/^\d{4}-\d{2}$/).optional(),
  dataInicio:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dataFim:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  gateway:     z.string().optional(),
  modalidade:  z.string().optional(),
  bandeira:    z.string().optional(),
});

const drilldownQuerySchema = dashboardQuerySchema.extend({
  tipo:        z.enum(['VENDAS', 'RECEBIDOS', 'TARIFAS', 'PREVISAO', 'DIVERGENCIAS']).default('VENDAS'),
  dia:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  statusConc:  z.string().optional(),
  page:        z.coerce.number().int().min(1).default(1),
  limit:       z.coerce.number().int().min(1).max(200).default(50),
});

function resolvePeriod(mes?: string, dataInicio?: string, dataFim?: string) {
  if (dataInicio && dataFim) {
    return {
      isoInicio: dataInicio,
      isoFim:    dataFim,
      dateInicio: new Date(`${dataInicio}T00:00:00`),
      dateFim:    new Date(`${dataFim}T23:59:59.999`),
    };
  }

  const m = mes || '2026-05'; // default para maio/2026 se não especificado
  const [anoStr, mesStr] = m.split('-');
  const ano = parseInt(anoStr, 10);
  const mesNum = parseInt(mesStr, 10);
  const ultimoDia = new Date(ano, mesNum, 0).getDate();

  const isoInicio = `${m}-01`;
  const isoFim    = `${m}-${String(ultimoDia).padStart(2, '0')}`;

  return {
    isoInicio,
    isoFim,
    dateInicio: new Date(`${isoInicio}T00:00:00`),
    dateFim:    new Date(`${isoFim}T23:59:59.999`),
  };
}

const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
  const pre = [fastify.authenticate];

  // ── GET /api/dashboard/gerencial ─────────────────────────────────
  fastify.get<{ Querystring: unknown }>('/gerencial', { preHandler: pre }, async (req, reply) => {
    const q = dashboardQuerySchema.safeParse(req.query);
    if (!q.success) return reply.status(400).send({ success: false, error: q.error.message });

    const { mes, dataInicio, dataFim, gateway, modalidade, bandeira } = q.data;
    const { isoInicio, isoFim, dateInicio, dateFim } = resolvePeriod(mes, dataInicio, dataFim);

    // Filtro para vendas
    const whereVendas: any = {
      dataHoraVenda: { gte: dateInicio, lte: dateFim },
      status: 'APROVADA',
    };
    if (gateway)    whereVendas.gateway    = gateway;
    if (modalidade) whereVendas.modalidade = modalidade;
    if (bandeira)   whereVendas.bandeira   = bandeira;

    // Filtro para recebíveis / pagamentos (dataVencimento = data do crédito na conta)
    const whereRecebiveis: any = {
      dataVencimento: { gte: dateInicio, lte: dateFim },
    };
    if (gateway)    whereRecebiveis.gateway    = gateway;
    if (modalidade) whereRecebiveis.modalidade = modalidade;
    if (bandeira)   whereRecebiveis.bandeira   = bandeira;

    // 1. Agregações de Vendas
    const [vendasAgg, totalVendasCount] = await Promise.all([
      fastify.prisma.adquirenteVenda.aggregate({
        where: whereVendas,
        _sum: {
          valorBruto:   true,
          valorTaxa:    true,
          valorLiquido: true,
        },
      }),
      fastify.prisma.adquirenteVenda.count({ where: whereVendas }),
    ]);

    const vendasBrutas  = Number(vendasAgg._sum.valorBruto  ?? 0);
    const vendasTaxas   = Math.abs(Number(vendasAgg._sum.valorTaxa ?? 0));
    const vendasLiquidas = Number(vendasAgg._sum.valorLiquido ?? 0);
    const ticketMedio   = totalVendasCount > 0 ? Math.round((vendasBrutas / totalVendasCount) * 100) / 100 : 0;
    const taxaMdrMedia  = vendasBrutas > 0 ? Math.round((vendasTaxas / vendasBrutas) * 10000) / 100 : 0;

    // 2. Agregações de Recebíveis / Pagamentos Efetivos
    const [recebiveisVendaAgg, tarifasAgg] = await Promise.all([
      fastify.prisma.adquirenteRecebivel.aggregate({
        where: { ...whereRecebiveis, tipoLancamento: 'VENDA' },
        _sum: {
          valorVenda:     true,
          descontos:       true,
          valorLiquidado: true,
        },
        _count: { _all: true },
      }),
      fastify.prisma.adquirenteRecebivel.aggregate({
        where: { ...whereRecebiveis, tipoLancamento: 'ALUGUEL/TARIFA' },
        _sum: {
          valorLiquidado: true,
          descontos:       true,
        },
        _count: { _all: true },
      }),
    ]);

    const totalRecebidoBruto   = Number(recebiveisVendaAgg._sum.valorVenda ?? 0);
    const totalDescontosMdr    = Math.abs(Number(recebiveisVendaAgg._sum.descontos ?? 0));
    const totalRecebidoLiquido = Number(recebiveisVendaAgg._sum.valorLiquidado ?? 0);
    const totalTarifasAluguel  = Math.abs(Number(tarifasAgg._sum.valorLiquidado ?? 0));
    const countLiquidacoes     = recebiveisVendaAgg._count._all;
    const countTarifas         = tarifasAgg._count._all;

    // 3. Projeção Futura (A Receber)
    const futuroAgg = await fastify.prisma.adquirenteVenda.aggregate({
      where: {
        status: 'APROVADA',
        dataPrimeiroPgto: { gt: dateFim },
        ...(gateway    && { gateway }),
        ...(modalidade && { modalidade }),
        ...(bandeira   && { bandeira }),
      },
      _sum: { valorLiquido: true },
      _count: { _all: true },
    });
    const totalAReceber = Number(futuroAgg._sum.valorLiquido ?? 0);

    // 4. Status de Conciliação SITEF
    const statusVendas = await fastify.prisma.adquirenteVenda.groupBy({
      by: ['statusConc'],
      where: whereVendas,
      _count: { idempotencyKey: true },
    });
    const concCount = statusVendas.find(s => s.statusConc === 'CONCILIADO')?._count.idempotencyKey ?? 0;
    const taxaConciliacaoSitef = totalVendasCount > 0
      ? Math.round((concCount / totalVendasCount) * 10000) / 100
      : 0;

    // 5. Agrupamento por Origem (Gateway / Credenciadora)
    const [origensVenda, origensRecebivel] = await Promise.all([
      fastify.prisma.adquirenteVenda.groupBy({
        by: ['gateway'],
        where: whereVendas,
        _sum: { valorBruto: true, valorTaxa: true, valorLiquido: true },
        _count: { idempotencyKey: true },
      }),
      fastify.prisma.adquirenteRecebivel.groupBy({
        by: ['gateway'],
        where: { ...whereRecebiveis, tipoLancamento: 'VENDA' },
        _sum: { valorVenda: true, descontos: true, valorLiquidado: true },
        _count: { _all: true },
      }),
    ]);

    const porOrigemMap = new Map<string, {
      gateway: string;
      vendasBrutas: number;
      vendasLiquidas: number;
      vendasQtd: number;
      totalRecebido: number;
      descontosMdr: number;
      tarifasAluguel: number;
      taxaMdrMedia: number;
      participacaoPct: number;
    }>();

    for (const ov of origensVenda) {
      const g = ov.gateway;
      const vb = Number(ov._sum.valorBruto ?? 0);
      const vt = Math.abs(Number(ov._sum.valorTaxa ?? 0));
      const vl = Number(ov._sum.valorLiquido ?? 0);
      const part = vendasBrutas > 0 ? Math.round((vb / vendasBrutas) * 10000) / 100 : 0;
      const mdr = vb > 0 ? Math.round((vt / vb) * 10000) / 100 : 0;

      porOrigemMap.set(g, {
        gateway: g,
        vendasBrutas: vb,
        vendasLiquidas: vl,
        vendasQtd: ov._count.idempotencyKey,
        totalRecebido: 0,
        descontosMdr: 0,
        tarifasAluguel: 0,
        taxaMdrMedia: mdr,
        participacaoPct: part,
      });
    }

    for (const or_ of origensRecebivel) {
      const g = or_.gateway;
      const rec = Number(or_._sum.valorLiquidado ?? 0);
      const desc = Math.abs(Number(or_._sum.descontos ?? 0));
      const entry = porOrigemMap.get(g) ?? {
        gateway: g,
        vendasBrutas: 0,
        vendasLiquidas: 0,
        vendasQtd: 0,
        totalRecebido: 0,
        descontosMdr: 0,
        tarifasAluguel: 0,
        taxaMdrMedia: 0,
        participacaoPct: 0,
      };
      entry.totalRecebido = rec;
      entry.descontosMdr  = desc;
      porOrigemMap.set(g, entry);
    }

    // Atribuir tarifas aos gateways
    const tarifasPorGateway = await fastify.prisma.adquirenteRecebivel.groupBy({
      by: ['gateway'],
      where: { ...whereRecebiveis, tipoLancamento: 'ALUGUEL/TARIFA' },
      _sum: { valorLiquidado: true },
    });
    for (const tg of tarifasPorGateway) {
      const entry = porOrigemMap.get(tg.gateway);
      if (entry) {
        entry.tarifasAluguel = Math.abs(Number(tg._sum.valorLiquidado ?? 0));
      }
    }

    const porOrigem = Array.from(porOrigemMap.values()).sort((a, b) => b.vendasBrutas - a.vendasBrutas);

    // 6. Agrupamento por Modalidade
    const porModalidadeRaw = await fastify.prisma.adquirenteVenda.groupBy({
      by: ['modalidade'],
      where: whereVendas,
      _sum: { valorBruto: true, valorTaxa: true, valorLiquido: true },
      _count: { idempotencyKey: true },
    });
    const porModalidade = porModalidadeRaw.map(m => {
      const bruto = Number(m._sum.valorBruto ?? 0);
      const taxa  = Math.abs(Number(m._sum.valorTaxa ?? 0));
      return {
        modalidade:      m.modalidade,
        totalBruto:      bruto,
        totalTaxa:       taxa,
        totalLiquido:    Number(m._sum.valorLiquido ?? 0),
        qtd:             m._count.idempotencyKey,
        taxaMdrMedia:    bruto > 0 ? Math.round((taxa / bruto) * 10000) / 100 : 0,
        participacaoPct: vendasBrutas > 0 ? Math.round((bruto / vendasBrutas) * 10000) / 100 : 0,
      };
    }).sort((a, b) => b.totalBruto - a.totalBruto);

    // 7. Agrupamento por Bandeira
    const porBandeiraRaw = await fastify.prisma.adquirenteVenda.groupBy({
      by: ['bandeira'],
      where: whereVendas,
      _sum: { valorBruto: true, valorLiquido: true },
      _count: { idempotencyKey: true },
    });
    const porBandeira = porBandeiraRaw.map(b => ({
      bandeira:        b.bandeira,
      totalBruto:      Number(b._sum.valorBruto ?? 0),
      totalLiquido:    Number(b._sum.valorLiquido ?? 0),
      qtd:             b._count.idempotencyKey,
      participacaoPct: vendasBrutas > 0 ? Math.round((Number(b._sum.valorBruto ?? 0) / vendasBrutas) * 10000) / 100 : 0,
    })).sort((a, b) => b.totalBruto - a.totalBruto);

    // 8. Fluxo Diário Temporal (Timeline para o Gráfico)
    const gwFilter = gateway ? Prisma.sql`AND "gateway" = ${gateway}` : Prisma.empty;

    // Agrupa vendas por dia
    const vendasPorDia = await fastify.prisma.$queryRaw<Array<{ dia: string; total: string; count: number }>>`
      SELECT TO_CHAR("dataHoraVenda", 'YYYY-MM-DD') as dia,
             SUM("valorBruto")::text as total,
             COUNT(*)::int as count
      FROM "AdquirenteVenda"
      WHERE "dataHoraVenda" >= ${dateInicio} AND "dataHoraVenda" <= ${dateFim}
        AND "status" = 'APROVADA'
        ${gwFilter}
      GROUP BY dia
      ORDER BY dia ASC
    `;

    // Agrupa recebimentos por dia
    const recebidosPorDia = await fastify.prisma.$queryRaw<Array<{ dia: string; total: string; count: number }>>`
      SELECT TO_CHAR("dataVencimento", 'YYYY-MM-DD') as dia,
             SUM("valorLiquidado")::text as total,
             COUNT(*)::int as count
      FROM "AdquirenteRecebivel"
      WHERE "dataVencimento" >= ${dateInicio} AND "dataVencimento" <= ${dateFim}
        AND "tipoLancamento" = 'VENDA'
        ${gwFilter}
      GROUP BY dia
      ORDER BY dia ASC
    `;

    // Agrupa previsões por dia
    const previsaoPorDia = await fastify.prisma.$queryRaw<Array<{ dia: string; total: string; count: number }>>`
      SELECT TO_CHAR("dataPrimeiroPgto", 'YYYY-MM-DD') as dia,
             SUM("valorLiquido")::text as total,
             COUNT(*)::int as count
      FROM "AdquirenteVenda"
      WHERE "dataPrimeiroPgto" >= ${dateInicio} AND "dataPrimeiroPgto" <= ${dateFim}
        AND "status" = 'APROVADA'
        ${gwFilter}
      GROUP BY dia
      ORDER BY dia ASC
    `;

    const diasMap = new Map<string, { data: string; vendas: number; recebido: number; previsto: number }>();
    for (const v of vendasPorDia) {
      diasMap.set(v.dia, { data: v.dia, vendas: parseFloat(v.total) || 0, recebido: 0, previsto: 0 });
    }
    for (const r of recebidosPorDia) {
      const e = diasMap.get(r.dia) ?? { data: r.dia, vendas: 0, recebido: 0, previsto: 0 };
      e.recebido = parseFloat(r.total) || 0;
      diasMap.set(r.dia, e);
    }
    for (const p of previsaoPorDia) {
      const e = diasMap.get(p.dia) ?? { data: p.dia, vendas: 0, recebido: 0, previsto: 0 };
      e.previsto = parseFloat(p.total) || 0;
      diasMap.set(p.dia, e);
    }
    const fluxoDiario = Array.from(diasMap.values()).sort((a, b) => a.data.localeCompare(b.data));

    // 9. Auditoria de Tarifas Administrativas & Detecção de Duplicidade
    const todasTarifas = await fastify.prisma.adquirenteRecebivel.findMany({
      where: {
        ...whereRecebiveis,
        tipoLancamento: 'ALUGUEL/TARIFA',
      },
      orderBy: { dataVencimento: 'asc' },
    });

    const tarifasAudit: Array<{
      id: string;
      gateway: string;
      ec: string;
      dataVencimento: string;
      lancamento: string;
      valor: number;
      duplicada: boolean;
      motivoDuplicidade?: string;
    }> = [];

    // Detector de duplicidades: agrupa por gateway + lancamento + mes
    const countsMap = new Map<string, number>();
    for (const t of todasTarifas) {
      const key = `${t.gateway}::${(t.lancamento || '').trim().toLowerCase()}`;
      countsMap.set(key, (countsMap.get(key) ?? 0) + 1);
    }

    for (const t of todasTarifas) {
      const key = `${t.gateway}::${(t.lancamento || '').trim().toLowerCase()}`;
      const ocorrencias = countsMap.get(key) ?? 1;
      const duplicada = ocorrencias > 1;

      tarifasAudit.push({
        id: t.idempotencyKey,
        gateway: t.gateway,
        ec: t.ec,
        dataVencimento: t.dataVencimento.toISOString().slice(0, 10),
        lancamento: t.lancamento,
        valor: Math.abs(Number(t.valorLiquidado)),
        duplicada,
        motivoDuplicidade: duplicada
          ? `Cobrança recorrente detectada ${ocorrencias}x no mesmo período para a mesma descrição.`
          : undefined,
      });
    }

    const alertas = {
      tarifasDuplicadas: tarifasAudit.filter(t => t.duplicada).length,
      totalTarifasCobrado: totalTarifasAluguel,
      transacoesSemSitef: statusVendas.find(s => s.statusConc === 'SEM_SITEF')?._count.idempotencyKey ?? 0,
      transacoesDivergentes: statusVendas.find(s => s.statusConc === 'DIVERGENTE')?._count.idempotencyKey ?? 0,
    };

    return reply.send({
      success: true,
      periodo: {
        mes: mes || '2026-05',
        dataInicio: isoInicio,
        dataFim:    isoFim,
      },
      kpis: {
        vendasBrutas,
        vendasLiquidas,
        vendasTaxas,
        qtdVendas: totalVendasCount,
        ticketMedio,
        taxaMdrMedia,
        totalRecebidoBruto,
        totalRecebidoLiquido,
        totalDescontosMdr,
        totalTarifasAluguel,
        countLiquidacoes,
        countTarifas,
        totalAReceber,
        taxaConciliacaoSitef,
      },
      porOrigem,
      porModalidade,
      porBandeira,
      fluxoDiario,
      tarifasAudit,
      alertas,
    });
  });

  // ── GET /api/dashboard/drilldown ─────────────────────────────────
  fastify.get<{ Querystring: unknown }>('/drilldown', { preHandler: pre }, async (req, reply) => {
    const q = drilldownQuerySchema.safeParse(req.query);
    if (!q.success) return reply.status(400).send({ success: false, error: q.error.message });

    const { tipo, mes, dataInicio, dataFim, gateway, modalidade, bandeira, dia, statusConc, page, limit } = q.data;
    const { dateInicio, dateFim } = resolvePeriod(mes, dataInicio, dataFim);
    const skip = (page - 1) * limit;

    // Se o usuário clicou em um dia específico do gráfico
    const diaDateRange = dia ? {
      gte: new Date(`${dia}T00:00:00`),
      lte: new Date(`${dia}T23:59:59.999`),
    } : {
      gte: dateInicio,
      lte: dateFim,
    };

    if (tipo === 'VENDAS') {
      const where: any = {
        dataHoraVenda: diaDateRange,
        status: 'APROVADA',
      };
      if (gateway)    where.gateway    = gateway;
      if (modalidade) where.modalidade = modalidade;
      if (bandeira)   where.bandeira   = bandeira;
      if (statusConc) where.statusConc = statusConc;

      const [total, rows] = await Promise.all([
        fastify.prisma.adquirenteVenda.count({ where }),
        fastify.prisma.adquirenteVenda.findMany({
          where,
          orderBy: { dataHoraVenda: 'desc' },
          skip,
          take: limit,
        }),
      ]);

      return reply.send({
        success: true,
        tipo,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        rows: rows.map(r => ({
          id:             r.idempotencyKey,
          dataHora:       r.dataHoraVenda.toISOString(),
          gateway:        r.gateway,
          ec:             r.ec,
          nsu:            r.nsu,
          autorizacao:    r.autorizacao,
          cartao:         r.cartaoMascarado,
          bandeira:       r.bandeira,
          modalidade:     r.modalidade,
          formaPagamento: r.formaPagamento,
          valorBruto:     Number(r.valorBruto),
          valorTaxa:      Number(r.valorTaxa),
          valorLiquido:   Number(r.valorLiquido),
          statusConc:     r.statusConc,
          terminal:       r.terminal,
        })),
      });
    }

    if (tipo === 'RECEBIDOS') {
      const where: any = {
        dataVencimento: diaDateRange,
        tipoLancamento: 'VENDA',
      };
      if (gateway)    where.gateway    = gateway;
      if (modalidade) where.modalidade = modalidade;
      if (bandeira)   where.bandeira   = bandeira;
      if (statusConc) where.statusConc = statusConc;

      const [total, rows] = await Promise.all([
        fastify.prisma.adquirenteRecebivel.count({ where }),
        fastify.prisma.adquirenteRecebivel.findMany({
          where,
          orderBy: { dataVencimento: 'desc' },
          skip,
          take: limit,
        }),
      ]);

      return reply.send({
        success: true,
        tipo,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        rows: rows.map(r => ({
          id:             r.idempotencyKey,
          dataVencimento: r.dataVencimento.toISOString().slice(0, 10),
          dataVenda:      r.dataVenda?.toISOString().slice(0, 10) ?? null,
          gateway:        r.gateway,
          ec:             r.ec,
          nsu:            r.nsu,
          autorizacao:    r.autorizacao,
          lancamento:     r.lancamento,
          bandeira:       r.bandeira,
          modalidade:     r.modalidade,
          valorBruto:     Number(r.valorVenda ?? 0),
          descontos:      Number(r.descontos ?? 0),
          valorLiquidado: Number(r.valorLiquidado),
          statusConc:     r.statusConc,
          terminal:       r.terminal,
          parcelasInfo:   r.parcelasInfo,
        })),
      });
    }

    if (tipo === 'TARIFAS') {
      const where: any = {
        dataVencimento: diaDateRange,
        tipoLancamento: 'ALUGUEL/TARIFA',
      };
      if (gateway) where.gateway = gateway;

      const [total, rows] = await Promise.all([
        fastify.prisma.adquirenteRecebivel.count({ where }),
        fastify.prisma.adquirenteRecebivel.findMany({
          where,
          orderBy: { dataVencimento: 'desc' },
          skip,
          take: limit,
        }),
      ]);

      return reply.send({
        success: true,
        tipo,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        rows: rows.map(r => ({
          id:             r.idempotencyKey,
          dataVencimento: r.dataVencimento.toISOString().slice(0, 10),
          gateway:        r.gateway,
          ec:             r.ec,
          lancamento:     r.lancamento,
          bandeira:       r.bandeira,
          modalidade:     r.modalidade,
          valorLiquidado: Number(r.valorLiquidado),
          statusConc:     r.statusConc,
        })),
      });
    }

    if (tipo === 'PREVISAO') {
      const where: any = {
        dataPrimeiroPgto: diaDateRange,
        status: 'APROVADA',
      };
      if (gateway)    where.gateway    = gateway;
      if (modalidade) where.modalidade = modalidade;
      if (bandeira)   where.bandeira   = bandeira;

      const [total, rows] = await Promise.all([
        fastify.prisma.adquirenteVenda.count({ where }),
        fastify.prisma.adquirenteVenda.findMany({
          where,
          orderBy: { dataPrimeiroPgto: 'asc' },
          skip,
          take: limit,
        }),
      ]);

      return reply.send({
        success: true,
        tipo,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        rows: rows.map(r => ({
          id:             r.idempotencyKey,
          dataVencimento: r.dataPrimeiroPgto?.toISOString().slice(0, 10) ?? '',
          dataVenda:      r.dataHoraVenda.toISOString().slice(0, 10),
          gateway:        r.gateway,
          ec:             r.ec,
          nsu:            r.nsu,
          autorizacao:    r.autorizacao,
          bandeira:       r.bandeira,
          modalidade:     r.modalidade,
          valorBruto:     Number(r.valorBruto),
          valorTaxa:      Number(r.valorTaxa),
          valorLiquidado: Number(r.valorLiquido),
          statusConc:     r.statusConc,
        })),
      });
    }

    if (tipo === 'DIVERGENCIAS') {
      const where: any = {
        dataHoraVenda: diaDateRange,
        statusConc: 'DIVERGENTE',
      };
      if (gateway)    where.gateway    = gateway;
      if (modalidade) where.modalidade = modalidade;
      if (bandeira)   where.bandeira   = bandeira;

      const [total, rows] = await Promise.all([
        fastify.prisma.adquirenteVenda.count({ where }),
        fastify.prisma.adquirenteVenda.findMany({
          where,
          orderBy: { dataHoraVenda: 'desc' },
          skip,
          take: limit,
        }),
      ]);

      return reply.send({
        success: true,
        tipo,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        rows: rows.map(r => ({
          id:             r.idempotencyKey,
          dataHora:       r.dataHoraVenda.toISOString(),
          gateway:        r.gateway,
          ec:             r.ec,
          nsu:            r.nsu,
          bandeira:       r.bandeira,
          modalidade:     r.modalidade,
          valorBruto:     Number(r.valorBruto),
          valorTaxa:      Number(r.valorTaxa),
          valorLiquido:   Number(r.valorLiquido),
          statusConc:     r.statusConc,
        })),
      });
    }

    return reply.status(400).send({ success: false, error: 'Tipo de drilldown inválido' });
  });
};

export default dashboardRoutes;
