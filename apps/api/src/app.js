import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import fastifyCompress from '@fastify/compress';
import formbody from '@fastify/formbody';
import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── dotenv: load ONLY if the variable is not already set ──────────────────────
// CRITICAL: use override:false so DATABASE_URL injected by Electron is never
// clobbered by the MySQL URL that lives in apps/api/.env
try {
  const { default: dotenv } = await import('dotenv');
  const dotenvPathCandidate = path.resolve(process.cwd(), 'apps/api/.env');
  const rootDotenvPath = path.resolve(process.cwd(), '.env');
  const localDotenvPath = path.join(__dirname, '..', '.env');

  if (fs.existsSync(dotenvPathCandidate)) {
    dotenv.config({ path: dotenvPathCandidate, override: false });
    console.info('[dotenv] Loaded (no-override)', dotenvPathCandidate);
  } else if (fs.existsSync(localDotenvPath)) {
    dotenv.config({ path: localDotenvPath, override: false });
    console.info('[dotenv] Loaded (no-override)', localDotenvPath);
  } else if (fs.existsSync(rootDotenvPath)) {
    dotenv.config({ path: rootDotenvPath, override: false });
    console.info('[dotenv] Loaded (no-override)', rootDotenvPath);
  } else {
    console.warn('[dotenv] No .env file found — using process environment only.');
  }
} catch (dotenvErr) {
  // dotenv is optional in production (not installed after prune) — that's fine
  // as long as Electron already set all required env vars.
  console.warn('[dotenv] Module not available, skipping:', dotenvErr.message);
}

// ── Validate required env vars ────────────────────────────────────────────────
console.info('[env] DATABASE_URL=', process.env.DATABASE_URL || '(not set)');
console.info('[env] NODE_ENV=', process.env.NODE_ENV || 'development');
console.info('[env] PORT=', process.env.PORT || '3001');

if (!process.env.DATABASE_URL) {
  console.error('[fatal] DATABASE_URL is not set. Set it via apps/api/.env or Electron environment.');
  throw new Error('DATABASE_URL is not set. Cannot start server.');
}

// ── Routes ────────────────────────────────────────────────────────────────────
import { authRoutes } from './routes/auth/index.js';
import { superadminRoutes } from './routes/superadmin/index.js';
import { restaurantRoutes } from './routes/restaurant/index.js';
import { customerRoutes } from './routes/customer/index.js';
import { subposRoutes } from './routes/subpos/index.js';
import { mainposRoutes } from './routes/mainpos/index.js';
import { advancedFeaturesRoutes } from './routes/advancedFeatures.js';
import { lanSyncRoutes } from './routes/restaurant/lanSync.js';
import { checkAndResetTokenCounters } from './utils/tokenCounter.js';
import { handleCloudSyncPushRoute } from './utils/cloudSync.js';
import { startErpSyncEngine } from './routes/restaurant/erpStore.js';

export const prisma = new PrismaClient();

import { idempotencyHook } from './middleware/idempotency.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true },
      },
    },
  });

  // Register Idempotency protection hook
  app.addHook('onRequest', idempotencyHook);

  // ── CORS ──────────────────────────────────────────────────────────────────
  const allowedOrigins = [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    'http://26.166.42.176:5173',
    'http://192.168.1.5:5173',
    'https://bakery.smartgonext.com',
    'http://localhost:3001',
    'http://localhost:5173',
  ];

  /**
   * Allow Electron origins:
   *  - origin === undefined  → same-origin or curl/Postman (allow)
   *  - origin === 'null'     → Electron packaged file:// page (allow)
   *  - origin starts with file:// → Electron dev mode (allow)
   */
  const isAllowedElectronOrigin = (origin) => {
    if (!origin) return true;          // no origin header
    if (origin === 'null') return true; // Electron packaged (file:// → null)
    return origin === 'file:' || origin.startsWith('file://');
  };

  // ── Private Network Access header (Chrome 94+) ────────────────────────────
  // IMPORTANT: Must be registered BEFORE cors plugin to ensure it's added to OPTIONS responses
  app.addHook('onRequest', (request, reply, done) => {
    try {
      reply.header('Access-Control-Allow-Private-Network', 'true');
    } catch {
      // ignore
    }
    done();
  });

  await app.register(cors, {
    origin: (origin, callback) => {
      // Electron / Local File
      if (isAllowedElectronOrigin(origin)) {
        callback(null, true);
        return;
      }
      
      // Development & LAN Local Subnet Access (192.168.x.x, 10.x.x.x, 26.x.x.x VPN, etc)
      if (!origin || process.env.NODE_ENV !== 'production' || /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|26\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin)) {
        callback(null, true);
        return;
      }

      // Production: Check allowed list
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // Fallback allow for local LAN connections
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type', 
      'Authorization', 
      'Accept', 
      'Origin', 
      'X-Requested-With',
      'Access-Control-Request-Private-Network'
    ],
    maxAge: 86400, // 24 hours preflight cache
  });

  // ── ISSUE-001 FIX: JWT Secret Hardening ─────────────────────────────────────
  // CRITICAL SECURITY: Prevent JWT secret fallback attacks (CVSS 7.5)
  // Root Cause: Fallback secrets allow attackers to forge tokens
  // Fix: Strict validation, fail-fast, no defaults allowed
  
  const JWT_SECRET = process.env.JWT_SECRET;
  const JWT_ALGORITHM = process.env.JWT_ALGORITHM || 'HS256';
  const IS_PRODUCTION = process.env.NODE_ENV === 'production';
  
  // ──────────────────────────────────────────────────────────────────────────
  // VALIDATION 1: Secret must exist
  // ──────────────────────────────────────────────────────────────────────────
  if (!JWT_SECRET) {
    const errorMsg = [
      '',
      '═══════════════════════════════════════════════════════════════',
      '🔴 FATAL: JWT_SECRET environment variable is NOT SET',
      '═══════════════════════════════════════════════════════════════',
      '',
      'ISSUE-001 SECURITY ISSUE: Token forgery vulnerability detected',
      'When JWT_SECRET is missing, token authentication will fail.',
      'Or worse - a hardcoded fallback allows attackers to forge tokens.',
      '',
      'IMPACT: Attackers can impersonate any user, access sensitive data,',
      'and perform unauthorized actions (create orders, delete inventory, etc.)',
      '',
      'REQUIRED ACTION:',
      '1. Generate a secure 32+ character secret:',
      '',
      '   node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      '',
      '2. Set in environment (before starting server):',
      '',
      '   export JWT_SECRET="<paste-generated-secret-here>"',
      '',
      '3. Or in .env file:',
      '',
      '   JWT_SECRET=<paste-generated-secret-here>',
      '',
      '═══════════════════════════════════════════════════════════════',
      ''
    ].join('\\n');
    console.error(errorMsg);
    process.exit(1); // Fail immediately - never start without JWT_SECRET
  }
  
  // ──────────────────────────────────────────────────────────────────────────
  // VALIDATION 2: Secret length (OWASP: 32+ chars = 256 bits for HS256)
  // ──────────────────────────────────────────────────────────────────────────
  if (JWT_SECRET.length < 32) {
    const errorMsg = [
      '',
      '═══════════════════════════════════════════════════════════════',
      '🔴 FATAL: JWT_SECRET is too short (needs 32+ characters)',
      '═══════════════════════════════════════════════════════════════',
      '',
      `Current length: ${JWT_SECRET.length} characters`,
      'Minimum required: 32 characters (256 bits for HS256)',
      'Recommended: 64 characters (512 bits for maximum security)',
      '',
      'SECURITY RISK: Weak secrets enable brute-force attacks.',
      'A proper 32-character secret provides 2^256 possible combinations.',
      '',
      'Generate a new secure secret:',
      'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      '',
      'For extra security (64 chars):',
      'node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"',
      '',
      '═══════════════════════════════════════════════════════════════',
      ''
    ].join('\\n');
    console.error(errorMsg);
    process.exit(1);
  }
  
  // ──────────────────────────────────────────────────────────────────────────
  // VALIDATION 3: Detect weak/test patterns (development warning)
  // ──────────────────────────────────────────────────────────────────────────
  const weakSecretPatterns = [
    /^(test|password|secret|default|fallback)/i,     // Common weak words
    /^([a-z])\\1{31,}$/,                              // Repeated characters
    /^(123|456|789|abc|def)/i,                        // Sequential patterns
    /^(demo|staging|dev|development|localhost)/i,    // Environment indicators
  ];
  
  const isWeakSecret = weakSecretPatterns.some(pattern => pattern.test(JWT_SECRET));
  if (isWeakSecret) {
    const warnMsg = [
      '⚠️  JWT_SECRET appears to be a weak/test value',
      'Pattern: ' + JWT_SECRET.substring(0, 12) + '...',
      'Action: Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    ].join(' ');
    
    if (IS_PRODUCTION) {
      console.error('\\n🔴 FATAL: ' + warnMsg);
      process.exit(1);
    } else {
      app.log.warn('[JWT] ' + warnMsg + ' (non-production)');
    }
  }
  
  // ──────────────────────────────────────────────────────────────────────────
  // VALIDATION 4: Algorithm validation
  // ──────────────────────────────────────────────────────────────────────────
  const SUPPORTED_ALGORITHMS = ['HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512'];
  if (!SUPPORTED_ALGORITHMS.includes(JWT_ALGORITHM)) {
    throw new Error(
      `[JWT] Invalid algorithm. Supported: ${SUPPORTED_ALGORITHMS.join(', ')}, got: ${JWT_ALGORITHM}`
    );
  }
  
  // ──────────────────────────────────────────────────────────────────────────
  // SUCCESS: Log JWT configuration (without exposing secret)
  // ──────────────────────────────────────────────────────────────────────────
  app.log.info({
    module: 'JWT',
    algorithm: JWT_ALGORITHM,
    secretLength: JWT_SECRET.length,
    environment: process.env.NODE_ENV || 'development',
    status: '✅ Validated',
  }, '[JWT] Configuration validated successfully');
  
  // ──────────────────────────────────────────────────────────────────────────
  // Register JWT plugin with hardened configuration
  // ──────────────────────────────────────────────────────────────────────────
  try {
    await app.register(jwt, {
      secret: JWT_SECRET,
      sign: {
        algorithm: JWT_ALGORITHM,
        expiresIn: '15m', // Staff tokens expire after 15 minutes
      },
    });
  } catch (jwtErr) {
    app.log.error({ error: jwtErr }, '[JWT] Failed to register JWT plugin');
    throw new Error('[JWT Plugin Registration Failed] ' + (jwtErr instanceof Error ? jwtErr.message : String(jwtErr)));
  }

  await app.register(rateLimit, {
    max: process.env.NODE_ENV === 'production' ? 1000 : 10000,
    timeWindow: '1 minute',
    cache: 10000,
    skipOnError: false,
    keyGenerator: (request) => {
      // Rate limit per IP, not globally
      return request.headers['x-forwarded-for'] || request.ip || 'unknown';
    }
  });

  // ── High Performance Gzip / Deflate Compression ──────────────────────────
  await app.register(fastifyCompress, {
    encodings: ['gzip', 'deflate'],
    threshold: 1024, // Compress anything larger than 1KB
  });

  await app.register(formbody);

  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  });

  // ── Static uploads ────────────────────────────────────────────────────────
  const uploadsDir = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'));
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  await app.register(fastifyStatic, {
    root: uploadsDir,
    prefix: '/static/',
    decorateReply: false,
  });

  await app.register(fastifyStatic, {
    root: uploadsDir,
    prefix: '/uploads/',
    decorateReply: false,
  });

  // ── Decorators ────────────────────────────────────────────────────────────
  app.decorate('prisma', prisma);

  // ── Security Headers ────────────────────────────────────────────────────────
  app.addHook('onSend', (request, reply, payload, done) => {
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Content Security Policy - prevent XSS attacks
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none';"
    );
    
    // Prevent clickjacking
    reply.header('X-Frame-Options', 'DENY');
    
    // Prevent MIME type sniffing
    reply.header('X-Content-Type-Options', 'nosniff');
    
    // Disable legacy XSS filter (modern browsers)
    reply.header('X-XSS-Protection', '0');
    
    // Referrer policy for privacy
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Feature policy - restrict dangerous APIs
    reply.header('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), usb=()');
    
    // HSTS for HTTPS enforcement
    if (isProduction) {
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
    
    done();
  });

  // ── Health endpoint ───────────────────────────────────────────────────────
  app.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // ── Seed endpoint ─────────────────────────────────────────────────────────
  app.get('/seed', async (req, reply) => {
    try {
      const mod = await import('../prisma/seed.js');
      if (typeof mod.runSeed !== 'function') throw new Error('runSeed not found');
      await mod.runSeed();
      return { success: true, message: 'Seed completed' };
    } catch (err) {
      app.log.error(err);
      reply.status(500);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── Route registration ────────────────────────────────────────────────────
  await app.register(authRoutes,            { prefix: '/api/auth' });
  await app.register(superadminRoutes,      { prefix: '/api/superadmin' });
  await app.register(restaurantRoutes,      { prefix: '/api/restaurant' });
  await app.register(customerRoutes,        { prefix: '/api/customer' });
  await app.register(subposRoutes,          { prefix: '/api/subpos' });
  await app.register(mainposRoutes,         { prefix: '/api/mainpos' });
  await app.register(advancedFeaturesRoutes, { prefix: '/api' });
  await app.register(lanSyncRoutes,          { prefix: '/api/lan-sync' });

  // Cloud database synchronization receiver endpoint
  app.post('/api/sync/push', handleCloudSyncPushRoute);

  // ── Serve built web static files ──────────────────────────────────────────
  try {
    const candidates = [
      process.env.WEB_DIST_PATH,
      process.resourcesPath ? path.join(process.resourcesPath, 'web', 'dist') : null,
      path.join(__dirname, '..', '..', 'web', 'dist'),
      path.join(process.cwd(), '..', 'web', 'dist'),
      path.join(process.cwd(), 'web', 'dist'),
      path.join(process.cwd(), 'apps', 'web', 'dist')
    ].filter(Boolean);

    const webDist = candidates.find(c => fs.existsSync(c));

    if (webDist) {
      app.log.info(`[Static] Serving web frontend from: ${webDist}`);
      await app.register(fastifyStatic, {
        root: webDist,
        prefix: '/',
        decorateReply: true,
        maxAge: 31536000000, // 1 year for hashed assets
        immutable: true,
        setHeaders: (res, pathName) => {
          if (pathName.endsWith('.html') || pathName.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          } else {
            // Content-hashed static JS/CSS/Fonts/Images: Cache permanently in Chrome
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        }
      });

      const indexHtmlPath = path.join(webDist, 'index.html');

      app.setNotFoundHandler((request, reply) => {
        if (request.url.startsWith('/api/')) {
          return reply.code(404).send({ success: false, error: 'Not Found' });
        }
        reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
        if (typeof reply.sendFile === 'function') {
          return reply.sendFile('index.html');
        }
        if (fs.existsSync(indexHtmlPath)) {
          return reply.type('text/html').send(fs.createReadStream(indexHtmlPath));
        }
        return reply.code(404).send({ success: false, error: 'Web UI dist index.html not found' });
      });
    } else {
      app.log.warn('[Static] No web dist folder found among candidates: ' + candidates.join(', '));
    }
  } catch (err) {
    app.log.warn({ err }, 'Could not setup static file serving');
  }

  // ── Daily token counter reset cron ────────────────────────────────────────
  const tokenResetInterval = setInterval(async () => {
    try {
      await checkAndResetTokenCounters(prisma);
    } catch (err) {
      app.log.error({ err }, '[TokenCron] Reset check failed');
    }
  }, 60_000);
  tokenResetInterval.unref();

  // ── Background ERP sync engine ───────────────────────────────────────────
  startErpSyncEngine(app.log);

  app.setErrorHandler((error, request, reply) => {
    app.log.error(error);
    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      success: false,
      error: error.message || 'Internal Server Error',
    });
  });

  // ── Auto-seed check on startup ───────────────────────────────────────────
  setTimeout(async () => {
    try {
      const packageCount = await prisma.package.count();
      if (packageCount === 0) {
        app.log.info('🌱 Database appears empty. Running auto-seed...');
        const { runSeed } = await import('../prisma/seed.js');
        await runSeed();
        app.log.info('✅ Auto-seed completed.');
      }
    } catch (err) {
      app.log.error({ err }, 'Auto-seed check failed');
    }
  }, 2000);

  return app;
}
