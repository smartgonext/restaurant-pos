const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'apps/web/src/pages/waiter/WaiterTerminal.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// Replace toast.info with toast
content = content.replace(/toast\.info\(/g, 'toast(');

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Fixed toast.info() calls');
