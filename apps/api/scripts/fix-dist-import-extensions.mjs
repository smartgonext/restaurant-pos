import fs from 'fs/promises';
import path from 'path';

const root = path.join(process.cwd(), 'apps', 'api', 'dist');

function isRelative(p) {
  return p.startsWith('./') || p.startsWith('../');
}

function hasExtension(p) {
  return /\.(mjs|cjs|js|json)$/i.test(p);
}

async function fixFile(filePath) {
  let content = await fs.readFile(filePath, 'utf8');
  // Replace import ... from '...'
  content = content.replace(/(from\s+|import\()(['"])(\.\.?(?:[^'"\\)]*?))\2/g, (m, prefix, quote, rel) => {
    if (isRelative(rel) && !hasExtension(rel)) {
      return `${prefix}${quote}${rel}.js${quote}`;
    }
    return m;
  });
  // Also handle dynamic import(...) with template literals or single/double quotes
  content = content.replace(/import\((['"])(\.\.?(?:[^'"\\)]*?))\1\)/g, (m, quote, rel) => {
    if (isRelative(rel) && !hasExtension(rel)) {
      return `import(${quote}${rel}.js${quote})`;
    }
    return m;
  });
  await fs.writeFile(filePath, content, 'utf8');
}

async function walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full);
    } else if (entry.isFile() && full.endsWith('.js')) {
      await fixFile(full);
    }
  }
}

walk(root).catch(err => {
  console.error('Failed to fix import extensions:', err);
  process.exit(1);
});
