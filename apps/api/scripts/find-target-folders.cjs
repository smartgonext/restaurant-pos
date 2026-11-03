const fs = require('fs');
const allFolders = JSON.parse(fs.readFileSync('api/scripts/all-download-folders.json', 'utf8'));

const targets = [
  'MM Nimbu Fresh Tetra 150ml',
  'Cool Coffee Chocolate 180ml',
  'Glucovita Lemon 180ml',
  'Cool Coffee vanilla 180ml',
  'Star Cashew With Dates 200gm',
  'Star Almond With Dates 200gm',
  'Livinda Medelin Milk 2kg (8)',
  'Flemish Sparkling Cocktail Red 750ml*12',
  'YT Dragees Black Currant Almond 50gm',
  'Windfire Hello Sweetheart Jelly 100gm*30',
  'Dolphin Pudding NDC Original Yogurt 320gm',
  'Jele Jelly Cup Blueberry 125gm*6(12)',
  'Sugar Free Cappuccino Cookies 100gm*24',
  'Mojoie Truffle Foil Round 350gm Assorted',
  'Vfoods Mr Bee Banana 50gm*48',
  'Toy Candy VBC Plush Bear 10gm B*15',
  'Dry Apricots 200gm*35',
  'Cripton Caramel Cream 2kg*8',
  'Ace Eclair Peanut Butter 1kg*10',
  'Ace Eclair Coffee Toffee 1kg*10',
  'Ace Eclair Hazelnut 1kg*10',
  'GD Chocochips 33gm 72pk',
  'Milk Bikis Milk Cream 47gm 72pk',
  'Bar Cake Gobbles Chocolate 100gm 40pk',
  '50-50 200gm 36pk',
  'Milk Bikis 34gm 210pk',
  'Bournville 70% INTENSE 75g',
  'Bournville RC 75g CLASSIC',
  'CB Centrefield Cookie 69g',
  'Cadbury Dairy Milk Big 18g Rs.100',
  'Cadbury Dairy Milk Crispello 28g x 35g Rs.40',
  'Cadbury Silk Bubbly 46g Rs.100',
  'Cadbury Silk Fruit & Nut 51g Rs.100',
  'Cadbury Silk Ganache 54g Rs.100',
  'Cadbury Silk Hazelnut 54g Rs.100',
  'Cadbury Silk Mousse 48.5g Rs.100',
  'Cadbury Silk Oreo 124g Rs.215',
  'Cadbury Silk Oreo 58.5g Rs.100',
  'Cadbury Silk Plain 55g Rs.90',
  'Cadbury Silk Roast Almond 52g Rs.100',
  'Chocobakes Chocolate Chip Cookies',
  'Five Star 20.2g Rs.10',
  'Five Star 9.8g x 54 Flowpack',
  'Oreo Choco 41.75g Rs.10',
  'Oreo Original 41.75g Rs.10',
  'Perk Rs.10 20.6g',
  'Pri Oreo Choco 116.9g Rs.30',
  'Pri Oreo Original 116.9g Rs.30',
  'Rusk Milk 300gm',
  'Marble Cake 140gm'
];

for (const t of targets) {
  const words = t.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(' ').filter(w => w.length > 2);
  const matched = allFolders.filter(f => {
    const fn = f.toLowerCase();
    return words.some(w => fn.includes(w));
  });
  console.log(`Target: "${t}" -> Matches (${matched.length}):`, matched.slice(0, 3));
}

