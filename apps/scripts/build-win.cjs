const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

if (!fs.existsSync('D:\\temp')) fs.mkdirSync('D:\\temp', { recursive: true });

const env = Object.assign({}, process.env, {
  TEMP: 'D:\\temp',
  TMP: 'D:\\temp',
  npm_config_cache: 'D:\\temp\\npm-cache'
});

console.log('🚀 Running electron-builder with TEMP=D:\\temp ...');
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const res = spawnSync(npxCmd, ['electron-builder', '--win'], {
  env,
  stdio: 'inherit',
  shell: true
});

if (res.error) {
  console.error('Build error:', res.error);
  process.exit(1);
}
process.exit(res.status || 0);

