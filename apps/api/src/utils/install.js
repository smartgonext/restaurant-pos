const fs = require('fs');
const path = require('path');

async function ensureAppDb() {
  const rawUrl = process.env.DATABASE_URL || '';
  if (!rawUrl.startsWith('file:')) {
    console.log('[install] DATABASE_URL is not a sqlite file, skipping local file creation');
    return;
  }

  const sqliteRelPath = rawUrl.replace(/^file:/, '');
  const dbPath = path.isAbsolute(sqliteRelPath)
    ? sqliteRelPath
    : path.resolve(process.cwd(), sqliteRelPath);

  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    try {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log('[install] created directory', dbDir);
    } catch (e) {
      console.error('[install] failed to create directory', dbDir, e.message);
    }
  }
  
  if (!fs.existsSync(dbPath)) {
    try {
      fs.closeSync(fs.openSync(dbPath, 'w'));
      console.log('[install] created empty sqlite file at', dbPath);
    } catch (e) {
      console.error('[install] failed to create empty sqlite file at', dbPath, e.message);
    }
  } else {
    console.log('[install] sqlite file exists at', dbPath);
  }
}

module.exports = {
  ensureAppDb
};
