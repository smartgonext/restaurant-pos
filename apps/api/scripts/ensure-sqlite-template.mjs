import fs from 'fs';
import path from 'path';

const apiRoot = process.cwd();
const templateDir = path.join(apiRoot, 'apps', 'api', 'sqlite-template');
const dbPath = path.join(templateDir, 'dev.db');

if (!fs.existsSync(templateDir)) {
  fs.mkdirSync(templateDir, { recursive: true });
}

if (!fs.existsSync(dbPath)) {
  fs.closeSync(fs.openSync(dbPath, 'w'));
  console.log('[sqlite-template] created empty template DB:', dbPath);
} else {
  console.log('[sqlite-template] template DB already exists:', dbPath);
}

const stats = fs.statSync(dbPath);
if (stats.size <= 0) {
  console.error('[sqlite-template] template DB is empty. Build must generate schema before packaging:', dbPath);
  process.exit(1);
}

console.log('[sqlite-template] template DB size bytes:', stats.size);
