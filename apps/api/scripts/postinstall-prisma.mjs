#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Determine project directory: prefer INIT_CWD (npm sets this), fallback to cwd
const projectDir = process.env.INIT_CWD || process.cwd();

// Allow skipping prisma generate during tests or CI by setting SKIP_PRISMA_POSTINSTALL=1
if (process.env.SKIP_PRISMA_POSTINSTALL === '1') {
  console.log('[postinstall-prisma] SKIP_PRISMA_POSTINSTALL=1 set — skipping prisma generate.');
  process.exit(0);
}

// Candidate schema locations
const candidates = [
  join(projectDir, 'prisma', 'schema.prisma'),
  join(projectDir, 'schema.prisma'),
];

let schemaPath = null;
for (const c of candidates) {
  if (existsSync(c)) {
    schemaPath = c;
    break;
  }
}

if (!schemaPath) {
  console.log('[postinstall-prisma] Prisma schema not found; skipping `prisma generate`.');
  process.exit(0);
}

// Prefer local prisma binary if available, otherwise fallback to npx
const localPrisma = join(projectDir, 'node_modules', '.bin', process.platform === 'win32' ? 'prisma.cmd' : 'prisma');
let cmd, args;
if (existsSync(localPrisma)) {
  cmd = localPrisma;
  args = ['generate', '--schema', schemaPath];
} else {
  cmd = 'npx';
  args = ['prisma', 'generate', '--schema', schemaPath];
}

console.log(`[postinstall-prisma] Running: ${cmd} ${args.join(' ')}`);
// On Windows, executing .cmd directly can fail; use shell on win32 to run the command.
const res = spawnSync(cmd, args, { stdio: 'inherit', cwd: projectDir, shell: process.platform === 'win32' });
if (res.error) {
  console.error('[postinstall-prisma] prisma generate failed:', res.error);
  process.exit(res.status || 1);
}
process.exit(res.status || 0);
