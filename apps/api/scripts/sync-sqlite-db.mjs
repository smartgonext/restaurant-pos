import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { ensureSqliteSchemaFile } from './sqlite-schema-utils.mjs';

const apiRoot = process.cwd();
const argDbPath = process.argv[2];
const dbPath = argDbPath
  ? path.resolve(argDbPath)
  : path.join(apiRoot, 'sqlite-template', 'dev.db');

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const sqliteSchemaPath = ensureSqliteSchemaFile(apiRoot);
process.env.DATABASE_URL = `file:${dbPath}`;

console.log('[sqlite-sync] schema:', sqliteSchemaPath);
console.log('[sqlite-sync] db:', dbPath);

try {
  execSync(`npx prisma generate --schema="${sqliteSchemaPath}"`, { stdio: 'inherit' });
  // db push is idempotent: it creates missing tables/columns while preserving existing data where possible.
  execSync(`npx prisma db push --schema="${sqliteSchemaPath}" --accept-data-loss`, { stdio: 'inherit' });
  console.log('[sqlite-sync] done');
} catch (err) {
  console.warn('[sqlite-sync] skipped due to sqlite/mysql schema incompatibility.');
  console.warn('[sqlite-sync] reason:', err?.message || err);
}
