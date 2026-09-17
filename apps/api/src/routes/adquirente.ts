import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import pg from 'pg';
import { conciliaAdquirenteComSitef, rastreiaTransacao } from '@themisflow/core';

const { Client: PgClient } = pg;

// Helper para criar intervalo de datas respeitando o dia local inteiro
function dateRangeCondition(dataInicio?: string, dataFim?: string) {
  if (!dataInicio && !dataFim) return undefined;
  const cond: { gte?: Date; lte?: Date } = {};
  if (dataInicio) {
    cond.gte = new Date(`${dataInicio}T00:00:00`);
  }
  if (dataFim) {
    cond.lte = new Date(`${dataFim}T23:59:59.999`);
  }
  return cond;
}

// ── Schemas Zod ───────────────────────────────────────────────────

const vendaSchema = z.object({
  idempotencyKey:   z.string().min(1),
  gateway:          z.string().min(1),
  ec:               z.string().min(1),
  cnpj:             z.string().default(''),
  bandeira:         z.string().min(1),
  bandeiraBruta:    z.string().default(''),
  modalidade:       z.string().min(1),
  formaPagamento:   z.string().default(''),
  dataHoraVenda:    z.string().min(1),
  status:           z.string().default('APROVADA'),
  parcelas:         z.number().int().min(1).default(1),
  dataPrimeiroPgto: z.string().nullable().optional(),
  cartaoMascarado:  z.string().default(''),
  autorizacao:      z.string().default(''),
  nsu:              z.string().min(1),
  terminal:         z.string().default(''),
  meioCaptura:      z.string().default(''),
  valorBruto:       z.number(),
  valorTaxa:        z.number(),
  valorLiquido:     z.number(),
});

const recebivelSchema = z.object({
  idempotencyKey:  z.string().min(1),
  gateway:         z.string().min(1),
  ec:              z.string().min(1),
  ecCentralizador: z.string().default(''),
  cnpj:            z.string().default(''),
  dataVencimento:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bandeira:        z.string().min(1),
  modalidade:      z.string().min(1),
  tipoLancamento:  z.string().min(1),
  lancamento:      z.string().default(''),
  valorLiquido:    z.number(),
  valorLiquidado:  z.number(),
  cartaoMascarado: z.string().nullable().optional(),
  autorizacao:     z.string().nullable().optional(),
  nsu:             z.string().nullable().optional(),
  terminal:        z.string().nullable().optional(),
  dataVenda:       z.string().nullable().optional(),
  horaVenda:       z.string().nullable().optional(),
  valorVenda:      z.number().nullable().optional(),
  descontos:       z.number().nullable().optional(),
  parcelasInfo:    z.string().nullable().optional(),
});

const importLoteSchema = z.object({
  arquivo:    z.string().min(1),
  gateway:    z.string().min(1),
  tipo:       z.enum(['VENDAS', 'RECEBIVEIS', 'AMBOS']),
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dataFim:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vendas:     z.array(vendaSchema).optional(),
  recebiveis: z.array(recebivelSchema).optional(),
});

const vendasQuerySchema = z.object({
  gateway:    z.string().optional(),
  loteId:     z.string().optional(),
  bandeira:   z.string().optional(),
  modalidade: z.string().optional(),
  status:     z.string().optional(),
  statusConc: z.string().optional(),
  meioCaptura: z.string().optional(),
  dataInicio: z.string().optional(),
  dataFim:    z.string().optional(),
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

const recebiveisQuerySchema = z.object({
  gateway:        z.string().optional(),
  loteId:         z.string().optional(),
  bandeira:       z.string().optional(),
  modalidade:     z.string().optional(),
  tipoLancamento: z.string().optional(),
  statusConc:     z.string().optional(),
  dataInicio:     z.string().optional(),
  dataFim:        z.string().optional(),
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

const kpiQuerySchema = z.object({
  gateway:    z.string().optional(),
  dataInicio: z.string().optional(),
  dataFim:    z.string().optional(),
  contratoId: z.string().optional(),
});

const resumoQuerySchema = z.object({
  gateway:    z.string().optional(),
  loteId:     z.string().optional(),
  bandeira:   z.string().optional(),
  modalidade: z.string().optional(),
  statusConc: z.string().optional(),
  dataInicio: z.string().optional(),
  dataFim:    z.string().optional(),
});

const previsaoQuerySchema = z.object({
  gateway:    z.string().optional(),
  dataInicio: z.string().optional(),
  dataFim:    z.string().optional(),
  dias:       z.coerce.number().int().min(1).max(365).default(90),
  origem:     z.enum(['AUTO', 'VENDAS', 'RECEBIVEIS']).default('AUTO'),
});

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

// ── Rotas ─────────────────────────────────────────────────────────

const adquirenteRoutes: FastifyPluginAsync = async (fastify) => {
  const pre      = [fastify.authenticate];
  const preAdmin = [fastify.requireAdmin];

  // ── POST /api/adquirente/lotes — importar lote ───────────────────
  fastify.post<{ Body: unknown }>('/lotes', { preHandler: pre }, async (req, reply) => {
    const parsed = importLoteSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.message });
    }

    const { arquivo, gateway, tipo, dataInicio, dataFim, vendas, recebiveis } = parsed.data;
    const userId = req.user.id;

    if (tipo === 'VENDAS' && (!vendas || vendas.length === 0)) {
      return reply.status(400).send({ success: false, error: 'tipo VENDAS requer lista "vendas" não vazia' });
    }
    if (tipo === 'RECEBIVEIS' && (!recebiveis || recebiveis.length === 0)) {
      return reply.status(400).send({ success: false, error: 'tipo RECEBIVEIS requer lista "recebiveis" não vazia' });
    }

    const lote = await fastify.prisma.adquirenteLote.create({
      data: {
        gateway,
        tipo,
        arquivo,
        dataInicio: new Date(dataInicio),
        dataFim:    new Date(dataFim),
        importadoPor: userId,
      },
    });

    let adicionadas = 0;
    let atualizadas = 0;

    if (tipo === 'VENDAS' && vendas) {
      const keys = vendas.map(v => v.idempotencyKey);
      const existing = await fastify.prisma.adquirenteVenda.findMany({
        where: { idempotencyKey: { in: keys } },
        select: { idempotencyKey: true },
      });
      const existingSet = new Set(existing.map(e => e.idempotencyKey));

      const novas      = vendas.filter(v => !existingSet.has(v.idempotencyKey));
      const existentes = vendas.filter(v =>  existingSet.has(v.idempotencyKey));

      if (novas.length > 0) {
        const r = await fastify.prisma.adquirenteVenda.createMany({
          skipDuplicates: true,
          data: novas.map(v => ({
            idempotencyKey:   v.idempotencyKey,
            loteId:           lote.id,
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
          })),
        });
        adicionadas = r.count;
      }

      if (existentes.length > 0) {
        await fastify.prisma.$transaction(
          existentes.map(v => fastify.prisma.adquirenteVenda.update({
            where: { idempotencyKey: v.idempotencyKey },
            data: {
              loteId:           lote.id,
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
              terminal:         v.terminal,
              meioCaptura:      v.meioCaptura,
              valorBruto:       v.valorBruto,
              valorTaxa:        v.valorTaxa,
              valorLiquido:     v.valorLiquido,
            },
          }))
        );
        atualizadas = existentes.length;
      }
    }

    if (tipo === 'RECEBIVEIS' && recebiveis) {
      const keys = recebiveis.map(r => r.idempotencyKey);
      const existing = await fastify.prisma.adquirenteRecebivel.findMany({
        where: { idempotencyKey: { in: keys } },
        select: { idempotencyKey: true },
      });
      const existingSet = new Set(existing.map(e => e.idempotencyKey));

      const novas      = recebiveis.filter(r => !existingSet.has(r.idempotencyKey));
      const existentes = recebiveis.filter(r =>  existingSet.has(r.idempotencyKey));

      if (novas.length > 0) {
        const res = await fastify.prisma.adquirenteRecebivel.createMany({
          skipDuplicates: true,
          data: novas.map(r => ({
            idempotencyKey:  r.idempotencyKey,
            loteId:          lote.id,
            gateway:         r.gateway,
            ec:              r.ec,
            ecCentralizador: r.ecCentralizador,
            cnpj:            r.cnpj,
            dataVencimento:  new Date(r.dataVencimento),
            bandeira:        r.bandeira,
            modalidade:      r.modalidade,
            tipoLancamento:  r.tipoLancamento,
            lancamento:      r.lancamento,
            valorLiquido:    r.valorLiquido,
            valorLiquidado:  r.valorLiquidado,
            cartaoMascarado: r.cartaoMascarado ?? null,
            autorizacao:     r.autorizacao     ?? null,
            nsu:             r.nsu             ?? null,
            terminal:        r.terminal        ?? null,
            dataVenda:       r.dataVenda       ? new Date(r.dataVenda) : null,
            horaVenda:       r.horaVenda       ?? null,
            valorVenda:      r.valorVenda      ?? null,
            descontos:       r.descontos       ?? null,
            parcelasInfo:    r.parcelasInfo    ?? null,
          })),
        });
        adicionadas = res.count;
      }

      if (existentes.length > 0) {
        await fastify.prisma.$transaction(
          existentes.map(r => fastify.prisma.adquirenteRecebivel.update({
            where: { idempotencyKey: r.idempotencyKey },
            data: {
              loteId:          lote.id,
              dataVencimento:  new Date(r.dataVencimento),
              bandeira:        r.bandeira,
              modalidade:      r.modalidade,
              tipoLancamento:  r.tipoLancamento,
              lancamento:      r.lancamento,
              valorLiquido:    r.valorLiquido,
              valorLiquidado:  r.valorLiquidado,
              cartaoMascarado: r.cartaoMascarado ?? null,
              autorizacao:     r.autorizacao     ?? null,
              nsu:             r.nsu             ?? null,
              terminal:        r.terminal        ?? null,
              dataVenda:       r.dataVenda       ? new Date(r.dataVenda) : null,
              horaVenda:       r.horaVenda       ?? null,
              valorVenda:      r.valorVenda      ?? null,
              descontos:       r.descontos       ?? null,
              parcelasInfo:    r.parcelasInfo    ?? null,
            },
          }))
        );
        atualizadas = existentes.length;
      }
    }

    await fastify.prisma.adquirenteLote.update({
      where: { id: lote.id },
      data:  { adicionadas, ignoradas: atualizadas },
    });

    return reply.status(201).send({ success: true, loteId: lote.id, adicionadas, atualizadas });
  });

  // ── GET /api/adquirente/lotes — lista de lotes ───────────────────
  fastify.get('/lotes', { preHandler: pre }, async (_req, reply) => {
    const lotes = await fastify.prisma.adquirenteLote.findMany({
      orderBy: { importadoEm: 'desc' },
      select: {
        id:          true,
        gateway:     true,
        tipo:        true,
        arquivo:     true,
        dataInicio:  true,
        dataFim:     true,
        importadoEm: true,
        adicionadas: true,
        ignoradas:   true,
        importador:  { select: { nome: true } },
        _count: {
          select: { vendas: true, recebiveis: true },
        },
      },
    });
    return reply.send({ success: true, lotes });
  });

  // ── DELETE /api/adquirente/lotes/:id — remove lote (admin) ───────
  fastify.delete<{ Params: { id: string } }>(
    '/lotes/:id',
    { preHandler: preAdmin },
    async (req, reply) => {
      const { id } = req.params;
      const lote = await fastify.prisma.adquirenteLote.findUnique({ where: { id } });
      if (!lote) return reply.status(404).send({ success: false, error: 'Lote não encontrado' });

      await fastify.prisma.adquirenteVenda.deleteMany({     where: { loteId: id } });
      await fastify.prisma.adquirenteRecebivel.deleteMany({ where: { loteId: id } });
      await fastify.prisma.adquirenteLote.delete({          where: { id } });

      return reply.send({ success: true });
    },
  );

  // ── GET /api/adquirente/lotes/:id/analise — Auditoria e Acurácia do Lote ──
  fastify.get<{ Params: { id: string }; Querystring: unknown }>(
    '/lotes/:id/analise',
    { preHandler: pre },
    async (req, reply) => {
      const { id } = req.params;
      const lote = await fastify.prisma.adquirenteLote.findUnique({
        where: { id },
        include: { importador: { select: { nome: true } } },
      });
      if (!lote) return reply.status(404).send({ success: false, error: 'Lote não encontrado' });

      const query = req.query as { search?: string; page?: string; limit?: string };
      const page = Math.max(1, parseInt(query?.page || '1', 10));
      const limit = Math.min(200, Math.max(1, parseInt(query?.limit || '50', 10)));
      const search = (query?.search || '').trim();
      const skip = (page - 1) * limit;

      if (lote.tipo === 'VENDAS') {
        const agg = await fastify.prisma.adquirenteVenda.aggregate({
          where: { loteId: id },
          _count: { _all: true },
          _sum: { valorBruto: true, valorTaxa: true, valorLiquido: true },
        });

        const totalRegistros = agg._count._all;
        const totalBruto = Number(agg._sum.valorBruto ?? 0);
        const totalTaxa = Math.abs(Number(agg._sum.valorTaxa ?? 0));
        const totalLiquido = Number(agg._sum.valorLiquido ?? 0);
        const diferenca = Math.round((totalBruto - (totalTaxa + totalLiquido)) * 100) / 100;
        const acuraciaBatida = Math.abs(diferenca) <= 0.02;

        const porBandeira = await fastify.prisma.adquirenteVenda.groupBy({
          by: ['bandeira', 'modalidade'],
          where: { loteId: id },
          _count: { _all: true },
          _sum: { valorBruto: true, valorTaxa: true, valorLiquido: true },
        });

        const whereItem: any = { loteId: id };
        if (search) {
          whereItem.OR = [
            { nsu: { contains: search, mode: 'insensitive' } },
            { autorizacao: { contains: search, mode: 'insensitive' } },
            { cartaoMascarado: { contains: search, mode: 'insensitive' } },
            { bandeira: { contains: search, mode: 'insensitive' } },
            { terminal: { contains: search, mode: 'insensitive' } },
          ];
        }

        const [totalFiltrado, itens] = await Promise.all([
          fastify.prisma.adquirenteVenda.count({ where: whereItem }),
          fastify.prisma.adquirenteVenda.findMany({
            where: whereItem,
            orderBy: { dataHoraVenda: 'asc' },
            skip,
            take: limit,
          }),
        ]);

        return reply.send({
          success: true,
          lote: {
            id: lote.id,
            arquivo: lote.arquivo,
            gateway: lote.gateway,
            tipo: lote.tipo,
            dataInicio: lote.dataInicio.toISOString().slice(0, 10),
            dataFim: lote.dataFim.toISOString().slice(0, 10),
            importadoEm: lote.importadoEm.toISOString(),
            importador: lote.importador?.nome,
          },
          auditoria: {
            totalRegistros,
            totalBruto,
            totalTaxa,
            totalLiquido,
            diferenca,
            taxaMediaPct: totalBruto > 0 ? Math.round((totalTaxa / totalBruto) * 10000) / 100 : 0,
            acuraciaBatida,
          },
          porBandeira: porBandeira.map(b => {
            const brt = Number(b._sum.valorBruto ?? 0);
            const tx = Math.abs(Number(b._sum.valorTaxa ?? 0));
            const liq = Number(b._sum.valorLiquido ?? 0);
            return {
              bandeira: b.bandeira,
              modalidade: b.modalidade,
              qtd: b._count._all,
              bruto: brt,
              taxa: tx,
              liquido: liq,
              taxaPct: brt > 0 ? Math.round((tx / brt) * 10000) / 100 : 0,
            };
          }),
          paginacao: {
            page,
            limit,
            total: totalFiltrado,
            totalPages: Math.ceil(totalFiltrado / limit) || 1,
          },
          itens: itens.map(v => ({
            id: v.idempotencyKey,
            dataHora: v.dataHoraVenda.toISOString(),
            nsu: v.nsu,
            autorizacao: v.autorizacao,
            cartao: v.cartaoMascarado,
            bandeira: v.bandeira,
            modalidade: v.modalidade,
            terminal: v.terminal,
            valorBruto: Number(v.valorBruto),
            valorTaxa: Number(v.valorTaxa),
            valorLiquido: Number(v.valorLiquido),
            status: v.status,
            statusConc: v.statusConc,
          })),
        });
      } else {
        const agg = await fastify.prisma.adquirenteRecebivel.aggregate({
          where: { loteId: id },
          _count: { _all: true },
          _sum: { valorVenda: true, descontos: true, valorLiquido: true, valorLiquidado: true },
        });

        const totalRegistros = agg._count._all;
        const totalBruto = Number(agg._sum.valorVenda ?? 0);
        const totalTaxa = Math.abs(Number(agg._sum.descontos ?? 0));
        const totalLiquido = Number(agg._sum.valorLiquido ?? 0);
        const totalLiquidado = Number(agg._sum.valorLiquidado ?? 0);
        const diferenca = Math.round((totalBruto - (totalTaxa + totalLiquido)) * 100) / 100;
        const acuraciaBatida = Math.abs(diferenca) <= 0.02;

        const porBandeira = await fastify.prisma.adquirenteRecebivel.groupBy({
          by: ['bandeira', 'modalidade'],
          where: { loteId: id },
          _count: { _all: true },
          _sum: { valorVenda: true, descontos: true, valorLiquido: true, valorLiquidado: true },
        });

        const whereItem: any = { loteId: id };
        if (search) {
          whereItem.OR = [
            { lancamento: { contains: search, mode: 'insensitive' } },
            { bandeira: { contains: search, mode: 'insensitive' } },
            { modalidade: { contains: search, mode: 'insensitive' } },
            { nsu: { contains: search, mode: 'insensitive' } },
            { tipoLancamento: { contains: search, mode: 'insensitive' } },
          ];
        }

        const [totalFiltrado, itens] = await Promise.all([
          fastify.prisma.adquirenteRecebivel.count({ where: whereItem }),
          fastify.prisma.adquirenteRecebivel.findMany({
            where: whereItem,
            orderBy: { dataVencimento: 'asc' },
            skip,
            take: limit,
          }),
        ]);

        return reply.send({
          success: true,
          lote: {
            id: lote.id,
            arquivo: lote.arquivo,
            gateway: lote.gateway,
            tipo: lote.tipo,
            dataInicio: lote.dataInicio.toISOString().slice(0, 10),
            dataFim: lote.dataFim.toISOString().slice(0, 10),
            importadoEm: lote.importadoEm.toISOString(),
            importador: lote.importador?.nome,
          },
          auditoria: {
            totalRegistros,
            totalBruto,
            totalTaxa,
            totalLiquido,
            totalLiquidado,
            diferenca,
            taxaMediaPct: totalBruto > 0 ? Math.round((totalTaxa / totalBruto) * 10000) / 100 : 0,
            acuraciaBatida,
          },
          porBandeira: porBandeira.map(b => {
            const brt = Number(b._sum.valorVenda ?? 0);
            const tx = Math.abs(Number(b._sum.descontos ?? 0));
            const liq = Number(b._sum.valorLiquido ?? 0);
            const lqd = Number(b._sum.valorLiquidado ?? 0);
            return {
              bandeira: b.bandeira,
              modalidade: b.modalidade,
              qtd: b._count._all,
              bruto: brt,
              taxa: tx,
              liquido: liq,
              liquidado: lqd,
              taxaPct: brt > 0 ? Math.round((tx / brt) * 10000) / 100 : 0,
            };
          }),
          paginacao: {
            page,
            limit,
            total: totalFiltrado,
            totalPages: Math.ceil(totalFiltrado / limit) || 1,
          },
          itens: itens.map(r => ({
            id: r.idempotencyKey,
            dataVencimento: r.dataVencimento.toISOString().slice(0, 10),
            dataVenda: r.dataVenda?.toISOString().slice(0, 10) ?? null,
            tipoLancamento: r.tipoLancamento,
            lancamento: r.lancamento,
            bandeira: r.bandeira,
            modalidade: r.modalidade,
            parcelasInfo: r.parcelasInfo,
            valorBruto: Number(r.valorVenda ?? 0),
            descontos: Number(r.descontos ?? 0),
            valorLiquido: Number(r.valorLiquido),
            valorLiquidado: Number(r.valorLiquidado),
            statusConc: r.statusConc,
          })),
        });
      }
    }
  );

  // ── GET /api/adquirente/vendas — lista com filtros e paginação ───
  fastify.get<{ Querystring: unknown }>('/vendas', { preHandler: pre }, async (req, reply) => {
    const q = vendasQuerySchema.safeParse(req.query);
    if (!q.success) return reply.status(400).send({ success: false, error: q.error.message });

    const { gateway, loteId, bandeira, modalidade, status, statusConc, meioCaptura,
            dataInicio, dataFim, page, limit } = q.data;

    const where = {
      ...(gateway    && { gateway }),
      ...(loteId     && { loteId }),
      ...(bandeira   && { bandeira }),
      ...(modalidade && { modalidade }),
      ...(status     && { status }),
      ...(statusConc && { statusConc }),
      ...(meioCaptura && { meioCaptura }),
      ...((dataInicio || dataFim) && {
        dataHoraVenda: dateRangeCondition(dataInicio, dataFim),
      }),
    };

    const [total, vendas] = await Promise.all([
      fastify.prisma.adquirenteVenda.count({ where }),
      fastify.prisma.adquirenteVenda.findMany({
        where,
        orderBy: { dataHoraVenda: 'desc' },
        skip:    (page - 1) * limit,
        take:    limit,
      }),
    ]);

    return reply.send({ success: true, total, page, limit, vendas });
  });

  // ── GET /api/adquirente/recebiveis — lista com filtros ───────────
  fastify.get<{ Querystring: unknown }>('/recebiveis', { preHandler: pre }, async (req, reply) => {
    const q = recebiveisQuerySchema.safeParse(req.query);
    if (!q.success) return reply.status(400).send({ success: false, error: q.error.message });

    const { gateway, loteId, bandeira, modalidade, tipoLancamento,
            statusConc, dataInicio, dataFim, page, limit } = q.data;

    const where = {
      ...(gateway        && { gateway }),
      ...(loteId         && { loteId }),
      ...(bandeira       && { bandeira }),
      ...(modalidade     && { modalidade }),
      ...(tipoLancamento && { tipoLancamento }),
      ...(statusConc     && { statusConc }),
      ...((dataInicio || dataFim) && {
        dataVencimento: dateRangeCondition(dataInicio, dataFim),
      }),
    };

    const [total, recebiveis] = await Promise.all([
      fastify.prisma.adquirenteRecebivel.count({ where }),
      fastify.prisma.adquirenteRecebivel.findMany({
        where,
        orderBy: { dataVencimento: 'desc' },
        skip:    (page - 1) * limit,
        take:    limit,
      }),
    ]);

    return reply.send({ success: true, total, page, limit, recebiveis });
  });

  // ── GET /api/adquirente/recebiveis/liquidacoes ───────────────────
  // Agrupa PAGAMENTO_REALIZADO por (dataVencimento + bandeira) — usado na conciliação OFX × Adquirente
  fastify.get<{ Querystring: unknown }>('/recebiveis/liquidacoes', { preHandler: pre }, async (req, reply) => {
    const q = z.object({
      gateway:    z.string().optional(),
      dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      dataFim:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).safeParse(req.query);
    if (!q.success) return reply.status(400).send({ success: false, error: q.error.message });

    const { gateway, dataInicio, dataFim } = q.data;

    const where = {
      tipoLancamento: 'PAGAMENTO_REALIZADO',
      ...(gateway && { gateway }),
      ...((dataInicio || dataFim) && {
        dataVencimento: dateRangeCondition(dataInicio, dataFim),
      }),
    };

    const grupos = await fastify.prisma.adquirenteRecebivel.groupBy({
      by:      ['dataVencimento', 'bandeira'],
      where,
      _sum:    { valorLiquido: true },
      _count:  { idempotencyKey: true },
      orderBy: [{ dataVencimento: 'asc' }, { bandeira: 'asc' }],
    });

    const liquidacoes = grupos.map(g => ({
      data:         g.dataVencimento.toISOString().slice(0, 10),
      bandeira:     g.bandeira,
      totalLiquido: Number(g._sum.valorLiquido ?? 0),
      qtdItens:     g._count.idempotencyKey,
    }));

    return reply.send({ success: true, liquidacoes });
  });

  // ── GET /api/adquirente/kpi — indicadores agregados ──────────────
  fastify.get<{ Querystring: unknown }>('/kpi', { preHandler: pre }, async (req, reply) => {
    const q = kpiQuerySchema.safeParse(req.query);
    if (!q.success) return reply.status(400).send({ success: false, error: q.error.message });

    const { gateway, dataInicio, dataFim, contratoId } = q.data;

    const whereVendas = {
      status: 'APROVADA',
      ...(gateway    && { gateway }),
      ...((dataInicio || dataFim) && {
        dataHoraVenda: dateRangeCondition(dataInicio, dataFim),
      }),
    };

    // 1. Agregação por bandeira + modalidade
    const porBandeiraModalidade = await fastify.prisma.adquirenteVenda.groupBy({
      by:    ['bandeira', 'modalidade'],
      where: whereVendas,
      _sum:  { valorBruto: true, valorTaxa: true, valorLiquido: true },
      _count: { idempotencyKey: true },
      orderBy: { _sum: { valorBruto: 'desc' } },
    });

    // 2. Total geral
    const totais = await fastify.prisma.adquirenteVenda.aggregate({
      where:  whereVendas,
      _sum:   { valorBruto: true, valorTaxa: true, valorLiquido: true },
      _count: { idempotencyKey: true },
    });

    // 3. Status de conciliação (vendas)
    const statusConcVendas = await fastify.prisma.adquirenteVenda.groupBy({
      by:     ['statusConc'],
      where:  { ...whereVendas },
      _count: { idempotencyKey: true },
      _sum:   { valorBruto: true },
    });

    // 4. Recebíveis futuros por bandeira (dataVencimento > hoje, tipo VENDA)
    const hoje = new Date().toISOString().slice(0, 10);
    const recebiveisFuturos = await fastify.prisma.adquirenteRecebivel.groupBy({
      by:    ['bandeira', 'modalidade'],
      where: {
        tipoLancamento: 'VENDA',
        dataVencimento: { gt: new Date(hoje) },
        ...(gateway && { gateway }),
      },
      _sum:   { valorLiquido: true },
      _count: { idempotencyKey: true },
      orderBy: { _sum: { valorLiquido: 'desc' } },
    });

    // 5. Opcional: cross com taxas contratadas (se contratoId fornecido)
    let taxasContratadas: Array<{
      tipoPagamento: string; bandeira: string; modalidade: string;
      taxaMdr: unknown; prazoRecebimento: number;
    }> | null = null;

    if (contratoId) {
      taxasContratadas = await fastify.prisma.taxaItem.findMany({
        where:  { contratoId },
        select: { tipoPagamento: true, bandeira: true, modalidade: true,
                  taxaMdr: true, prazoRecebimento: true },
      });
    }

    // Monta resposta com taxa efetiva por bandeira/modalidade
    const taxasEfetivas = porBandeiraModalidade.map(row => {
      const bruto  = Number(row._sum.valorBruto  ?? 0);
      const taxa   = Number(row._sum.valorTaxa   ?? 0);  // negativo
      const taxaEfetivaPct = bruto > 0 ? (Math.abs(taxa) / bruto) * 100 : 0;

      // Busca taxa contratada correspondente (se fornecida)
      const contratada = taxasContratadas?.find(tc =>
        tc.bandeira.toUpperCase() === row.bandeira.toUpperCase() &&
        tc.modalidade.toUpperCase().includes(row.modalidade.toUpperCase()),
      );
      const taxaMdrContratada = contratada ? Number(contratada.taxaMdr) : null;
      const divergenciaPct = taxaMdrContratada != null
        ? taxaEfetivaPct - taxaMdrContratada
        : null;
      const divergenciaReais = taxaMdrContratada != null
        ? (divergenciaPct! / 100) * bruto
        : null;

      return {
        bandeira:           row.bandeira,
        modalidade:         row.modalidade,
        qtdTransacoes:      row._count.idempotencyKey,
        totalBruto:         bruto,
        totalTaxa:          Math.abs(taxa),
        totalLiquido:       Number(row._sum.valorLiquido ?? 0),
        taxaEfetivaPct:     Math.round(taxaEfetivaPct * 10000) / 10000,
        taxaMdrContratada,
        divergenciaPct:     divergenciaPct != null
          ? Math.round(divergenciaPct * 10000) / 10000 : null,
        divergenciaReais:   divergenciaReais != null
          ? Math.round(divergenciaReais * 100) / 100 : null,
      };
    });

    return reply.send({
      success: true,
      periodo: { dataInicio, dataFim },
      gateway,
      totais: {
        qtdTransacoes: totais._count.idempotencyKey,
        totalBruto:    Number(totais._sum.valorBruto  ?? 0),
        totalTaxa:     Math.abs(Number(totais._sum.valorTaxa ?? 0)),
        totalLiquido:  Number(totais._sum.valorLiquido ?? 0),
      },
      taxasEfetivas,
      statusConcVendas,
      recebiveisFuturos,
    });
  });

  // ── GET /api/adquirente/vendas/resumo — KPI agregado p/ filtros ──
  fastify.get<{ Querystring: unknown }>('/vendas/resumo', { preHandler: pre }, async (req, reply) => {
    const q = resumoQuerySchema.safeParse(req.query);
    if (!q.success) return reply.status(400).send({ success: false, error: q.error.message });

    const { gateway, loteId, bandeira, modalidade, statusConc, dataInicio, dataFim } = q.data;

    const where = {
      status: 'APROVADA',
      ...(gateway    && { gateway }),
      ...(loteId     && { loteId }),
      ...(bandeira   && { bandeira }),
      ...(modalidade && { modalidade }),
      ...(statusConc && { statusConc }),
      ...((dataInicio || dataFim) && {
        dataHoraVenda: dateRangeCondition(dataInicio, dataFim),
      }),
    };

    const [porBandeira, totais] = await Promise.all([
      fastify.prisma.adquirenteVenda.groupBy({
        by:    ['bandeira', 'modalidade'],
        where,
        _sum:  { valorBruto: true, valorTaxa: true, valorLiquido: true },
        _count: { idempotencyKey: true },
        orderBy: { _sum: { valorBruto: 'desc' } },
      }),
      fastify.prisma.adquirenteVenda.aggregate({
        where,
        _sum:   { valorBruto: true, valorTaxa: true, valorLiquido: true },
        _count: { idempotencyKey: true },
      }),
    ]);

    const linhas = porBandeira.map(row => {
      const bruto = Number(row._sum.valorBruto ?? 0);
      const taxa  = Math.abs(Number(row._sum.valorTaxa ?? 0));
      return {
        bandeira:       row.bandeira,
        modalidade:     row.modalidade,
        qtd:            row._count.idempotencyKey,
        totalBruto:     bruto,
        totalTaxa:      taxa,
        totalLiquido:   Number(row._sum.valorLiquido ?? 0),
        taxaEfetivaPct: bruto > 0 ? Math.round((taxa / bruto) * 1e6) / 1e4 : 0,
      };
    });

    return reply.send({
      success: true,
      totais: {
        qtd:          totais._count.idempotencyKey,
        totalBruto:   Number(totais._sum.valorBruto  ?? 0),
        totalTaxa:    Math.abs(Number(totais._sum.valorTaxa ?? 0)),
        totalLiquido: Number(totais._sum.valorLiquido ?? 0),
      },
      porBandeira: linhas,
    });
  });

  // ── GET /api/adquirente/previsao — recebíveis futuros por data ───
  fastify.get<{ Querystring: unknown }>('/previsao', { preHandler: pre }, async (req, reply) => {
    const q = previsaoQuerySchema.safeParse(req.query);
    if (!q.success) return reply.status(400).send({ success: false, error: q.error.message });

    const { gateway, dataInicio, dataFim, dias, origem } = q.data;

    const hoje   = new Date();
    const inicio = dataInicio ? new Date(dataInicio) : hoje;
    const fim    = dataFim
      ? new Date(dataFim + 'T23:59:59.999')
      : new Date(hoje.getTime() + dias * 24 * 60 * 60 * 1000);

    const whereRecebivel = {
      dataVencimento: { gte: inicio, lte: fim },
      valorLiquido:   { gt: 0 },
      ...(gateway && { gateway }),
    };

    const whereVenda = {
      dataPrimeiroPgto: { gte: inicio, lte: fim },
      valorLiquido:     { gt: 0 },
      ...(gateway && { gateway }),
    };

    // Decide qual fonte usar
    let usarFonte: 'VENDAS' | 'RECEBIVEIS' = origem === 'VENDAS' ? 'VENDAS' : 'RECEBIVEIS';

    if (origem === 'AUTO') {
      const countRec = await fastify.prisma.adquirenteRecebivel.count({ where: whereRecebivel });
      if (countRec > 0) {
        usarFonte = 'RECEBIVEIS';
      } else {
        usarFonte = 'VENDAS';
      }
    }

    if (usarFonte === 'VENDAS') {
      const porData = await fastify.prisma.adquirenteVenda.groupBy({
        by:    ['dataPrimeiroPgto', 'bandeira', 'modalidade'],
        where: whereVenda,
        _sum:   { valorLiquido: true },
        _count: { idempotencyKey: true },
        orderBy: { dataPrimeiroPgto: 'asc' },
      });

      const totais = await fastify.prisma.adquirenteVenda.aggregate({
        where: whereVenda,
        _sum:   { valorLiquido: true },
        _count: { idempotencyKey: true },
      });

      const porDiaMap = new Map<string, { data: string; total: number; parcelas: number }>();
      for (const row of porData) {
        if (!row.dataPrimeiroPgto) continue;
        const iso = row.dataPrimeiroPgto.toISOString().slice(0, 10);
        const existing = porDiaMap.get(iso) ?? { data: iso, total: 0, parcelas: 0 };
        existing.total   += Number(row._sum.valorLiquido ?? 0);
        existing.parcelas += row._count.idempotencyKey;
        porDiaMap.set(iso, existing);
      }

      return reply.send({
        success: true,
        fonteUtilizada: 'VENDAS',
        periodo: {
          dataInicio: inicio.toISOString().slice(0, 10),
          dataFim:    fim.toISOString().slice(0, 10),
        },
        totais: {
          totalLiquido: Number(totais._sum.valorLiquido ?? 0),
          parcelas:     totais._count.idempotencyKey,
        },
        porDia:     [...porDiaMap.values()],
        detalhes:   porData.filter(row => row.dataPrimeiroPgto != null).map(row => ({
          data:       row.dataPrimeiroPgto!.toISOString().slice(0, 10),
          bandeira:   row.bandeira,
          modalidade: row.modalidade,
          parcelas:   row._count.idempotencyKey,
          total:      Number(row._sum.valorLiquido ?? 0),
        })),
      });
    }

    // Caso RECEBIVEIS (agenda oficial da adquirente)
    const porData = await fastify.prisma.adquirenteRecebivel.groupBy({
      by:    ['dataVencimento', 'bandeira', 'modalidade'],
      where: whereRecebivel,
      _sum:   { valorLiquido: true },
      _count: { idempotencyKey: true },
      orderBy: { dataVencimento: 'asc' },
    });

    const totais = await fastify.prisma.adquirenteRecebivel.aggregate({
      where: whereRecebivel,
      _sum:   { valorLiquido: true },
      _count: { idempotencyKey: true },
    });

    const porDiaMap = new Map<string, { data: string; total: number; parcelas: number }>();
    for (const row of porData) {
      const iso = row.dataVencimento.toISOString().slice(0, 10);
      const existing = porDiaMap.get(iso) ?? { data: iso, total: 0, parcelas: 0 };
      existing.total   += Number(row._sum.valorLiquido ?? 0);
      existing.parcelas += row._count.idempotencyKey;
      porDiaMap.set(iso, existing);
    }

    return reply.send({
      success: true,
      fonteUtilizada: 'RECEBIVEIS',
      periodo: {
        dataInicio: inicio.toISOString().slice(0, 10),
        dataFim:    fim.toISOString().slice(0, 10),
      },
      totais: {
        totalLiquido: Number(totais._sum.valorLiquido ?? 0),
        parcelas:     totais._count.idempotencyKey,
      },
      porDia:     [...porDiaMap.values()],
      detalhes:   porData.map(row => ({
        data:       row.dataVencimento.toISOString().slice(0, 10),
        bandeira:   row.bandeira,
        modalidade: row.modalidade,
        parcelas:   row._count.idempotencyKey,
        total:      Number(row._sum.valorLiquido ?? 0),
      })),
    });
  });

  // ── GET /api/adquirente/rastreio — rastreio analítico triplo ───────
  // Cruza AdquirenteVenda × SitefTransacao × AdquirenteRecebivel
  // e detecta divergências campo a campo por transação.
  // Operações POS sem SITEF são identificadas — SEM_SITEF não é erro automático.
  fastify.get<{ Querystring: unknown }>('/rastreio', { preHandler: pre }, async (req, reply) => {
    const q = rastreioQuerySchema.safeParse(req.query);
    if (!q.success) return reply.status(400).send({ success: false, error: q.error.message });

    const { gateway, loteId, bandeira, modalidade, statusConc,
            tipoLancamento: _tipoFilter, dataInicio, dataFim, page, limit } = q.data;

    const whereVenda = {
      ...(gateway    && { gateway }),
      ...(loteId     && { loteId }),
      ...(bandeira   && { bandeira }),
      ...(modalidade && { modalidade }),
      ...(statusConc && { statusConc }),
      ...((dataInicio || dataFim) && {
        dataHoraVenda: dateRangeCondition(dataInicio, dataFim),
      }),
    };

    // ── Contagens para KPI (sem paginação) ───────────────────────
    const [total, concContagem] = await Promise.all([
      fastify.prisma.adquirenteVenda.count({ where: whereVenda }),
      fastify.prisma.adquirenteVenda.groupBy({
        by:    ['statusConc'],
        where: whereVenda,
        _count: { idempotencyKey: true },
      }),
    ]);

    // ── Página de vendas ─────────────────────────────────────────
    const vendas = await fastify.prisma.adquirenteVenda.findMany({
      where:   whereVenda,
      orderBy: { dataHoraVenda: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
    });

    if (vendas.length === 0) {
      return reply.send({
        success: true, total, page, limit,
        resumoConc: concContagem,
        transacoes: [],
      });
    }

    // ── Coleta chaves para joins ──────────────────────────────────
    const sitefKeys   = vendas.map(v => v.sitefKey).filter(Boolean) as string[];
    const nsus        = [...new Set(vendas.map(v => v.nsu).filter(Boolean))] as string[];
    const autorizacoes = [...new Set(vendas.map(v => v.autorizacao).filter(Boolean))] as string[];

    // Período para busca SITEF ad-hoc (fallback quando sitefKey não existe)
    const dataSitefInicio = dataInicio ?? vendas[vendas.length - 1].dataHoraVenda.toISOString().slice(0, 10);
    const dataSitefFim    = dataFim    ?? vendas[0].dataHoraVenda.toISOString().slice(0, 10);

    // ── Busca SITEF: por sitefKey guardado + ad-hoc por nsuHost/autorizacao ──
    const [sitefPorKey, sitefAdHoc] = await Promise.all([
      sitefKeys.length > 0
        ? fastify.prisma.sitefTransacao.findMany({
            where:  { idempotencyKey: { in: sitefKeys } },
            select: {
              idempotencyKey: true, nsu: true, nsuHost: true,
              autorizacao: true, terminalLogico: true, valor: true,
              dataDia: true, estadoTransacao: true, tipoProduto: true,
              nrParcelas: true,
            },
          })
        : Promise.resolve([]),
      // Ad-hoc: vendas sem sitefKey — tenta achar pelo nsuHost ou autorizacao
      (nsus.length > 0 || autorizacoes.length > 0)
        ? fastify.prisma.sitefTransacao.findMany({
            where: {
              dataDia: { gte: dataSitefInicio, lte: dataSitefFim },
              OR: [
                ...(nsus.length > 0        ? [{ nsuHost:     { in: nsus } }]        : []),
                ...(autorizacoes.length > 0 ? [{ autorizacao: { in: autorizacoes } }] : []),
              ],
            },
            select: {
              idempotencyKey: true, nsu: true, nsuHost: true,
              autorizacao: true, terminalLogico: true, valor: true,
              dataDia: true, estadoTransacao: true, tipoProduto: true,
              nrParcelas: true,
            },
          })
        : Promise.resolve([]),
    ]);

    // Mapa SITEF por idempotencyKey (priority: stored key)
    const sitefMap = new Map<string, typeof sitefPorKey[0]>();
    for (const s of sitefAdHoc)  sitefMap.set(s.idempotencyKey, s);
    for (const s of sitefPorKey) sitefMap.set(s.idempotencyKey, s);   // sobrescreve (mais confiável)

    // Índice ad-hoc para vendas sem sitefKey
    const sitefByNsuHost    = new Map<string, typeof sitefPorKey[0]>();
    const sitefByAutorizacao = new Map<string, typeof sitefPorKey[0]>();
    for (const s of sitefAdHoc) {
      if (s.nsuHost    && !sitefByNsuHost.has(s.nsuHost))       sitefByNsuHost.set(s.nsuHost, s);
      if (s.autorizacao && !sitefByAutorizacao.has(s.autorizacao)) sitefByAutorizacao.set(s.autorizacao, s);
    }

    // ── Busca Recebiveis por NSU ou autorizacao ───────────────────
    const whereRec: Record<string, unknown> = {
      ...(gateway && { gateway }),
      OR: [
        ...(nsus.length > 0         ? [{ nsu:        { in: nsus } }]         : []),
        ...(autorizacoes.length > 0  ? [{ autorizacao: { in: autorizacoes } }] : []),
      ],
    };

    const recebiveis = (nsus.length > 0 || autorizacoes.length > 0)
      ? await fastify.prisma.adquirenteRecebivel.findMany({
          where:  whereRec,
          select: {
            idempotencyKey: true, nsu: true, autorizacao: true, gateway: true,
            valorLiquido: true, parcelasInfo: true, tipoLancamento: true,
            dataVencimento: true, bandeira: true, modalidade: true,
          },
        })
      : [];

    // Índice recebiveis por nsu e por autorizacao
    const recByNsu        = new Map<string, typeof recebiveis>();
    const recByAutorizacao = new Map<string, typeof recebiveis>();
    for (const r of recebiveis) {
      if (r.nsu) {
        if (!recByNsu.has(r.nsu)) recByNsu.set(r.nsu, []);
        recByNsu.get(r.nsu)!.push(r);
      }
      if (r.autorizacao) {
        if (!recByAutorizacao.has(r.autorizacao)) recByAutorizacao.set(r.autorizacao, []);
        recByAutorizacao.get(r.autorizacao)!.push(r);
      }
    }

    // ── Monta rastreio por transação ──────────────────────────────
    const transacoes = vendas.map(v => {
      // Acha SITEF
      let sitef = v.sitefKey ? (sitefMap.get(v.sitefKey) ?? null) : null;
      if (!sitef && v.nsu)        sitef = sitefByNsuHost.get(v.nsu)    ?? null;
      if (!sitef && v.autorizacao) sitef = sitefByAutorizacao.get(v.autorizacao) ?? null;

      // Acha recebiveis: NSU tem prioridade — só cai para autorizacao se NSU não achar nada
      const recSet = new Set<string>();
      const recsVenda: typeof recebiveis = [];
      const recsPorNsu = v.nsu ? (recByNsu.get(v.nsu) ?? []) : [];
      const recsSource = recsPorNsu.length > 0
        ? recsPorNsu
        : (v.autorizacao ? (recByAutorizacao.get(v.autorizacao) ?? []) : []);
      for (const r of recsSource) {
        if (!recSet.has(r.idempotencyKey)) {
          recSet.add(r.idempotencyKey);
          recsVenda.push(r);
        }
      }

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
        // Dados da venda
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

        // SITEF encontrado (pode ser null)
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

        // Recebiveis encontrados
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

        // Análise
        statusTriplo:  analise.statusTriplo,
        matchVia:      analise.matchVia,
        divergencias:  analise.divergencias,
      };
    });

    return reply.send({
      success: true,
      total,
      page,
      limit,
      resumoConc: concContagem,
      transacoes,
    });
  });

  // ── POST /api/adquirente/lotes/:loteId/conciliar ─────────────────
  // Confronta AdquirenteVenda do lote com SitefTransacoes do mesmo período.
  fastify.post<{ Params: { loteId: string } }>(
    '/lotes/:loteId/conciliar',
    { preHandler: pre },
    async (req, reply) => {
      const { loteId } = req.params;

      const lote = await fastify.prisma.adquirenteLote.findUnique({ where: { id: loteId } });
      if (!lote) return reply.status(404).send({ success: false, error: 'Lote não encontrado' });
      if (lote.tipo !== 'VENDAS') {
        return reply.status(400).send({ success: false, error: 'Conciliação só disponível para lotes do tipo VENDAS' });
      }

      // Busca todas as vendas do lote
      const vendas = await fastify.prisma.adquirenteVenda.findMany({ where: { loteId } });

      // Busca transações SITEF efetivadas no mesmo período (dataInicio..dataFim)
      const isoInicio = lote.dataInicio.toISOString().slice(0, 10);
      const isoFim    = lote.dataFim.toISOString().slice(0, 10);

      const sitefTxs = await fastify.prisma.sitefTransacao.findMany({
        where: {
          estadoTransacao: 'EFETIVADA',
          dataDia: { gte: isoInicio, lte: isoFim },
        },
        select: {
          idempotencyKey: true,
          nsu:            true,
          nsuHost:        true,
          autorizacao:    true,
          terminalLogico: true,
          valor:          true,
          dataDia:        true,
        },
      });

      // Roda a engine de conciliação (cascata NSU + autorizacao + terminal)
      const resultado = conciliaAdquirenteComSitef(
        vendas.map(v => ({
          idempotencyKey: v.idempotencyKey,
          nsu:            v.nsu,
          autorizacao:    v.autorizacao ?? '',
          terminal:       v.terminal    ?? '',
          valorBruto:     Number(v.valorBruto),
          dataHoraVenda:  v.dataHoraVenda.toISOString(),
        })),
        sitefTxs.map(s => ({
          idempotencyKey: s.idempotencyKey,
          nsu:            s.nsu,
          nsuHost:        s.nsuHost,
          autorizacao:    s.autorizacao    ?? '',
          terminalLogico: s.terminalLogico ?? '',
          valor:          Number(s.valor),
          dataDia:        s.dataDia,
        })),
      );

      // Persiste resultados nas vendas
      await Promise.all(
        resultado.vendas.map((rv: import('@themisflow/core').ResultVenda) =>
          fastify.prisma.adquirenteVenda.update({
            where: { idempotencyKey: rv.vendaKey },
            data:  { statusConc: rv.status, sitefKey: rv.sitefKey },
          }),
        ),
      );

      return reply.send({
        success: true,
        loteId,
        periodo: { dataInicio: isoInicio, dataFim: isoFim },
        resumo:  resultado.resumo,
      });
    },
  );

  // ── GET /api/adquirente/pagamentos — Controle de Pagamentos Realizados ──
  fastify.get<{ Querystring: unknown }>('/pagamentos', { preHandler: pre }, async (req, reply) => {
    const pagamentosQuerySchema = z.object({
      mes:        z.string().regex(/^\d{4}-\d{2}$/).optional(),
      dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      dataFim:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      gateway:    z.string().optional(),
      tipo:       z.enum(['TODOS', 'LIQUIDACOES', 'TARIFAS', 'PAGAMENTO_REALIZADO']).default('TODOS'),
      bandeira:   z.string().optional(),
      modalidade: z.string().optional(),
      page:       z.coerce.number().int().min(1).default(1),
      limit:      z.coerce.number().int().min(1).max(200).default(50),
    });

    const q = pagamentosQuerySchema.safeParse(req.query);
    if (!q.success) return reply.status(400).send({ success: false, error: q.error.message });

    const { mes, dataInicio, dataFim, gateway, tipo, bandeira, modalidade, page, limit } = q.data;

    let dateInicio: Date;
    let dateFim: Date;
    let isoInicio: string;
    let isoFim: string;

    if (dataInicio && dataFim) {
      isoInicio = dataInicio;
      isoFim = dataFim;
      dateInicio = new Date(`${dataInicio}T00:00:00`);
      dateFim = new Date(`${dataFim}T23:59:59.999`);
    } else {
      const m = mes || '2026-09';
      const [anoStr, mesStr] = m.split('-');
      const ano = parseInt(anoStr, 10);
      const mesNum = parseInt(mesStr, 10);
      const ultimoDia = new Date(ano, mesNum, 0).getDate();
      isoInicio = `${m}-01`;
      isoFim = `${m}-${String(ultimoDia).padStart(2, '0')}`;
      dateInicio = new Date(`${isoInicio}T00:00:00`);
      dateFim = new Date(`${isoFim}T23:59:59.999`);
    }

    const baseWhere: any = {
      dataVencimento: { gte: dateInicio, lte: dateFim },
    };
    if (gateway)    baseWhere.gateway    = gateway;
    if (bandeira)   baseWhere.bandeira   = bandeira;
    if (modalidade) baseWhere.modalidade = modalidade;

    const liqTipos = ['VENDA', 'PAGAMENTO_REALIZADO', 'PREVISAO', 'PAGAMENTO'];

    // 1. Agregações para os KPIs de Liquidação
    const [vendasLiqAgg, tarifasAgg] = await Promise.all([
      fastify.prisma.adquirenteRecebivel.aggregate({
        where: { ...baseWhere, tipoLancamento: { in: liqTipos } },
        _sum: {
          valorVenda:     true,
          descontos:      true,
          valorLiquidado: true,
          valorLiquido:   true,
        },
        _count: { _all: true },
      }),
      fastify.prisma.adquirenteRecebivel.aggregate({
        where: { ...baseWhere, tipoLancamento: { in: ['ALUGUEL/TARIFA', 'TARIFA', 'AJUSTE'] } },
        _sum: {
          valorLiquidado: true,
          descontos:      true,
          valorLiquido:   true,
        },
        _count: { _all: true },
      }),
    ]);

    const totalLiquidadoEfetivo = Number(vendasLiqAgg._sum.valorLiquidado ?? 0);
    const totalLiquidoPrevisto  = Number(vendasLiqAgg._sum.valorLiquido ?? 0);
    const totalRecebido     = totalLiquidadoEfetivo > 0 ? totalLiquidadoEfetivo : totalLiquidoPrevisto;
    const totalBruto        = Number(vendasLiqAgg._sum.valorVenda ?? 0);
    const totalDescontosMdr = Math.abs(Number(vendasLiqAgg._sum.descontos ?? 0));
    const totalTarifas      = Math.abs(Number(tarifasAgg._sum.valorLiquidado ?? 0));
    const countLiquidacoes  = vendasLiqAgg._count._all;
    const countTarifas      = tarifasAgg._count._all;

    // 2. Agrupamento por Origem (Gateway / Credenciadora)
    const porOrigemRaw = await fastify.prisma.adquirenteRecebivel.groupBy({
      by: ['gateway'],
      where: { ...baseWhere, tipoLancamento: { in: liqTipos } },
      _sum: {
        valorVenda:     true,
        descontos:      true,
        valorLiquidado: true,
        valorLiquido:   true,
      },
      _count: { _all: true },
    });

    const tarifasPorOrigem = await fastify.prisma.adquirenteRecebivel.groupBy({
      by: ['gateway'],
      where: { ...baseWhere, tipoLancamento: { in: ['ALUGUEL/TARIFA', 'TARIFA', 'AJUSTE'] } },
      _sum: { valorLiquidado: true },
    });
    const tarifasMap = new Map<string, number>();
    for (const t of tarifasPorOrigem) {
      tarifasMap.set(t.gateway, Math.abs(Number(t._sum.valorLiquidado ?? 0)));
    }

    const porOrigem = porOrigemRaw.map(g => {
      const liqEff = Number(g._sum.valorLiquidado ?? 0);
      const liqPrev = Number(g._sum.valorLiquido ?? 0);
      const liq = liqEff > 0 ? liqEff : liqPrev;
      const brut = Number(g._sum.valorVenda ?? 0);
      const desc = Math.abs(Number(g._sum.descontos ?? 0));
      const tar = tarifasMap.get(g.gateway) ?? 0;
      const part = totalRecebido > 0 ? Math.round((liq / totalRecebido) * 10000) / 100 : 0;
      const mdrPct = brut > 0 ? Math.round((desc / brut) * 10000) / 100 : 0;

      return {
        gateway:        g.gateway,
        count:          g._count._all,
        totalBruto:     brut,
        totalDescontos: desc,
        totalTarifas:   tar,
        totalRecebido:  liq,
        taxaEfetivaPct: mdrPct,
        participacaoPct: part,
      };
    }).sort((a, b) => b.totalRecebido - a.totalRecebido);

    // 3. Auditoria de Tarifas Administrativas & Detecção de Duplicidade
    const tarifas = await fastify.prisma.adquirenteRecebivel.findMany({
      where: { ...baseWhere, tipoLancamento: { in: ['ALUGUEL/TARIFA', 'TARIFA', 'AJUSTE'] } },
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

    const descCount = new Map<string, number>();
    for (const t of tarifas) {
      const key = `${t.gateway}::${(t.lancamento || '').trim().toLowerCase()}`;
      descCount.set(key, (descCount.get(key) ?? 0) + 1);
    }

    for (const t of tarifas) {
      const key = `${t.gateway}::${(t.lancamento || '').trim().toLowerCase()}`;
      const ocs = descCount.get(key) ?? 1;
      const duplicada = ocs > 1;

      tarifasAudit.push({
        id: t.idempotencyKey,
        gateway: t.gateway,
        ec: t.ec,
        dataVencimento: t.dataVencimento.toISOString().slice(0, 10),
        lancamento: t.lancamento,
        valor: Math.abs(Number(t.valorLiquidado)),
        duplicada,
        motivoDuplicidade: duplicada
          ? `Cobrança recorrente detectada ${ocs}x no mesmo mês para a mesma descrição.`
          : undefined,
      });
    }

    // 4. Consulta Analítica Paginada dos Itens
    const itemsWhere: any = { ...baseWhere };
    if (tipo === 'LIQUIDACOES') {
      itemsWhere.tipoLancamento = { in: liqTipos };
    } else if (tipo === 'TARIFAS') {
      itemsWhere.tipoLancamento = { in: ['ALUGUEL/TARIFA', 'TARIFA', 'AJUSTE'] };
    } else if (tipo === 'PAGAMENTO_REALIZADO') {
      itemsWhere.tipoLancamento = { in: ['PAGAMENTO_REALIZADO', 'PAGAMENTO'] };
    }

    const skip = (page - 1) * limit;
    const [totalItems, rows] = await Promise.all([
      fastify.prisma.adquirenteRecebivel.count({ where: itemsWhere }),
      fastify.prisma.adquirenteRecebivel.findMany({
        where: itemsWhere,
        orderBy: { dataVencimento: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return reply.send({
      success: true,
      periodo: {
        mes: mes || '2026-09',
        dataInicio: isoInicio,
        dataFim:    isoFim,
      },
      kpis: {
        totalRecebido,
        totalBruto,
        totalDescontosMdr,
        totalTarifas,
        countLiquidacoes,
        countTarifas,
      },
      porOrigem,
      tarifasAudit,
      paginacao: {
        page,
        limit,
        total: totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
      itens: rows.map(r => ({
        id:             r.idempotencyKey,
        gateway:        r.gateway,
        ec:             r.ec,
        dataVencimento: r.dataVencimento.toISOString().slice(0, 10),
        dataVenda:      r.dataVenda?.toISOString().slice(0, 10) ?? null,
        tipoLancamento: r.tipoLancamento,
        lancamento:     r.lancamento,
        bandeira:       r.bandeira,
        modalidade:     r.modalidade,
        nsu:            r.nsu,
        autorizacao:    r.autorizacao,
        terminal:       r.terminal,
        valorBruto:     Number(r.valorVenda ?? 0),
        descontos:      Number(r.descontos ?? 0),
        valorLiquidado: Number(r.valorLiquidado),
        statusConc:     r.statusConc,
        parcelasInfo:   r.parcelasInfo,
      })),
    });
  });

  // ── GET /api/adquirente/vendas/:key/pagamento ────────────────────
  // Retorna status de pagamento, recebíveis (com valorLiquidado) e
  // previsão de liquidação para uma venda específica por idempotencyKey.
  fastify.get<{ Params: { key: string } }>(
    '/vendas/:key/pagamento',
    { preHandler: pre },
    async (req, reply) => {
      const { key } = req.params;

      const venda = await fastify.prisma.adquirenteVenda.findUnique({
        where: { idempotencyKey: key },
      });
      if (!venda) return reply.status(404).send({ success: false, error: 'Venda não encontrada' });

      // NSU-first: só cai para autorizacao se NSU não achar recebíveis
      let recebiveis: Awaited<ReturnType<typeof fastify.prisma.adquirenteRecebivel.findMany>> = [];

      if (venda.nsu) {
        recebiveis = await fastify.prisma.adquirenteRecebivel.findMany({
          where: { nsu: venda.nsu, gateway: venda.gateway },
          orderBy: { dataVencimento: 'asc' },
        });
      }
      if (recebiveis.length === 0 && venda.autorizacao) {
        recebiveis = await fastify.prisma.adquirenteRecebivel.findMany({
          where: { autorizacao: venda.autorizacao, gateway: venda.gateway },
          orderBy: { dataVencimento: 'asc' },
        });
      }

      const somaLiquidado = recebiveis.reduce((a, r) => a + Number(r.valorLiquidado), 0);
      const somaLiquido   = recebiveis.reduce((a, r) => a + Number(r.valorLiquido),   0);
      const today = new Date(); today.setHours(0, 0, 0, 0);

      let statusPagamento: string;
      if (venda.status === 'CANCELADA') {
        statusPagamento = 'CANCELADA';
      } else if (venda.status === 'CHARGEBACK') {
        statusPagamento = 'CHARGEBACK';
      } else if (recebiveis.length === 0) {
        statusPagamento = 'SEM_RECEBIVEL';
      } else if (somaLiquido > 0 && somaLiquidado >= somaLiquido * 0.99) {
        statusPagamento = 'PAGO';
      } else if (somaLiquidado > 0) {
        statusPagamento = 'PARCIAL';
      } else if (recebiveis.some(r => new Date(r.dataVencimento) <= today)) {
        statusPagamento = 'VENCIDO';
      } else {
        statusPagamento = 'AGUARDANDO';
      }

      return reply.send({
        success: true,
        venda: {
          idempotencyKey:   venda.idempotencyKey,
          nsu:              venda.nsu,
          autorizacao:      venda.autorizacao,
          terminal:         venda.terminal,
          gateway:          venda.gateway,
          bandeira:         venda.bandeira,
          modalidade:       venda.modalidade,
          status:           venda.status,
          parcelas:         venda.parcelas,
          valorBruto:       Number(venda.valorBruto),
          valorTaxa:        Number(venda.valorTaxa),
          valorLiquido:     Number(venda.valorLiquido),
          dataHoraVenda:    venda.dataHoraVenda.toISOString(),
          cartaoMascarado:  venda.cartaoMascarado,
          dataPrimeiroPgto: venda.dataPrimeiroPgto?.toISOString().slice(0, 10) ?? null,
        },
        statusPagamento,
        somaLiquidado,
        somaLiquido,
        recebiveis: recebiveis.map(r => ({
          idempotencyKey: r.idempotencyKey,
          dataVencimento: r.dataVencimento.toISOString().slice(0, 10),
          dataVenda:      r.dataVenda?.toISOString().slice(0, 10) ?? null,
          tipoLancamento: r.tipoLancamento,
          lancamento:     r.lancamento,
          bandeira:       r.bandeira,
          modalidade:     r.modalidade,
          parcelasInfo:   r.parcelasInfo,
          valorLiquido:   Number(r.valorLiquido),
          valorLiquidado: Number(r.valorLiquidado),
          nsu:            r.nsu,
          autorizacao:    r.autorizacao,
        })),
      });
    },
  );

  // ── POST /api/adquirente/cruzamento-erp ──────────────────────────────
  // Cruza AdquirenteVenda (adquirente) × pdv.vendatef (ERP) por NSU/Autorização
  // e devolve matches, somente-adquirente, somente-ERP e divergências de valor.
  fastify.post<{ Body: unknown }>('/cruzamento-erp', { preHandler: pre }, async (req, reply) => {
    const schema = z.object({
      dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      dataFim:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      gateway:    z.string().optional(),
    });
    const q = schema.safeParse(req.body);
    if (!q.success) return reply.status(400).send({ success: false, error: q.error.message });

    const { dataInicio, dataFim, gateway } = q.data;

    // ── 1. Busca vendas da adquirente ────────────────────────────────
    const whereVenda = {
      status: 'APROVADA',
      ...(gateway && { gateway }),
      ...((dataInicio || dataFim) && {
        dataHoraVenda: dateRangeCondition(dataInicio, dataFim),
      }),
    };

    const vendas = await fastify.prisma.adquirenteVenda.findMany({
      where:   whereVenda,
      select: {
        idempotencyKey: true,
        nsu: true,
        autorizacao: true,
        terminal: true,
        bandeira: true,
        modalidade: true,
        parcelas: true,
        valorBruto: true,
        dataHoraVenda: true,
        gateway: true,
      },
      orderBy: { dataHoraVenda: 'asc' },
    });

    // ── 2. Busca vendas TEF do ERP (pdv.vendatef) ────────────────────
    const erpConfig = await fastify.prisma.empresaConfig.findUnique({ where: { id: 'default' } });
    if (!erpConfig?.erpHost || !erpConfig?.erpDatabase || !erpConfig?.erpUsuario) {
      return reply.status(400).send({
        success: false,
        error: 'Banco do ERP não configurado. Configure em Administração → Configuração da Empresa.',
      });
    }

    const erpClient = new PgClient({
      host:     erpConfig.erpHost,
      port:     erpConfig.erpPorta,
      database: erpConfig.erpDatabase,
      user:     erpConfig.erpUsuario,
      password: erpConfig.erpSenha || undefined,
      ssl:      erpConfig.erpSsl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 8000,
      options:  '-c default_transaction_read_only=on',
    });

    let erpRows: Array<{
      id: unknown; nsu: string; nsu_host: string; autorizacao: string;
      valor: number; nomecartao: string; parcelas: number;
      pdv: string; data: string; hora: string;
    }> = [];

    try {
      await erpClient.connect();

      const colsRes = await erpClient.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'pdv' AND table_name = 'vendatef'`,
      );
      const colSet = new Set(colsRes.rows.map((c: { column_name: string }) => c.column_name.toLowerCase()));

      const pdvExpr    = colSet.has('ecf')              ? 'ecf::text as pdv'            : colSet.has('pdv')           ? 'pdv::text as pdv'            : "'1' as pdv";
      const nsuExpr    = colSet.has('nsusitef')          ? 'nsusitef::text as nsu'        : colSet.has('nsu')           ? 'nsu::text as nsu'             : "'' as nsu";
      const nsuHostExpr= colSet.has('nsuhost')           ? 'nsuhost::text as nsu_host'    : colSet.has('nsu_host')      ? 'nsu_host::text as nsu_host'   : "'' as nsu_host";
      const authExpr   = colSet.has('codigoautorizacao') ? 'codigoautorizacao as autorizacao' : colSet.has('autorizacao') ? 'autorizacao'               : "'' as autorizacao";
      const cardExpr   = colSet.has('nomecartao')        ? 'nomecartao'                   : colSet.has('bandeira')      ? 'bandeira as nomecartao'       : "'CARTAO' as nomecartao";
      const parcExpr   = colSet.has('numeroparcela')     ? 'numeroparcela as parcelas'    : colSet.has('parcelas')      ? 'parcelas'                     : '1 as parcelas';
      const statusFilter = colSet.has('id_situacaotef')  ? '(id_situacaotef = 1)'         : '(cancelado IS NULL OR cancelado = FALSE)';

      const erpResult = await erpClient.query(
        `SELECT id, ${pdvExpr}, data::text as data, hora::text as hora,
                ${nsuExpr}, ${nsuHostExpr}, ${authExpr},
                valor::float as valor, ${cardExpr}, ${parcExpr}
         FROM pdv.vendatef
         WHERE ${statusFilter}
           AND ($1::text IS NULL OR data >= $1::date)
           AND ($2::text IS NULL OR data <= $2::date)
         ORDER BY data ASC, hora ASC`,
        [dataInicio || null, dataFim || null],
      );

      erpRows = erpResult.rows;
      await erpClient.end();
    } catch (err: unknown) {
      try { await erpClient.end(); } catch {}
      const msg = err instanceof Error ? err.message : 'Erro ao consultar ERP';
      return reply.status(500).send({ success: false, error: `ERP: ${msg}` });
    }

    // ── 3. Índices para cross-match ──────────────────────────────────
    // Adquirente: por NSU e por autorizacao
    const aqByNsu  = new Map<string, typeof vendas[0]>();
    const aqByAuth = new Map<string, typeof vendas[0]>();
    for (const v of vendas) {
      if (v.nsu)        aqByNsu.set(v.nsu.trim(),         v);
      if (v.autorizacao) aqByAuth.set(v.autorizacao.trim(), v);
    }

    // ERP: por nsu_host (link principal com adquirente) e nsu e autorizacao
    const erpByNsuHost = new Map<string, typeof erpRows[0]>();
    const erpByNsu     = new Map<string, typeof erpRows[0]>();
    const erpByAuth    = new Map<string, typeof erpRows[0]>();
    for (const r of erpRows) {
      if (r.nsu_host?.trim()) erpByNsuHost.set(r.nsu_host.trim(), r);
      if (r.nsu?.trim())      erpByNsu.set(r.nsu.trim(),           r);
      if (r.autorizacao?.trim()) erpByAuth.set(r.autorizacao.trim(), r);
    }

    // ── 4. Cross-match ───────────────────────────────────────────────
    type MatchResult = {
      vendaKey:         string;
      nsuAdq:           string | null;
      nsuErp:           string | null;
      nsuHostErp:       string | null;
      autorizacao:      string | null;
      valorAdquirente:  number;
      valorErp:         number;
      dif:              number;
      matchVia:         string;
      bandeira:         string;
      dataHoraVenda:    string;
      pdvErp:           string;
    };

    const matches:       MatchResult[] = [];
    const divergentes:   MatchResult[] = [];
    const matchedErpIds  = new Set<unknown>();

    for (const v of vendas) {
      const nsu  = v.nsu?.trim()  ?? '';
      const auth = v.autorizacao?.trim() ?? '';

      let erpRow: typeof erpRows[0] | undefined;
      let matchVia = '';

      // NSU Host (mais confiável: nsu_host do ERP = nsu do adquirente)
      if (nsu && erpByNsuHost.has(nsu)) {
        erpRow = erpByNsuHost.get(nsu); matchVia = 'NSU_HOST';
      }
      // NSU direto
      if (!erpRow && nsu && erpByNsu.has(nsu)) {
        erpRow = erpByNsu.get(nsu); matchVia = 'NSU';
      }
      // Autorização
      if (!erpRow && auth && erpByAuth.has(auth)) {
        erpRow = erpByAuth.get(auth); matchVia = 'AUTORIZACAO';
      }

      if (!erpRow) continue; // sem match → soAdquirente (processado depois)

      matchedErpIds.add(erpRow.id);

      const valorAdq = Number(v.valorBruto);
      const valorErp = Number(erpRow.valor);
      const dif = Math.round((valorAdq - valorErp) * 100) / 100;

      const row: MatchResult = {
        vendaKey:        v.idempotencyKey,
        nsuAdq:          v.nsu,
        nsuErp:          erpRow.nsu || null,
        nsuHostErp:      erpRow.nsu_host || null,
        autorizacao:     v.autorizacao || erpRow.autorizacao || null,
        valorAdquirente: valorAdq,
        valorErp,
        dif,
        matchVia,
        bandeira:        v.bandeira,
        dataHoraVenda:   v.dataHoraVenda.toISOString(),
        pdvErp:          erpRow.pdv || '',
      };

      if (Math.abs(dif) > 0.05) {
        divergentes.push(row);
      } else {
        matches.push(row);
      }
    }

    // ── 5. Somente Adquirente (sem match) ────────────────────────────
    const soAdquirente = vendas
      .filter(v => {
        const nsu  = v.nsu?.trim()  ?? '';
        const auth = v.autorizacao?.trim() ?? '';
        return !(
          (nsu  && erpByNsuHost.has(nsu))  ||
          (nsu  && erpByNsu.has(nsu))      ||
          (auth && erpByAuth.has(auth))
        );
      })
      .map(v => ({
        vendaKey:      v.idempotencyKey,
        nsu:           v.nsu,
        autorizacao:   v.autorizacao,
        terminal:      v.terminal,
        bandeira:      v.bandeira,
        modalidade:    v.modalidade,
        parcelas:      v.parcelas,
        valorBruto:    Number(v.valorBruto),
        dataHoraVenda: v.dataHoraVenda.toISOString(),
        gateway:       v.gateway,
      }));

    // ── 6. Somente ERP (sem match) ────────────────────────────────────
    const soErp = erpRows
      .filter(r => !matchedErpIds.has(r.id))
      .map(r => ({
        id:           String(r.id),
        nsu:          r.nsu || null,
        nsuHost:      r.nsu_host || null,
        autorizacao:  r.autorizacao || null,
        pdv:          r.pdv || null,
        nomecartao:   r.nomecartao || null,
        parcelas:     Number(r.parcelas) || 1,
        valorErp:     Number(r.valor),
        data:         r.data,
        hora:         r.hora,
      }));

    // ── 7. Resumo por dia ────────────────────────────────────────────
    const diaMapAdq = new Map<string, { qtd: number; valor: number }>();
    for (const v of vendas) {
      const d = v.dataHoraVenda.toISOString().slice(0, 10);
      const e = diaMapAdq.get(d) ?? { qtd: 0, valor: 0 };
      e.qtd++; e.valor = Math.round((e.valor + Number(v.valorBruto)) * 100) / 100;
      diaMapAdq.set(d, e);
    }
    const diaMapErp = new Map<string, { qtd: number; valor: number }>();
    for (const r of erpRows) {
      const d = r.data.slice(0, 10);
      const e = diaMapErp.get(d) ?? { qtd: 0, valor: 0 };
      e.qtd++; e.valor = Math.round((e.valor + Number(r.valor)) * 100) / 100;
      diaMapErp.set(d, e);
    }
    const allDias = new Set([...diaMapAdq.keys(), ...diaMapErp.keys()]);
    const resumoPorDia = [...allDias].sort().map(d => {
      const adq = diaMapAdq.get(d) ?? { qtd: 0, valor: 0 };
      const erp = diaMapErp.get(d) ?? { qtd: 0, valor: 0 };
      return {
        data:             d,
        qtdAdquirente:    adq.qtd,
        valorAdquirente:  adq.valor,
        qtdErp:           erp.qtd,
        valorErp:         erp.valor,
        difQtd:           adq.qtd - erp.qtd,
        difValor:         Math.round((adq.valor - erp.valor) * 100) / 100,
      };
    });

    return reply.send({
      success: true,
      periodo:  { dataInicio, dataFim },
      kpis: {
        totalAdquirente:  vendas.length,
        totalErp:         erpRows.length,
        matches:          matches.length,
        divergentes:      divergentes.length,
        soAdquirente:     soAdquirente.length,
        soErp:            soErp.length,
        valorSoAdquirente: soAdquirente.reduce((a, v) => a + v.valorBruto, 0),
        valorSoErp:        soErp.reduce((a, r) => a + r.valorErp, 0),
        taxaMatch:         vendas.length > 0
          ? Math.round(((matches.length + divergentes.length) / vendas.length) * 10000) / 100
          : 0,
      },
      resumoPorDia,
      matches:      matches.slice(0, 500),
      divergentes,
      soAdquirente: soAdquirente.slice(0, 500),
      soErp:        soErp.slice(0, 500),
    });
  });

  // ── Amostras do Extrato Getnet EDI V10 para o Sandbox ─────────────
  fastify.get('/getnet/samples/:sampleName', async (req, reply) => {
    const { sampleName } = req.params as { sampleName: string };
    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    const fsSync = await import('node:fs');
    let extratosDir = path.resolve(process.cwd(), 'docs/conciliacao/getnet/extratos');
    if (!fsSync.existsSync(extratosDir)) {
      extratosDir = path.resolve(process.cwd(), '../../docs/conciliacao/getnet/extratos');
    }
    let target = '';
    if (sampleName === '20260911') {
      target = 'getnetextr_20260911_14961495_c103.txt';
    } else if (sampleName === '20260912') {
      target = 'getnetextr_20260912_14961495_c103.txt';
    } else {
      target = sampleName;
    }

    const fullPath = path.join(extratosDir, target);
    try {
      const content = await fs.readFile(fullPath, 'latin1');
      return reply.send({ success: true, filename: target, content });
    } catch {
      return reply.status(404).send({ success: false, error: 'Amostra não encontrada' });
    }
  });
};

export default adquirenteRoutes;
