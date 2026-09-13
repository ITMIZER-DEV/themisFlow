import type { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const createSchema = z.object({
  nome:  z.string().min(2),
  email: z.string().email(),
  senha: z.string().min(6),
  roles: z.array(z.string()).min(1),
  ativo: z.boolean().optional().default(true),
});

const updateSchema = z.object({
  nome:  z.string().min(2).optional(),
  email: z.string().email().optional(),
  ativo: z.boolean().optional(),
  roles: z.array(z.string()).optional(),
});

const usersRoutes: FastifyPluginAsync = async (fastify) => {
  const pre = [fastify.requireAdmin];

  // GET /api/users
  fastify.get('/', { preHandler: pre }, async (_req, reply) => {
    const users = await fastify.prisma.user.findMany({
      select: {
        id: true, nome: true, email: true, ativo: true, criadoEm: true,
        roles: { select: { role: { select: { slug: true, nome: true } } } },
      },
      orderBy: { nome: 'asc' },
    });
    return reply.send({ success: true, users });
  });

  // GET /api/users/:id
  fastify.get<{ Params: { id: string } }>('/:id', { preHandler: pre }, async (req, reply) => {
    const user = await fastify.prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, nome: true, email: true, ativo: true, criadoEm: true,
        roles: { select: { role: { select: { slug: true, nome: true } } } },
      },
    });
    if (!user) return reply.status(404).send({ success: false, error: 'Usuário não encontrado' });
    return reply.send({ success: true, user });
  });

  // POST /api/users
  fastify.post('/', { preHandler: pre }, async (req, reply) => {
    const body = createSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message });

    const { nome, email, senha, roles, ativo } = body.data;
    const hash = await bcrypt.hash(senha, 12);

    const dbRoles = await fastify.prisma.role.findMany({ where: { slug: { in: roles } } });
    if (dbRoles.length === 0) return reply.status(400).send({ success: false, error: 'Papéis inválidos' });

    const user = await fastify.prisma.user.create({
      data: {
        nome, email, senha: hash, ativo,
        roles: { create: dbRoles.map((r: { id: string }) => ({ roleId: r.id })) },
      },
      select: { id: true, nome: true, email: true, ativo: true, criadoEm: true },
    });

    return reply.status(201).send({ success: true, user });
  });

  // PUT /api/users/:id
  fastify.put<{ Params: { id: string } }>('/:id', { preHandler: pre }, async (req, reply) => {
    const body = updateSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message });

    const { roles, ...data } = body.data;

    await fastify.prisma.user.update({ where: { id: req.params.id }, data });

    if (roles) {
      const dbRoles = await fastify.prisma.role.findMany({ where: { slug: { in: roles } } });
      await fastify.prisma.userRole.deleteMany({ where: { userId: req.params.id } });
      await fastify.prisma.userRole.createMany({
        data: dbRoles.map((r: { id: string }) => ({ userId: req.params.id, roleId: r.id })),
      });
    }

    return reply.send({ success: true });
  });

  // DELETE /api/users/:id
  fastify.delete<{ Params: { id: string } }>('/:id', { preHandler: pre }, async (req, reply) => {
    // Soft delete: desativar em vez de apagar
    await fastify.prisma.user.update({ where: { id: req.params.id }, data: { ativo: false } });
    return reply.send({ success: true });
  });
};

export default usersRoutes;
