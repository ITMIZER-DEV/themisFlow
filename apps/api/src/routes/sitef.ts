import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

// ── Schema de validação ────────────────────────────────────────────

const transacaoSchema = z.object({
  idempotencyKey:     z.string().min(1),
  dataTrans:          z.string(),
  dataDia:            z.string(),
  dataFiscal:         z.string(),
  codigoLoja:         z.string(),
  cartao:             z.string(),
  pdv:                z.string(),
  nsu:                z.string(),
  nsuHost:            z.string(),
  valor:              z.number(),
  valorSaque:         z.number(),
  rede:               z.string(),
  tipoProduto:        z.string(),
  tipoProdutoRaw:     z.string(),
  autorizacao:        z.string(),
  estabelecimento:    z.string(),
  modoEntrada:        z.string(),
  produto:            z.string(),
  descricaoTransacao: z.string(),
  nrParcelas:         z.number().int().min(1),
  estadoTransacao:    z.string(),
  estadoTransacaoRaw: z.string(),
  operador:           z.string(),
  terminalLogico:     z.string(),
  codSitef:           z.string(),
  cupomFiscal:        z.string(),
});

const importSchema = z.object({
  arquivo:    z.string().min(1),
  transacoes: z.array(transacaoSchema).min(1),
});

const listQuerySchema = z.object({
  dataInicio:      z.string().optional(),   // YYYY-MM-DD
  dataFim:         z.string().optional(),   // YYYY-MM-DD
  nsuHost:         z.string().optional(),
  autorizacao:     z.string().optional(),
  estadoTransacao: z.string().optional(),
  codigoLoja:      z.string().optional(),
  loteId:          z.string().optional(),
  page:            z.coerce.number().int().min(1).optional().default(1),
  limit:           z.coerce.number().int().min(1).max(500).optional().default(100),
});

// ── Rotas ─────────────────────────────────────────────────────────

const sitefRoutes: FastifyPluginAsync = async (fastify) => {
  const pre = [fastify.authenticate];

  // ── POST /api/sitef/lotes — importar lote de transações ──────────
  // R22: idempotência via createMany({ skipDuplicates: true })
  fastify.post<{ Body: unknown }>('/lotes', { preHandler: pre }, async (req, reply) => {
    const parsed = importSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.message });
    }

    const { arquivo, transacoes } = parsed.data;
    const userId = req.user.id;

    // Cria o registro do lote
    const lote = await fastify.prisma.sitefLote.create({
      data: { arquivo, importadoPor: userId },
    });

    // Insere transações — skipDuplicates implementa R22 (idempotência)
    const result = await fastify.prisma.sitefTransacao.createMany({
      data: transacoes.map(t => ({
        idempotencyKey:     t.idempotencyKey,
        loteId:             lote.id,
        dataTrans:          t.dataTrans,
        dataDia:            t.dataDia,
        dataFiscal:         t.dataFiscal,
        codigoLoja:         t.codigoLoja,
        cartao:             t.cartao,
        pdv:                t.pdv,
        nsu:                t.nsu,
        nsuHost:            t.nsuHost,
        valor:              t.valor,
        valorSaque:         t.valorSaque,
        rede:               t.rede,
        tipoProduto:        t.tipoProduto,
        tipoProdutoRaw:     t.tipoProdutoRaw,
        autorizacao:        t.autorizacao,
        estabelecimento:    t.estabelecimento,
        modoEntrada:        t.modoEntrada,
        produto:            t.produto,
        descricaoTransacao: t.descricaoTransacao,
        nrParcelas:         t.nrParcelas,
        estadoTransacao:    t.estadoTransacao,
        estadoTransacaoRaw: t.estadoTransacaoRaw,
        operador:           t.operador,
        terminalLogico:     t.terminalLogico,
        codSitef:           t.codSitef,
        cupomFiscal:        t.cupomFiscal,
      })),
      skipDuplicates: true,
    });

    const adicionadas = result.count;
    const ignoradas   = transacoes.length - adicionadas;

    // Atualiza contadores no lote
    await fastify.prisma.sitefLote.update({
      where: { id: lote.id },
      data: { adicionadas, ignoradas },
    });

    return reply.status(201).send({
      success: true,
      loteId:     lote.id,
      adicionadas,
      ignoradas,
    });
  });

  // ── GET /api/sitef/lotes — lista de importações ──────────────────
  fastify.get('/lotes', { preHandler: pre }, async (_req, reply) => {
    const lotes = await fastify.prisma.sitefLote.findMany({
      orderBy: { importadoEm: 'desc' },
      select: {
        id:          true,
        arquivo:     true,
        importadoEm: true,
        adicionadas: true,
        ignoradas:   true,
        importador:  { select: { nome: true } },
        _count:      { select: { transacoes: true } },
      },
    });
    return reply.send({ success: true, lotes });
  });

  // ── DELETE /api/sitef/lotes/:id — remove lote ───────────────────
  // Só admin pode apagar; as transações que dependem de outros lotes
  // ficam protegidas pelo RESTRICT do FK — apenas transações deste lote
  // (sem referência em outros) serão apagadas em cascata.
  fastify.delete<{ Params: { id: string } }>(
    '/lotes/:id',
    { preHandler: [fastify.requireAdmin] },
    async (req, reply) => {
      const { id } = req.params;
      const lote = await fastify.prisma.sitefLote.findUnique({ where: { id } });
      if (!lote) return reply.status(404).send({ success: false, error: 'Lote não encontrado' });

      // Apaga as transações primeiro (FK RESTRICT impede deletar lote com transações)
      await fastify.prisma.sitefTransacao.deleteMany({ where: { loteId: id } });
      await fastify.prisma.sitefLote.delete({ where: { id } });

      return reply.send({ success: true });
    },
  );

  // ── GET /api/sitef/transacoes — lista com filtros e paginação ────
  fastify.get<{ Querystring: unknown }>('/transacoes', { preHandler: pre }, async (req, reply) => {
    const q = listQuerySchema.safeParse(req.query);
    if (!q.success) return reply.status(400).send({ success: false, error: q.error.message });

    const { dataInicio, dataFim, nsuHost, autorizacao, estadoTransacao, codigoLoja, loteId, page, limit } = q.data;

    // Normalização para comparar tanto com "YYYY-MM-DD" quanto "YYYYMMDD"
    const normalizeWithDashes = (d: string) => {
      const clean = d.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
      if (/^\d{8}$/.test(clean)) return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
      return clean;
    };
    const normalizeWithoutDashes = (d: string) => d.replace(/-/g, '').trim();

    let dateCondition: Record<string, unknown> | undefined = undefined;
    if (dataInicio || dataFim) {
      const dStartWith = dataInicio ? normalizeWithDashes(dataInicio) : undefined;
      const dEndWith = dataFim ? normalizeWithDashes(dataFim) : undefined;
      const dStartNo = dataInicio ? normalizeWithoutDashes(dataInicio) : undefined;
      const dEndNo = dataFim ? normalizeWithoutDashes(dataFim) : undefined;

      const condWith: Record<string, string> = {};
      if (dStartWith) condWith.gte = dStartWith;
      if (dEndWith) condWith.lte = dEndWith;

      const condNo: Record<string, string> = {};
      if (dStartNo) condNo.gte = dStartNo;
      if (dEndNo) condNo.lte = dEndNo;

      dateCondition = {
        OR: [
          { dataDia: condWith },
          { dataDia: condNo },
        ],
      };
    }

    const where = {
      ...(dateCondition   && dateCondition),
      ...(nsuHost         && { nsuHost:      { contains: nsuHost }     }),
      ...(autorizacao     && { autorizacao:  { contains: autorizacao } }),
      ...(estadoTransacao && { estadoTransacao }),
      ...(codigoLoja      && { codigoLoja }),
      ...(loteId          && { loteId }),
    };

    const [total, transacoes] = await Promise.all([
      fastify.prisma.sitefTransacao.count({ where }),
      fastify.prisma.sitefTransacao.findMany({
        where,
        orderBy: { dataTrans: 'desc' },
        skip:  (page - 1) * limit,
        take:  limit,
      }),
    ]);

    return reply.send({
      success: true,
      total,
      page,
      limit,
      transacoes,
    });
  });

  // ── GET /api/sitef/transacoes/resumo — totais por dia/produto ────
  fastify.get('/transacoes/resumo', { preHandler: pre }, async (req, reply) => {
    const { dataDia, codigoLoja } = (req.query as Record<string, string | undefined>);

    const where = {
      estadoTransacao: 'EFETIVADA',
      ...(dataDia    && { dataDia }),
      ...(codigoLoja && { codigoLoja }),
    };

    const rows = await fastify.prisma.sitefTransacao.groupBy({
      by:      ['dataDia', 'tipoProduto'],
      where,
      _sum:    { valor: true },
      _count:  { idempotencyKey: true },
      orderBy: { dataDia: 'desc' },
    });

    return reply.send({ success: true, resumo: rows });
  });
};

export default sitefRoutes;
