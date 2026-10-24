import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const specs = [
  'login.spec.mjs',
  'navigation.spec.mjs',
  'create-dashboard-sync.spec.mjs',
  'responsive-smoke.spec.mjs',
  'loyalty-e2e.spec.mjs',
  'supplier-persistence.spec.mjs',
  'full-restaurant-bakery-dept-e2e.spec.mjs',
];

async function runSpec(spec) {
  return new Promise((resolve) => {
    const specPath = fileURLToPath(new URL(spec, import.meta.url));
    const child = spawn(process.execPath, [specPath], {
      stdio: 'inherit',
      shell: false,
      env: process.env,
    });
    child.on('exit', (code) => resolve({ spec, code: code ?? 1 }));
  });
}

(async () => {
  const results = [];
  for (const spec of specs) {
    // eslint-disable-next-line no-await-in-loop
    const r = await runSpec(spec);
    results.push(r);
  }

  const failed = results.filter((r) => r.code !== 0);
  console.log(JSON.stringify({ summary: results, failed: failed.length }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
})();
