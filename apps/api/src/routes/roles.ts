import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const createSchema = z.object({
  nome:      z.string().min(2),
  slug:      z.string().min(2).regex(/^[a-z0-9-]+$/),
  descricao: z.string().optional(),
  permissions: z.array(z.string()).default([]),
});

const rolesRoutes: FastifyPluginAsync = async (fastify) => {
  const pre = [fastify.requireAdmin];

  // GET /api/roles
  fastify.get('/', { preHandler: pre }, async (_req, reply) => {
    const roles = await fastify.prisma.role.findMany({
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
      orderBy: { nome: 'asc' },
    });
    return reply.send({ success: true, roles });
  });

  // GET /api/roles/:id
  fastify.get<{ Params: { id: string } }>('/:id', { preHandler: pre }, async (req, reply) => {
    const role = await fastify.prisma.role.findUnique({
      where: { id: req.params.id },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) return reply.status(404).send({ success: false, error: 'Papel não encontrado' });
    return reply.send({ success: true, role });
  });

  // POST /api/roles
  fastify.post('/', { preHandler: pre }, async (req, reply) => {
    const body = createSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message });

    const { nome, slug, descricao, permissions } = body.data;
    const dbPerms = await fastify.prisma.permission.findMany({ where: { chave: { in: permissions } } });

    const role = await fastify.prisma.role.create({
      data: {
        nome, slug, descricao,
        permissions: { create: dbPerms.map((p: { id: string }) => ({ permissionId: p.id })) },
      },
    });

    return reply.status(201).send({ success: true, role });
  });

  // PUT /api/roles/:id — atualiza permissões do papel
  fastify.put<{ Params: { id: string } }>('/:id', { preHandler: pre }, async (req, reply) => {
    const body = z.object({
      nome: z.string().min(2).optional(),
      descricao: z.string().optional(),
      permissions: z.array(z.string()).optional(),
    }).safeParse(req.body);
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message });

    const { permissions, ...data } = body.data;
    await fastify.prisma.role.update({ where: { id: req.params.id }, data });

    if (permissions !== undefined) {
      const dbPerms = await fastify.prisma.permission.findMany({ where: { chave: { in: permissions } } });
      await fastify.prisma.rolePermission.deleteMany({ where: { roleId: req.params.id } });
      await fastify.prisma.rolePermission.createMany({
        data: dbPerms.map((p: { id: string }) => ({ roleId: req.params.id, permissionId: p.id })),
      });
    }

    return reply.send({ success: true });
  });

  // GET /api/roles/permissions — lista todas as permissões disponíveis
  fastify.get('/permissions/all', { preHandler: pre }, async (_req, reply) => {
    const permissions = await fastify.prisma.permission.findMany({ orderBy: { chave: 'asc' } });
    return reply.send({ success: true, permissions });
  });
};

export default rolesRoutes;
