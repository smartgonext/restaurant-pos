const fs = require('fs');
const path = require('path');

const downloadsDir = 'd:/restorent/apps/downloads';
const files = fs.readdirSync(downloadsDir);
console.log('Total files in downloads directory:', files.length);

const keywords = [
  'rusk', 'brownie', 'choco cake', 'pudding', 'banana', 'carrot', 'jackfruit',
  'marble', 'raisin', 'bar cake', 'lotte', 'chocopie', 'jewel', 'peanut butter',
  'bournville', 'milkshake combo', 'delicacy'
];

for (const kw of keywords) {
  const matches = files.filter(f => f.toLowerCase().includes(kw));
  console.log(`Keyword "${kw}": ${matches.length} files ->`, matches.slice(0, 5));
}

