import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import formbody from '@fastify/formbody';
import { PrismaClient } from '@prisma/client';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

// Routes
import { authRoutes } from './routes/auth/index.js';
import { superadminRoutes } from './routes/superadmin/index.js';
import { restaurantRoutes } from './routes/restaurant/index.js';
import { customerRoutes } from './routes/customer/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const prisma = new PrismaClient();

export async function buildApp() {
  const app = Fastify({
    logger: {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true },
      },
    },
  });

  // ── Plugins ──
  await app.register(cors as any, {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  });

  await app.register(jwt as any, {
    secret: process.env.JWT_SECRET || 'fallback-secret-change-me',
  });

  await app.register(rateLimit as any, {
    max: 100,
    timeWindow: '1 minute',
  });

  await app.register(formbody as any);

  await app.register(multipart as any, {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  });

  // Static file serving for uploads
  await app.register(fastifyStatic as any, {
    root: path.join(__dirname, '..', 'uploads'),
    prefix: '/static/',
    decorateReply: false,
  });

  // ── Decorate ──
  app.decorate('prisma', prisma);

  // ── Health Check ──
  app.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // ── Routes ──
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(superadminRoutes, { prefix: '/api/superadmin' });
  await app.register(restaurantRoutes, { prefix: '/api/restaurant' });
  await app.register(customerRoutes, { prefix: '/api/customer' });

  // ── Error Handler ──
  app.setErrorHandler((error, request, reply) => {
    app.log.error(error);
    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      success: false,
      error: error.message || 'Internal Server Error',
    });
  });

  return app;
}
