import fs from 'fs';
import path from 'path';

const inputPath = path.resolve('apps/api/prisma/schema.sqlite.prisma');
const outputPath = path.resolve('apps/api/prisma/schema.electron.sqlite.prisma');

if (!fs.existsSync(inputPath)) {
  console.error('[schema-gen] Missing input schema:', inputPath);
  process.exit(1);
}

const raw = fs.readFileSync(inputPath, 'utf8');

const enumNames = [];
const enumValues = new Set();
const withoutEnums = raw.replace(/enum\s+(\w+)\s*\{([\s\S]*?)\n\}/g, (_m, enumName, enumBody) => {
  enumNames.push(enumName);
  for (const line of enumBody.split('\n')) {
    const value = line.trim();
    if (!value || value.startsWith('//')) continue;
    const token = value.split(/\s+/)[0];
    if (token) enumValues.add(token);
  }
  return '';
});

let transformed = withoutEnums
  .replace(/\bJson\?/g, 'String?')
  .replace(/\bJson\b/g, 'String');

for (const enumName of enumNames) {
  const enumTypeRegex = new RegExp(`(\\s\\w+\\s+)${enumName}(\\??\\s)`, 'g');
  transformed = transformed.replace(enumTypeRegex, '$1String$2');
}

for (const enumValue of enumValues) {
  const enumDefaultRegex = new RegExp(`@default\\(${enumValue}\\)`, 'g');
  transformed = transformed.replace(enumDefaultRegex, `@default(\"${enumValue}\")`);
}

fs.writeFileSync(outputPath, transformed, 'utf8');
console.log('[schema-gen] Generated SQLite-compatible schema:', outputPath);
