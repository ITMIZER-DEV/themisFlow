import type { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email(),
  senha: z.string().min(4),
});

const REFRESH_COOKIE = 'tf_refresh';

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/auth/login
  fastify.post('/login', async (req, reply) => {
    const body = loginSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ success: false, error: 'Dados inválidos' });

    const { email, senha } = body.data;
    const user = await fastify.prisma.user.findUnique({
      where: { email },
      include: {
        roles: {
          include: {
            role: { include: { permissions: { include: { permission: true } } } },
          },
        },
      },
    });

    if (!user || !user.ativo || !(await bcrypt.compare(senha, user.senha))) {
      return reply.status(401).send({ success: false, error: 'Credenciais inválidas' });
    }

    const roles = user.roles.map((ur: { role: { slug: string } }) => ur.role.slug);
    const permissions = [...new Set(
      user.roles.flatMap((ur: { role: { permissions: Array<{ permission: { chave: string } }> } }) =>
        ur.role.permissions.map((rp: { permission: { chave: string } }) => rp.permission.chave)
      )
    )];

    const payload = { id: user.id, email: user.email, nome: user.nome, roles, permissions };
    const accessToken = fastify.jwt.sign(payload, { expiresIn: '15m' });
    const refreshToken = fastify.jwt.sign({ id: user.id }, { expiresIn: '7d' });

    reply.setCookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth/refresh',
      maxAge: 60 * 60 * 24 * 7,
    });

    return reply.send({ success: true, accessToken, user: payload });
  });

  // POST /api/auth/refresh
  fastify.post('/refresh', async (req, reply) => {
    const token = req.cookies[REFRESH_COOKIE];
    if (!token) return reply.status(401).send({ success: false, error: 'Sem refresh token' });

    let payload: { id: string };
    try {
      payload = fastify.jwt.verify<{ id: string }>(token);
    } catch {
      return reply.status(401).send({ success: false, error: 'Refresh token inválido' });
    }

    const user = await fastify.prisma.user.findUnique({
      where: { id: payload.id },
      include: {
        roles: {
          include: {
            role: { include: { permissions: { include: { permission: true } } } },
          },
        },
      },
    });

    if (!user || !user.ativo) {
      return reply.status(401).send({ success: false, error: 'Usuário inativo' });
    }

    const roles = user.roles.map((ur: { role: { slug: string } }) => ur.role.slug);
    const permissions = [...new Set(
      user.roles.flatMap((ur: { role: { permissions: Array<{ permission: { chave: string } }> } }) =>
        ur.role.permissions.map((rp: { permission: { chave: string } }) => rp.permission.chave)
      )
    )];

    const newPayload = { id: user.id, email: user.email, nome: user.nome, roles, permissions };
    const accessToken = fastify.jwt.sign(newPayload, { expiresIn: '15m' });

    return reply.send({ success: true, accessToken, user: newPayload });
  });

  // POST /api/auth/logout
  fastify.post('/logout', async (_req, reply) => {
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth/refresh' });
    return reply.send({ success: true });
  });

  // GET /api/auth/me
  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    return reply.send({ success: true, user: req.user });
  });
};

export default authRoutes;
