import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const menuAdminRoutes: FastifyPluginAsync = async (fastify) => {
  const pre = [fastify.requireAdmin];

  // GET /api/menu-admin — todos os itens com quais roles têm acesso
  fastify.get('/', { preHandler: pre }, async (_req, reply) => {
    const items = await fastify.prisma.menuItem.findMany({
      include: {
        roles: { include: { role: { select: { slug: true, nome: true } } } },
        filhos: {
          include: {
            roles: { include: { role: { select: { slug: true, nome: true } } } },
          },
          orderBy: { ordem: 'asc' },
        },
      },
      where: { parentId: null },
      orderBy: { ordem: 'asc' },
    });
    return reply.send({ success: true, items });
  });

  // PUT /api/menu-admin/:menuItemId/roles — define quais roles veem este item
  fastify.put<{ Params: { menuItemId: string } }>(
    '/:menuItemId/roles',
    { preHandler: pre },
    async (req, reply) => {
      const body = z.object({ roles: z.array(z.string()) }).safeParse(req.body);
      if (!body.success) return reply.status(400).send({ success: false, error: body.error.message });

      const dbRoles = await fastify.prisma.role.findMany({ where: { slug: { in: body.data.roles } } });

      await fastify.prisma.roleMenuItem.deleteMany({ where: { menuItemId: req.params.menuItemId } });
      await fastify.prisma.roleMenuItem.createMany({
        data: dbRoles.map((r: { id: string }) => ({ roleId: r.id, menuItemId: req.params.menuItemId })),
      });

      return reply.send({ success: true });
    },
  );

  // PATCH /api/menu-admin/:menuItemId — toggle ativo/inativo ou reordenar
  fastify.patch<{ Params: { menuItemId: string } }>(
    '/:menuItemId',
    { preHandler: pre },
    async (req, reply) => {
      const body = z.object({
        ativo: z.boolean().optional(),
        ordem: z.number().int().optional(),
        rotulo: z.string().optional(),
      }).safeParse(req.body);
      if (!body.success) return reply.status(400).send({ success: false, error: body.error.message });

      await fastify.prisma.menuItem.update({
        where: { id: req.params.menuItemId },
        data: body.data,
      });

      return reply.send({ success: true });
    },
  );
};

export default menuAdminRoutes;
