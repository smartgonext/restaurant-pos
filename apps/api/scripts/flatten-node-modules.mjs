import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..', 'node_modules');

function copyDirectory(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isSymbolicLink()) {
      const target = fs.readlinkSync(srcPath);
      const resolved = path.resolve(path.dirname(srcPath), target);
      copyDirectory(resolved, destPath);
    } else if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function flattenDirectory(dir) {
  for (const name of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, name);
    const stat = fs.lstatSync(fullPath);
    if (stat.isSymbolicLink()) {
      const target = fs.readlinkSync(fullPath);
      const resolved = path.resolve(path.dirname(fullPath), target);
      const tempPath = `${fullPath}.copytmp`;
      copyDirectory(resolved, tempPath);
      fs.rmSync(fullPath, { recursive: true, force: true });
      fs.renameSync(tempPath, fullPath);
      flattenDirectory(fullPath);
    } else if (stat.isDirectory()) {
      flattenDirectory(fullPath);
    }
  }
}

if (!fs.existsSync(root)) {
  console.log('No node_modules directory found at', root);
  process.exit(0);
}
try {
  flattenDirectory(root);
  console.log('Flattened symlinked directories under', root);
} catch (error) {
  console.error('Failed to flatten node_modules:', error);
  process.exit(1);
}
