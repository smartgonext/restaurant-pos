import fs from 'fs';
import path from 'path';

export function ensureSqliteSchemaFile(apiRootDir) {
  const prismaDir = path.join(apiRootDir, 'prisma');
  const mysqlSchemaPath = path.join(prismaDir, 'schema.prisma');
  const sqliteSchemaPath = path.join(prismaDir, 'schema.sqlite.prisma');

  if (!fs.existsSync(mysqlSchemaPath)) {
    throw new Error(`Main Prisma schema not found at ${mysqlSchemaPath}`);
  }

  const mysqlSchema = fs.readFileSync(mysqlSchemaPath, 'utf8');

  // Convert datasource to sqlite and strip provider-specific annotations that commonly break sqlite.
  let sqliteSchema = mysqlSchema
    .replace(/provider\s*=\s*"mysql"/g, 'provider = "sqlite"')
    .replace(/@db\.[A-Za-z0-9_]+(?:\([^\)]*\))?/g, '');

  // Normalize spacing after annotation removal.
  sqliteSchema = sqliteSchema
    .split('\n')
    .map((line) => line.replace(/\s+$/g, '').replace(/\s{2,}/g, ' ').replace(/\s+@/g, ' @'))
    .join('\n');

  fs.writeFileSync(sqliteSchemaPath, sqliteSchema, 'utf8');
  return sqliteSchemaPath;
}
