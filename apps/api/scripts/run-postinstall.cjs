#!/usr/bin/env node
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  try {
    const scriptPath = path.join(__dirname, 'postinstall-prisma.mjs');
    // Import the ESM script using a file:// URL
    await import(pathToFileURL(scriptPath).href);
  } catch (err) {
    console.error('[run-postinstall] Error running postinstall-prisma.mjs:', err && err.stack ? err.stack : err);
    process.exit(1);
  }
})();
