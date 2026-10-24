import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { ensureSqliteSchemaFile } from './sqlite-schema-utils.mjs';

const apiRoot = process.cwd();
const templateDir = path.join(apiRoot, 'sqlite-template');
if (!fs.existsSync(templateDir)) {
  fs.mkdirSync(templateDir, { recursive: true });
}

const dbPath = path.join(templateDir, 'dev.db');
const sqliteSchemaPath = ensureSqliteSchemaFile(apiRoot);
process.env.DATABASE_URL = `file:${dbPath}`;

console.log('[sqlite-template] schema:', sqliteSchemaPath);
console.log('[sqlite-template] db:', dbPath);

try {
  execSync(`npx prisma generate --schema="${sqliteSchemaPath}"`, { stdio: 'inherit' });
  execSync(`npx prisma db push --schema="${sqliteSchemaPath}" --accept-data-loss`, { stdio: 'inherit' });
  console.log('[sqlite-template] done');
} catch (err) {
  if (!fs.existsSync(dbPath)) {
    fs.closeSync(fs.openSync(dbPath, 'w'));
  }
  console.warn('[sqlite-template] schema push failed; kept/created DB file for compatibility fallback.');
  console.warn('[sqlite-template] reason:', err?.message || err);
}
