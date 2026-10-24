const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const apiRoot = process.cwd();

function run(command, args) {
  const res = spawnSync(command, args, {
    cwd: apiRoot,
    stdio: 'pipe',
    shell: false,
    windowsHide: true,
    encoding: 'utf8',
  });

  if (res.error || res.status !== 0) {
    const detail = [res.stdout || '', res.stderr || ''].join('\n').trim();
    throw new Error(`Command failed: ${command} ${args.join(' ')}\n${detail}`);
  }

  return res.stdout || '';
}

function zipDir(dirName) {
  const src = path.join(apiRoot, dirName);
  const zipPath = path.join(apiRoot, `${dirName}.zip`);

  if (!fs.existsSync(src)) {
    throw new Error(`Missing required directory: ${src}`);
  }

  if (fs.existsSync(zipPath)) {
    fs.rmSync(zipPath, { force: true });
  }

  if (process.platform === 'win32') {
    const cmd = `Compress-Archive -Path '${dirName.replace(/'/g, "''")}' -DestinationPath '${(`${dirName}.zip`).replace(/'/g, "''")}' -Force`;
    run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', cmd]);
  } else {
    run('zip', ['-rq', `${dirName}.zip`, dirName]);
  }

  if (!fs.existsSync(zipPath)) {
    throw new Error(`Failed to create zip: ${zipPath}`);
  }

  console.log(`[pack-runtime-assets] created ${path.basename(zipPath)}`);
}

function verifyNodeModulesZip() {
  const nodeModulesPrisma = path.join(apiRoot, 'node_modules', '@prisma', 'client');
  if (!fs.existsSync(nodeModulesPrisma)) {
    throw new Error('node_modules/@prisma/client is missing before zipping');
  }

  try {
    const listing = run('tar', ['-tf', 'node_modules.zip']);
    if (!listing.includes('node_modules/@prisma/client/')) {
      throw new Error('node_modules.zip does not contain @prisma/client');
    }
  } catch (err) {
    // If tar is unavailable, we still keep the zip; startup checks will validate at runtime.
    console.warn('[pack-runtime-assets] warning:', err.message);
  }
}

zipDir('node_modules');
zipDir('scripts');
zipDir('sqlite-template');
verifyNodeModulesZip();

console.log('[pack-runtime-assets] runtime zips refreshed successfully');
