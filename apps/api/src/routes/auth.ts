import type { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';

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

  // POST /api/auth/forgot-password
  // Gera token de reset e envia e-mail. Responde sempre 200 para não vazar se o e-mail existe.
  fastify.post('/forgot-password', async (req, reply) => {
    const schema = z.object({ email: z.string().email() });
    const body = schema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ success: false, error: 'E-mail inválido' });

    const { email } = body.data;
    const user = await fastify.prisma.user.findUnique({ where: { email } });

    if (user && user.ativo) {
      const token  = crypto.randomBytes(32).toString('hex');
      const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

      await fastify.prisma.user.update({
        where: { id: user.id },
        data: { resetToken: token, resetTokenExpiry: expiry },
      });

      const config = await fastify.prisma.empresaConfig.findUnique({ where: { id: 'default' } });
      const origin = process.env.CORS_ORIGIN || 'http://localhost:5173';
      const link   = `${origin}/reset-password?token=${token}`;

      if (config?.smtpAtivo && config.smtpHost && config.smtpUsuario) {
        const transporter = nodemailer.createTransport({
          host: config.smtpHost,
          port: config.smtpPorta,
          secure: config.smtpSsl,
          auth: { user: config.smtpUsuario, pass: config.smtpSenha || '' },
        });

        const from = config.smtpRemetente || `ThemisFlow <${config.smtpUsuario}>`;
        await transporter.sendMail({
          from,
          to: email,
          subject: 'Redefinição de Senha — ThemisFlow',
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
              <h2 style="color:#00c9b1">ThemisFlow</h2>
              <p>Olá, <strong>${user.nome}</strong>.</p>
              <p>Recebemos uma solicitação para redefinir a senha da sua conta.</p>
              <p style="margin:24px 0">
                <a href="${link}" style="background:#00c9b1;color:#0b1220;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700">
                  Redefinir Senha
                </a>
              </p>
              <p style="color:#888;font-size:0.85rem">
                Este link expira em <strong>1 hora</strong>. Se você não solicitou a redefinição, ignore este e-mail.
              </p>
              <hr style="border-color:#333;margin:24px 0"/>
              <p style="color:#555;font-size:0.75rem">${link}</p>
            </div>
          `,
        });
      } else {
        // SMTP não configurado — loga o link para uso em desenvolvimento
        fastify.log.warn({ link }, 'SMTP não configurado — link de reset de senha gerado');
      }
    }

    return reply.send({ success: true, message: 'Se o e-mail existir, um link de redefinição foi enviado.' });
  });

  // GET /api/auth/validate-reset-token/:token
  fastify.get<{ Params: { token: string } }>('/validate-reset-token/:token', async (req, reply) => {
    const { token } = req.params;
    const user = await fastify.prisma.user.findUnique({ where: { resetToken: token } });

    if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
      return reply.status(400).send({ success: false, error: 'Link inválido ou expirado.' });
    }

    return reply.send({ success: true, nome: user.nome, email: user.email });
  });

  // POST /api/auth/reset-password
  fastify.post('/reset-password', async (req, reply) => {
    const schema = z.object({
      token:    z.string().min(1),
      novaSenha: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
    });
    const body = schema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.issues[0]?.message });

    const { token, novaSenha } = body.data;
    const user = await fastify.prisma.user.findUnique({ where: { resetToken: token } });

    if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
      return reply.status(400).send({ success: false, error: 'Link inválido ou expirado.' });
    }

    const hash = await bcrypt.hash(novaSenha, 12);
    await fastify.prisma.user.update({
      where: { id: user.id },
      data: { senha: hash, resetToken: null, resetTokenExpiry: null },
    });

    return reply.send({ success: true, message: 'Senha redefinida com sucesso.' });
  });
};

export default authRoutes;
