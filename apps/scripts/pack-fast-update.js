const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = pkg.version || '1.0.0';

const releaseDir = path.join(rootDir, 'release');
if (!fs.existsSync(releaseDir)) fs.mkdirSync(releaseDir, { recursive: true });

const stagingDir = path.join(releaseDir, 'fast-update-staging');
if (fs.existsSync(stagingDir)) {
  fs.rmSync(stagingDir, { recursive: true, force: true });
}
fs.mkdirSync(path.join(stagingDir, 'web', 'dist'), { recursive: true });
fs.mkdirSync(path.join(stagingDir, 'api', 'src'), { recursive: true });

console.log(`📦 Packaging Fast Update for v${version}...`);

// 1. Copy web/dist
const webDist = path.join(rootDir, 'web', 'dist');
if (!fs.existsSync(webDist)) {
  console.error('❌ web/dist does not exist! Run "npm run build:client" first.');
  process.exit(1);
}
fs.cpSync(webDist, path.join(stagingDir, 'web', 'dist'), { recursive: true });

// 2. Copy api/src
const apiSrc = path.join(rootDir, 'api', 'src');
if (!fs.existsSync(apiSrc)) {
  console.error('❌ api/src does not exist!');
  process.exit(1);
}
fs.cpSync(apiSrc, path.join(stagingDir, 'api', 'src'), { recursive: true });

// 3. Write metadata version.json
const meta = {
  version,
  releaseDate: new Date().toISOString(),
  name: `Fast Update v${version}`
};
fs.writeFileSync(path.join(stagingDir, 'version.json'), JSON.stringify(meta, null, 2));

// 4. Create ZIP using Windows built-in tar or PowerShell
const zipFile = path.join(releaseDir, `fast-update-v${version}.zip`);
const latestZipFile = path.join(releaseDir, 'fast-update.zip');

if (fs.existsSync(zipFile)) fs.unlinkSync(zipFile);
if (fs.existsSync(latestZipFile)) fs.unlinkSync(latestZipFile);

try {
  execSync(`tar.exe -a -c -f "${zipFile}" -C "${stagingDir}" .`);
} catch (e) {
  // Fallback to PowerShell Compress-Archive
  execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${zipFile}' -Force"`);
}

// Also make a copy named fast-update.zip for convenience
fs.copyFileSync(zipFile, latestZipFile);

// Clean up staging
try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch (e) {}

const stats = fs.statSync(zipFile);
const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
console.log(`✅ Fast Update Bundle created successfully!`);
console.log(`📁 File: ${zipFile}`);
console.log(`⚡ Size: ${stats.size} bytes (~${sizeMb} MB)`);
