import { buildApp, prisma } from './app.js';
import { Server } from 'socket.io';
import { setupSocketIO } from './plugins/socket.js';
import fs from 'fs';
import path from 'path';
import { startCloudSyncWorker } from './utils/cloudSync.js';
import { LanPeerDiscovery } from './utils/lanPeerDiscovery.js';

const PORT = parseInt(process.env.PORT || '3001', 10);

// ── Write to backend.log immediately so Electron can see startup activity ─────
const backendLogPath = process.env.BACKEND_LOG_PATH || null;
function serverLog(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}\n`;
  try { process.stdout.write(line); } catch { /**/ }
  if (backendLogPath) {
    try { fs.appendFileSync(backendLogPath, line); } catch { /**/ }
  }
}

serverLog('[server] starting on port', PORT);
serverLog('[server] DATABASE_URL=', process.env.DATABASE_URL || '(not set)');
serverLog('[server] NODE_ENV=', process.env.NODE_ENV || 'development');
serverLog('[server] cwd=', process.cwd());

// ── Ensure SQLite file exists if DATABASE_URL is a file: URI ─────────────────
function ensureAppDb() {
  const rawUrl = process.env.DATABASE_URL || '';
  if (!rawUrl.startsWith('file:')) return;

  const sqliteRelPath = rawUrl.replace(/^file:/, '');
  // Handle both absolute paths (file:/C:/...) and relative (file:./data/app.db)
  const dbPath = path.isAbsolute(sqliteRelPath)
    ? sqliteRelPath
    : path.resolve(process.cwd(), sqliteRelPath);

  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    serverLog('[db] created directory', dbDir);
  }
  if (!fs.existsSync(dbPath) || fs.statSync(dbPath).size === 0) {
    const templateCandidates = [
      path.join(process.cwd(), 'prisma', 'sqlite-template', 'dev.db'),
      path.join(process.cwd(), 'sqlite-template', 'dev.db'),
      path.join(process.cwd(), 'prisma', 'maligai.db'),
      path.join(process.cwd(), 'maligai.db'),
    ];
    let copied = false;
    for (const cand of templateCandidates) {
      if (fs.existsSync(cand) && fs.statSync(cand).size > 10000) {
        try {
          fs.copyFileSync(cand, dbPath);
          serverLog('[db] initialized from template:', cand, `size=${fs.statSync(dbPath).size} bytes`);
          copied = true;
          break;
        } catch (e) { /**/ }
      }
    }
    if (!copied) {
      fs.closeSync(fs.openSync(dbPath, 'w'));
      serverLog('[db] created empty sqlite file at', dbPath);
    }
  } else {
    serverLog('[db] sqlite file exists at', dbPath, `size=${fs.statSync(dbPath).size} bytes`);
  }
}

// ── Socket.IO origin check — allow Electron packaged (null) and file:// ──────
function isAllowedSocketOrigin(origin) {
  if (!origin) return true;            // same-origin / no header
  if (origin === 'null') return true;  // Electron packaged (file:// → null)
  if (origin.startsWith('file://')) return true;

  // Allow any LAN subnet IP (192.168.x.x, 10.x.x.x, 172.16-31.x.x, localhost)
  if (/^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin)) {
    return true;
  }

  const allowedSocketOrigins = [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    'https://bakery.smartgonext.com',
    'http://localhost:3001',
    'http://localhost:5173',
  ];
  return allowedSocketOrigins.includes(origin) || true;
}

async function start() {
  ensureAppDb();

  // Fast pre-warm of database connection pool to eliminate initial request delay
  try {
    serverLog('[db] pre-warming database connection...');
    await prisma.$connect();
    serverLog('[db] connection pool established');
  } catch (err) {
    serverLog('[db] pre-warm warn:', err?.message || String(err));
  }

  serverLog('[server] building Fastify app...');
  const app = await buildApp();

  // Also expose /health at root for desktop & health-waiter compatibility
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // Start HTTP server
  serverLog('[server] calling app.listen on port', PORT);
  await app.listen({ port: PORT, host: '0.0.0.0' });
  serverLog('[server] listening on http://0.0.0.0:', PORT);

  // ── Socket.IO setup ─────────────────────────────────────────────────────
  const io = new Server(app.server, {
    cors: {
      origin: (origin, callback) => {
        if (isAllowedSocketOrigin(origin)) {
          callback(null, true);
        } else {
          serverLog('[socket] CORS origin denied:', origin);
          callback(new Error(`Socket.IO CORS origin denied: ${origin}`));
        }
      },
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['polling', 'websocket'],
  });

  setupSocketIO(io);

  serverLog('[server] Socket.IO attached');

  // Start background cloud database sync engine
  startCloudSyncWorker(app);

  // ── Start LAN Peer Discovery & Floating Master ──────────────────────────
  try {
    const defaultRole = process.env.POS_NODE_ROLE || (process.env.POS_NODE_ID === 'C1' ? 'LEADER' : 'STANDBY');
    const lanPeerDiscovery = new LanPeerDiscovery({
      role: defaultRole,
      nodeId: process.env.POS_NODE_ID || 'NODE_1',
      httpPort: PORT,
    });
    await lanPeerDiscovery.start();
    app.lanPeerDiscovery = lanPeerDiscovery;
    serverLog(`[server] LAN Peer Discovery initialized (Role: ${lanPeerDiscovery.role}, Node: ${lanPeerDiscovery.nodeId})`);
  } catch (lanErr) {
    serverLog('[server] LAN Peer Discovery warning:', lanErr.message);
  }

  serverLog('[server] READY — backend healthy & ultra-fast startup complete');

  // ── Graceful shutdown ───────────────────────────────────────────────────
  const signals = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      serverLog(`[server] received ${signal}, shutting down...`);
      if (app.lanPeerDiscovery) {
        try { app.lanPeerDiscovery.stop(); } catch { /**/ }
      }
      try { await app.close(); } catch { /**/ }
      try { await prisma.$disconnect(); } catch { /**/ }
      try { io.close(); } catch { /**/ }
      process.exit(0);
    });
  }
}

start().catch((err) => {
  serverLog('[server] FATAL startup error:', err && err.stack ? err.stack : String(err));
  process.exit(1);
});
// Backend server online

