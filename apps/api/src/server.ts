import { buildApp, prisma } from './app.js';
import { Server } from 'socket.io';
import { setupSocketIO } from './plugins/socket.js';

const PORT = parseInt(process.env.PORT || '3001', 10);

async function start() {
  const app = await buildApp();

  // Start HTTP server
  await app.listen({ port: PORT, host: '0.0.0.0' });

  // Setup Socket.IO
  const io = new Server(app.server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      credentials: true,
    },
  });

  setupSocketIO(io);

  app.log.info(`🚀 Server running at http://localhost:${PORT}`);
  app.log.info(`📡 Socket.IO listening`);

  // Graceful shutdown
  const signals = ['SIGINT', 'SIGTERM'] as const;
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down...`);
      await app.close();
      await prisma.$disconnect();
      io.close();
      process.exit(0);
    });
  }
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
