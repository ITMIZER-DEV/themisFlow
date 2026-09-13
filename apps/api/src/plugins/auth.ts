import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';

export interface JWTPayload {
  id: string;
  email: string;
  nome: string;
  roles: string[];
  permissions: string[];
}

// Augmentação: só user — payload fica flexível para sign com subsets
declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: JWTPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const authPlugin: FastifyPluginAsync = fp(async (fastify) => {
  fastify.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      reply.status(401).send({ success: false, error: 'Não autorizado' });
    }
  });

  fastify.decorate('requireAdmin', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
      if (!req.user.roles.includes('admin')) {
        reply.status(403).send({ success: false, error: 'Acesso restrito a administradores' });
      }
    } catch {
      reply.status(401).send({ success: false, error: 'Não autorizado' });
    }
  });
});

export default authPlugin;
