process.env.TZ = 'America/Sao_Paulo';

import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';

import prismaPlugin from './plugins/prisma.js';
import authPlugin from './plugins/auth.js';
import duckdbPlugin from './plugins/duckdb.js';
import authRoutes from './routes/auth.js';
import menuRoutes from './routes/menu.js';
import usersRoutes from './routes/users.js';
import rolesRoutes from './routes/roles.js';
import menuAdminRoutes from './routes/menu-admin.js';
import sitefRoutes from './routes/sitef.js';
import taxasRoutes from './routes/taxas.js';
import adquirenteRoutes from './routes/adquirente.js';
import adquirenteDuckRoutes from './routes/adquirente-duck.js';
import ofxPadroesRoutes from './routes/ofx-padroes.js';
import empresaRoutes from './routes/empresa.js';
import dashboardRoutes from './routes/dashboard.js';
import sftpRoutes from './routes/sftp.js';
import { initSftpSchedulers } from './services/sftp-service.js';

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '0.0.0.0';

const fastify = Fastify({
  logger: process.env.NODE_ENV !== 'production'
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : true,
  // Planilhas SITEF grandes podem gerar payloads de vários MB em JSON
  bodyLimit: 50 * 1024 * 1024, // 50 MB
});

// ── Plugins ──────────────────────────────────────────────────────
await fastify.register(cors, {
  origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  credentials: true,
});

await fastify.register(rateLimit, {
  max: 200,
  timeWindow: '1 minute',
});

await fastify.register(cookie);

await fastify.register(jwt, {
  secret: process.env.JWT_SECRET ?? (() => { throw new Error('JWT_SECRET é obrigatório'); })(),
});

await fastify.register(prismaPlugin);
await fastify.register(duckdbPlugin);
await fastify.register(authPlugin);

// ── Rotas ─────────────────────────────────────────────────────────
await fastify.register(authRoutes,     { prefix: '/api/auth' });
await fastify.register(menuRoutes,     { prefix: '/api/menu' });
await fastify.register(usersRoutes,    { prefix: '/api/users' });
await fastify.register(rolesRoutes,    { prefix: '/api/roles' });
await fastify.register(menuAdminRoutes, { prefix: '/api/menu-admin' });
await fastify.register(sitefRoutes,      { prefix: '/api/sitef' });
await fastify.register(taxasRoutes,      { prefix: '/api/taxas' });
await fastify.register(adquirenteRoutes,     { prefix: '/api/adquirente' });
await fastify.register(adquirenteDuckRoutes, { prefix: '/api/adquirente' });
await fastify.register(ofxPadroesRoutes,  { prefix: '/api/ofx-padroes' });
await fastify.register(empresaRoutes,     { prefix: '/api/empresa' });
await fastify.register(dashboardRoutes,   { prefix: '/api/dashboard' });
await fastify.register(sftpRoutes,        { prefix: '/api/sftp' });

// ── Health check ──────────────────────────────────────────────────
fastify.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));
fastify.get('/api/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));

// ── Erro global ───────────────────────────────────────────────────
fastify.setErrorHandler((error: Error & { statusCode?: number }, _req, reply) => {
  fastify.log.error(error);
  const status = error.statusCode ?? 500;
  reply.status(status).send({ success: false, error: error.message });
});

// ── Start ─────────────────────────────────────────────────────────
try {
  await fastify.listen({ port: PORT, host: HOST });
  await initSftpSchedulers(fastify.prisma);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
