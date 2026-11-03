const fs = require('fs');
const path = require('path');
const builtins = new Set(['fs', 'path', 'os', 'child_process', 'crypto', 'http', 'https', 'stream', 'events', 'util', 'url', 'buffer', 'net', 'dgram', 'zlib', 'dns', 'readline', 'tls', 'fs/promises']);

function scan(dir) {
  for (const f of fs.readdirSync(dir)) {
    const fp = path.join(dir, f);
    if (fs.statSync(fp).isDirectory()) scan(fp);
    else if (f.endsWith('.js') || f.endsWith('.ts')) {
      const content = fs.readFileSync(fp, 'utf8');
      const matches = [
        ...content.matchAll(/from\s+['"]([^'".\/][^'"]*)['"]/g),
        ...content.matchAll(/import\s*\(\s*['"]([^'".\/][^'"]*)['"]/g),
        ...content.matchAll(/require\s*\(\s*['"]([^'".\/][^'"]*)['"]/g)
      ];
      for (const m of matches) {
        let pkg = m[1];
        if (pkg.startsWith('@')) {
          pkg = pkg.split('/').slice(0, 2).join('/');
        } else {
          pkg = pkg.split('/')[0];
        }
        if (!builtins.has(pkg) && !fs.existsSync('api/node_modules/' + pkg)) {
          console.log('MISSING in api/node_modules:', pkg, 'used in', fp);
        }
      }
    }
  }
}
scan('api/src');

