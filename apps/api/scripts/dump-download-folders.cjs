const fs = require('fs');
const path = require('path');

const downloadsDir = 'd:/restorent/apps/downloads';
const allFolders = fs.readdirSync(downloadsDir).filter(f => {
  try {
    return fs.statSync(path.join(downloadsDir, f)).isDirectory();
  } catch(e) { return false; }
});

console.log(`Total directories in downloads: ${allFolders.length}`);

// Print all folders
fs.writeFileSync('api/scripts/all-download-folders.json', JSON.stringify(allFolders, null, 2));
console.log('Saved all-download-folders.json');

