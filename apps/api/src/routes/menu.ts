import type { FastifyPluginAsync } from 'fastify';

const menuRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/menu — retorna itens de menu filtrados pelas roles do usuário
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const userRoles = req.user.roles;

    // Buscar itens raiz ativos que o usuário tem acesso via role
    const items = await fastify.prisma.menuItem.findMany({
      where: {
        ativo: true,
        parentId: null,
        roles: { some: { role: { slug: { in: userRoles } } } },
      },
      include: {
        filhos: {
          where: { ativo: true },
          orderBy: { ordem: 'asc' },
        },
      },
      orderBy: { ordem: 'asc' },
    });

    return reply.send({ success: true, items });
  });
};

export default menuRoutes;
