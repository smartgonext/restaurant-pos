const betterSqlite = require('better-sqlite3');
const path = require('path');
const os = require('os');
const fs = require('fs');

const dbs = [
  path.resolve(__dirname, '../prisma/sqlite-template/dev.db'),
  path.resolve(__dirname, '../sqlite-template/dev.db'),
  path.resolve(__dirname, '../prisma/maligai.db'),
  path.resolve(__dirname, '../maligai.db'),
  path.join(os.homedir(), 'AppData', 'Roaming', 'restaurant-saas-electron', 'restaurant.db'),
  'C:\\Program Files\\Restaurant SaaS POS\\resources\\api\\prisma\\sqlite-template\\dev.db',
  'E:\\install\\Restaurant SaaS POS\\resources\\api\\prisma\\sqlite-template\\dev.db'
].filter(p => fs.existsSync(p));

for (const p of dbs) {
  try {
    const db = new betterSqlite(p);
    const orderCols = db.prepare("PRAGMA table_info('Order');").all().map(c => c.name);
    console.log(p);
    console.log('   deliveryExecutiveId present?', orderCols.includes('deliveryExecutiveId'));
    db.close();
  } catch (e) {
    console.log(p, 'ERR:', e.message);
  }
}
