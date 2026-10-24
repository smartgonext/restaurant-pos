const fs = require('fs');
const buffer = fs.readFileSync('Logo.png');
// PNG signature is 8 bytes. IHDR chunk starts at byte 12.
// Width is at 16-19, Height is at 20-23.
const width = buffer.readInt32BE(16);
const height = buffer.readInt32BE(20);
console.log(`Dimensions: ${width}x${height}`);
