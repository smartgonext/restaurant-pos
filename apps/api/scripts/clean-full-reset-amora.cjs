const path = require('path');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');

const templatePath = path.resolve(__dirname, '../prisma/sqlite-template/dev.db');
const templateDir = path.dirname(templatePath);
if (!fs.existsSync(templateDir)) fs.mkdirSync(templateDir, { recursive: true });
if (fs.existsSync(templatePath)) fs.unlinkSync(templatePath);

const targetDbs = [
  templatePath,
  path.resolve(__dirname, '../maligai.db'),
  path.resolve(__dirname, '../prisma/maligai.db'),
  path.join(os.homedir(), 'AppData', 'Roaming', 'restaurant-saas-electron', 'restaurant.db'),
];

console.log('🔄 Creating pristine SQLite database schema at:', templatePath);
const absoluteDbUrl = `file:${templatePath.replace(/\\/g, '/')}`;

execSync('npx prisma db push --schema=prisma/schema.electron.sqlite.prisma --accept-data-loss --skip-generate', {
  cwd: path.resolve(__dirname, '..'),
  env: { ...process.env, DATABASE_URL: absoluteDbUrl },
  stdio: 'inherit',
});

console.log('🌱 Populating pristine Amora Bakes & Cafe data into template...');
execSync('node prisma/seed.js', {
  cwd: path.resolve(__dirname, '..'),
  env: { ...process.env, DATABASE_URL: absoluteDbUrl },
  stdio: 'inherit',
});

console.log('\n📦 Distributing pristine Amora DB to all target database paths...');
for (const dest of targetDbs) {
  if (dest === templatePath) continue;
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(templatePath, dest);
  console.log(`✅ Copied clean Amora DB -> ${dest} (${fs.statSync(dest).size} bytes)`);
}

console.log('\n🎉 ALL TARGET DATABASES RESEEDED CLEANLY WITH AMORA BAKES & CAFE!');
