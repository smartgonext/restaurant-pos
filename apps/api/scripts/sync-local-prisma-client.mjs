import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, '..');
const src = path.join(apiRoot, 'node_modules', '.prisma', 'client');
const dst = path.join(apiRoot, 'node_modules', '@prisma', 'client', '.prisma', 'client');

if (!fs.existsSync(src)) {
  throw new Error(`[prisma-sync] source directory not found: ${src}`);
}

fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.cpSync(src, dst, { recursive: true });
console.log('[prisma-sync] synchronized local @prisma/client with generated Prisma client');
