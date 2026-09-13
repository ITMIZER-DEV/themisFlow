import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

// ── Schemas ────────────────────────────────────────────────────────

const TIPOS_PAGAMENTO = ['CREDITO', 'DEBITO', 'ALIMENTACAO', 'REFEICAO', 'COMBUSTIVEL', 'VOUCHER', 'PIX'] as const;
const MODALIDADES     = ['A_VISTA', 'PARCELADO_LOJA', 'PARCELADO_ADM'] as const;
const TIPOS_ENCARGO   = ['MENSAL', 'POR_OCORRENCIA', 'PERCENTUAL_VENDA', 'ANUAL'] as const;

const contratoSchema = z.object({
  nome:        z.string().min(2),
  rede:        z.string().min(1),
  dataInicio:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado: YYYY-MM-DD'),
  dataFim:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  observacoes: z.string().nullable().optional(),
  ativo:       z.boolean().optional(),
});

const itemSchema = z.object({
  tipoPagamento:    z.enum(TIPOS_PAGAMENTO),
  bandeira:         z.string().min(1),
  modalidade:       z.enum(MODALIDADES),
  parcelaMin:       z.number().int().min(1).default(1),
  parcelaMax:       z.number().int().min(1).default(1),
  taxaMdr:          z.number().min(0),
  taxaAntecipacao:  z.number().min(0).default(0),
  prazoRecebimento: z.number().int().min(0).default(1),
  taxaFixa:         z.number().min(0).default(0),
});

const aluguelSchema = z.object({
  descricao:     z.string().min(2),
  qtdTerminais:  z.number().int().min(1).default(1),
  valorUnitario: z.number().min(0),
  ativo:         z.boolean().default(true),
});

const encargoSchema = z.object({
  descricao: z.string().min(2),
  tipo:      z.enum(TIPOS_ENCARGO),
  valor:     z.number().min(0),
  ativo:     z.boolean().default(true),
});

// ── Plugin ─────────────────────────────────────────────────────────

const taxasRoutes: FastifyPluginAsync = async (fastify) => {
  const auth  = [fastify.authenticate];
  const admin = [fastify.requireAdmin];

  // ── GET /api/taxas/contratos ─────────────────────────────────────
  fastify.get('/contratos', { preHandler: auth }, async (_req, reply) => {
    const contratos = await fastify.prisma.taxaContrato.findMany({
      orderBy: [{ ativo: 'desc' }, { criadoEm: 'desc' }],
      select: {
        id: true, nome: true, rede: true,
        dataInicio: true, dataFim: true, ativo: true, observacoes: true,
        criadoEm: true,
        criador: { select: { nome: true } },
        _count: { select: { itens: true, alugueis: true, encargos: true } },
      },
    });
    return reply.send({ success: true, contratos });
  });

  // ── POST /api/taxas/contratos ────────────────────────────────────
  fastify.post<{ Body: unknown }>('/contratos', { preHandler: admin }, async (req, reply) => {
    const p = contratoSchema.safeParse(req.body);
    if (!p.success) return reply.status(400).send({ success: false, error: p.error.message });

    const contrato = await fastify.prisma.taxaContrato.create({
      data: {
        ...p.data,
        dataInicio:  new Date(p.data.dataInicio),
        dataFim:     p.data.dataFim ? new Date(p.data.dataFim) : null,
        criadoPor:   req.user.id,
      },
    });
    return reply.status(201).send({ success: true, contrato });
  });

  // ── GET /api/taxas/contratos/:id ─────────────────────────────────
  fastify.get<{ Params: { id: string } }>('/contratos/:id', { preHandler: auth }, async (req, reply) => {
    const contrato = await fastify.prisma.taxaContrato.findUnique({
      where: { id: req.params.id },
      include: {
        criador:  { select: { nome: true } },
        itens:    { orderBy: [{ tipoPagamento: 'asc' }, { bandeira: 'asc' }, { parcelaMin: 'asc' }] },
        alugueis: { orderBy: { descricao: 'asc' } },
        encargos: { orderBy: { descricao: 'asc' } },
      },
    });
    if (!contrato) return reply.status(404).send({ success: false, error: 'Contrato não encontrado' });
    return reply.send({ success: true, contrato });
  });

  // ── PUT /api/taxas/contratos/:id ─────────────────────────────────
  fastify.put<{ Params: { id: string }; Body: unknown }>('/contratos/:id', { preHandler: admin }, async (req, reply) => {
    const p = contratoSchema.partial().safeParse(req.body);
    if (!p.success) return reply.status(400).send({ success: false, error: p.error.message });

    const data: Record<string, unknown> = { ...p.data };
    if (p.data.dataInicio) data.dataInicio = new Date(p.data.dataInicio);
    if (p.data.dataFim)    data.dataFim    = new Date(p.data.dataFim);
    if (p.data.dataFim === null) data.dataFim = null;

    const contrato = await fastify.prisma.taxaContrato.update({
      where: { id: req.params.id },
      data,
    });
    return reply.send({ success: true, contrato });
  });

  // ── DELETE /api/taxas/contratos/:id ─────────────────────────────
  fastify.delete<{ Params: { id: string } }>('/contratos/:id', { preHandler: admin }, async (req, reply) => {
    await fastify.prisma.taxaContrato.delete({ where: { id: req.params.id } });
    return reply.send({ success: true });
  });

  // ═══════════════════════════════════════════════════════════════
  // Itens MDR
  // ═══════════════════════════════════════════════════════════════

  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/contratos/:id/itens', { preHandler: admin }, async (req, reply) => {
      const p = itemSchema.safeParse(req.body);
      if (!p.success) return reply.status(400).send({ success: false, error: p.error.message });

      try {
        const item = await fastify.prisma.taxaItem.create({
          data: { contratoId: req.params.id, ...p.data },
        });
        return reply.status(201).send({ success: true, item });
      } catch (e: unknown) {
        if ((e as { code?: string }).code === 'P2002') {
          return reply.status(409).send({ success: false, error: 'Já existe uma taxa para essa combinação' });
        }
        throw e;
      }
    },
  );

  fastify.put<{ Params: { id: string; itemId: string }; Body: unknown }>(
    '/contratos/:id/itens/:itemId', { preHandler: admin }, async (req, reply) => {
      const p = itemSchema.partial().safeParse(req.body);
      if (!p.success) return reply.status(400).send({ success: false, error: p.error.message });

      const item = await fastify.prisma.taxaItem.update({
        where: { id: req.params.itemId },
        data: p.data,
      });
      return reply.send({ success: true, item });
    },
  );

  fastify.delete<{ Params: { id: string; itemId: string } }>(
    '/contratos/:id/itens/:itemId', { preHandler: admin }, async (req, reply) => {
      await fastify.prisma.taxaItem.delete({ where: { id: req.params.itemId } });
      return reply.send({ success: true });
    },
  );

  // ═══════════════════════════════════════════════════════════════
  // Aluguéis
  // ═══════════════════════════════════════════════════════════════

  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/contratos/:id/alugueis', { preHandler: admin }, async (req, reply) => {
      const p = aluguelSchema.safeParse(req.body);
      if (!p.success) return reply.status(400).send({ success: false, error: p.error.message });

      const aluguel = await fastify.prisma.taxaAluguel.create({
        data: { contratoId: req.params.id, ...p.data },
      });
      return reply.status(201).send({ success: true, aluguel });
    },
  );

  fastify.put<{ Params: { id: string; aluguelId: string }; Body: unknown }>(
    '/contratos/:id/alugueis/:aluguelId', { preHandler: admin }, async (req, reply) => {
      const p = aluguelSchema.partial().safeParse(req.body);
      if (!p.success) return reply.status(400).send({ success: false, error: p.error.message });

      const aluguel = await fastify.prisma.taxaAluguel.update({
        where: { id: req.params.aluguelId },
        data: p.data,
      });
      return reply.send({ success: true, aluguel });
    },
  );

  fastify.delete<{ Params: { id: string; aluguelId: string } }>(
    '/contratos/:id/alugueis/:aluguelId', { preHandler: admin }, async (req, reply) => {
      await fastify.prisma.taxaAluguel.delete({ where: { id: req.params.aluguelId } });
      return reply.send({ success: true });
    },
  );

  // ═══════════════════════════════════════════════════════════════
  // Encargos
  // ═══════════════════════════════════════════════════════════════

  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/contratos/:id/encargos', { preHandler: admin }, async (req, reply) => {
      const p = encargoSchema.safeParse(req.body);
      if (!p.success) return reply.status(400).send({ success: false, error: p.error.message });

      const encargo = await fastify.prisma.taxaEncargo.create({
        data: { contratoId: req.params.id, ...p.data },
      });
      return reply.status(201).send({ success: true, encargo });
    },
  );

  fastify.put<{ Params: { id: string; encargoId: string }; Body: unknown }>(
    '/contratos/:id/encargos/:encargoId', { preHandler: admin }, async (req, reply) => {
      const p = encargoSchema.partial().safeParse(req.body);
      if (!p.success) return reply.status(400).send({ success: false, error: p.error.message });

      const encargo = await fastify.prisma.taxaEncargo.update({
        where: { id: req.params.encargoId },
        data: p.data,
      });
      return reply.send({ success: true, encargo });
    },
  );

  fastify.delete<{ Params: { id: string; encargoId: string } }>(
    '/contratos/:id/encargos/:encargoId', { preHandler: admin }, async (req, reply) => {
      await fastify.prisma.taxaEncargo.delete({ where: { id: req.params.encargoId } });
      return reply.send({ success: true });
    },
  );
};

export default taxasRoutes;
