const fs = require('fs');
const path = require('path');

const amoraNonKot = JSON.parse(fs.readFileSync('api/prisma/amora-non-kot-products.json', 'utf8'));

console.log('Checking last 40 items in amora-non-kot-products.json:');
const downloadsDir = 'd:/restorent/apps/downloads';
const allFolders = fs.readdirSync(downloadsDir);

for (let i = amoraNonKot.length - 35; i < amoraNonKot.length; i++) {
  const it = amoraNonKot[i];
  const imgPath = it.image;
  const exists = fs.existsSync(path.join('api', imgPath));
  
  // Find matching download folder
  const cleanName = it.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const matchedFolder = allFolders.find(f => {
    const fclean = f.toLowerCase();
    return fclean.includes(cleanName.substring(0, 10)) || cleanName.includes(fclean.substring(0, 10));
  });

  let candFiles = [];
  if (matchedFolder) {
    try {
      candFiles = fs.readdirSync(path.join(downloadsDir, matchedFolder));
    } catch(e) {}
  }

  console.log(`[#${i+1}] ${it.name} (QR: ${it.productQR})`);
  console.log(`   Image assigned: ${imgPath} (exists: ${exists})`);
  console.log(`   Downloads folder match: ${matchedFolder || 'NONE'} -> files:`, candFiles);
}

