import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

// ── Schemas ────────────────────────────────────────────────────────

const TIPOS_OFX  = ['PIX', 'CARTAO', 'TARIFA', 'TRANSFERENCIA', 'OUTRO', 'IGNORAR'] as const;
const BANDEIRAS  = ['VISA', 'MASTER', 'ELO', 'AMEX', 'HIPERCARD', 'CABAL', 'OUTROS'] as const;
const BANCOS     = ['SICOOB', 'SICREDI', 'BB', 'ITAU', 'BRADESCO', 'SANTANDER', 'CAIXA', 'NUBANK', 'INTER'] as const;
const ORIGENS    = ['MANUAL', 'APRENDIDO'] as const;

const padraoSchema = z.object({
  texto:     z.string().min(1).max(200).trim(),
  tipo:      z.enum(TIPOS_OFX),
  bandeira:  z.enum(BANDEIRAS).nullable().optional(),
  banco:     z.enum(BANCOS).nullable().optional(),
  prioridade: z.number().int().min(0).max(999).default(0),
  ativo:     z.boolean().default(true),
  origem:    z.enum(ORIGENS).default('MANUAL'),
});

// ── Plugin ─────────────────────────────────────────────────────────

const ofxPadroesRoutes: FastifyPluginAsync = async (fastify) => {
  const auth  = [fastify.authenticate];
  const admin = [fastify.requireAdmin];

  // ── GET /api/ofx-padroes ─────────────────────────────────────────
  fastify.get('/', { preHandler: auth }, async (_req, reply) => {
    const padroes = await fastify.prisma.ofxPadrao.findMany({
      orderBy: [{ prioridade: 'desc' }, { texto: 'asc' }],
    });
    return reply.send({ success: true, padroes });
  });

  // ── POST /api/ofx-padroes ────────────────────────────────────────
  fastify.post<{ Body: unknown }>('/', { preHandler: admin }, async (req, reply) => {
    const p = padraoSchema.safeParse(req.body);
    if (!p.success) return reply.status(400).send({ success: false, error: p.error.message });

    try {
      const padrao = await fastify.prisma.ofxPadrao.create({ data: p.data });
      return reply.status(201).send({ success: true, padrao });
    } catch (e: unknown) {
      if ((e as { code?: string }).code === 'P2002') {
        return reply.status(409).send({
          success: false,
          error: 'Já existe um padrão com esse texto para esse banco.',
        });
      }
      throw e;
    }
  });

  // ── POST /api/ofx-padroes/classificar — testa um texto ──────────
  fastify.post<{ Body: { texto: string; banco?: string } }>(
    '/classificar', { preHandler: auth }, async (req, reply) => {
      const { texto, banco } = req.body ?? {};
      if (!texto?.trim()) {
        return reply.status(400).send({ success: false, error: 'texto obrigatório' });
      }

      const padroes = await fastify.prisma.ofxPadrao.findMany({
        where: { ativo: true },
        orderBy: [{ prioridade: 'desc' }],
      });

      const haystack = texto.toLowerCase();
      const match = padroes.find(p => {
        if (p.banco && p.banco !== (banco ?? null)) return false;
        return haystack.includes(p.texto.toLowerCase());
      });

      return reply.send({ success: true, match: match ?? null });
    },
  );

  // ── PUT /api/ofx-padroes/:id ─────────────────────────────────────
  fastify.put<{ Params: { id: string }; Body: unknown }>(
    '/:id', { preHandler: admin }, async (req, reply) => {
      const p = padraoSchema.partial().safeParse(req.body);
      if (!p.success) return reply.status(400).send({ success: false, error: p.error.message });

      const padrao = await fastify.prisma.ofxPadrao.update({
        where: { id: Number(req.params.id) },
        data: p.data,
      });
      return reply.send({ success: true, padrao });
    },
  );

  // ── DELETE /api/ofx-padroes/:id ──────────────────────────────────
  fastify.delete<{ Params: { id: string } }>(
    '/:id', { preHandler: admin }, async (req, reply) => {
      await fastify.prisma.ofxPadrao.delete({ where: { id: Number(req.params.id) } });
      return reply.send({ success: true });
    },
  );
};

export default ofxPadroesRoutes;
