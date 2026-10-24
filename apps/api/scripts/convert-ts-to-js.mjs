import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const includeDirs = ['src', 'scripts', 'tests', 'prisma'];

async function walk(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(full)));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!full.endsWith('.ts')) continue;
    if (full.endsWith('.d.ts')) continue;
    out.push(full);
  }
  return out;
}

function rewriteLocalImportExtensions(jsCode) {
  return jsCode
    .replace(/(from\s+['"])(\.{1,2}\/[^'"]*?)\.ts(['"])/g, '$1$2.js$3')
    .replace(/(import\(\s*['"])(\.{1,2}\/[^'"]*?)\.ts(['"]\s*\))/g, '$1$2.js$3')
    .replace(/(from\s+['"])(\.{1,2}\/[^'".]+)(['"])/g, '$1$2.js$3')
    .replace(/(import\(\s*['"])(\.{1,2}\/[^'".]+)(['"]\s*\))/g, '$1$2.js$3');
}

async function convertOne(tsFile) {
  const tsCode = await fs.readFile(tsFile, 'utf8');
  const transpiled = ts.transpileModule(tsCode, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      esModuleInterop: true,
      removeComments: false,
      sourceMap: false,
    },
    fileName: tsFile,
  });

  const jsFile = tsFile.replace(/\.ts$/, '.js');
  const rewritten = rewriteLocalImportExtensions(transpiled.outputText);
  await fs.writeFile(jsFile, rewritten, 'utf8');
  await fs.unlink(tsFile);
  return { tsFile, jsFile };
}

async function main() {
  const files = [];
  for (const dir of includeDirs) {
    const abs = path.join(root, dir);
    try {
      files.push(...(await walk(abs)));
    } catch {
      // Skip missing directories.
    }
  }

  const converted = [];
  for (const f of files) {
    converted.push(await convertOne(f));
  }

  console.log(`Converted ${converted.length} files from .ts to .js`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
