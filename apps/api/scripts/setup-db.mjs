#!/usr/bin/env node
import { spawnSync } from 'child_process';
import path from 'path';

function run(command, args=[]) {
  const res = spawnSync(command, args, { stdio: 'inherit', shell: true, cwd: path.resolve(process.cwd()) });
  return res.status === 0;
}

console.log('→ Attempting to apply migrations (production-safe)...');
// Try migrate deploy first (for production flows). If it fails, fallback to db push.
if (!run('npx', ['prisma', 'migrate', 'deploy', '--schema=prisma/schema.prisma'])) {
  console.log('→ migrate deploy failed or no migrations, falling back to prisma db push');
  if (!run('npx', ['prisma', 'db', 'push', '--schema=prisma/schema.prisma'])) {
    console.error('✖ Both migrate deploy and db push failed. See output above.');
    process.exit(1);
  }
}

console.log('→ Running seed script (if available)');
// run the npm seed script (uses tsx)
run('npm', ['run', 'db:seed']);

console.log('✔ Database schema applied and seed attempted');
