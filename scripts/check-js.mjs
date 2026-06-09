import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const SKIP_DIRS = new Set(['.git', 'dist', 'coverage', 'node_modules']);
const VALID_EXTENSIONS = new Set(['.js', '.cjs', '.mjs']);

async function collectJavaScriptFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        files.push(...await collectJavaScriptFiles(path.join(dirPath, entry.name)));
      }
      continue;
    }

    if (VALID_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(path.join(dirPath, entry.name));
    }
  }

  return files;
}

function runNodeCheck(filePath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--check', filePath], {
      cwd: process.cwd(),
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`node --check failed for ${filePath}`));
    });
  });
}

async function main() {
  const targetPath = path.resolve(process.cwd(), process.argv[2] || '.');
  const files = await collectJavaScriptFiles(targetPath);
  files.sort();

  for (const filePath of files) {
    await runNodeCheck(filePath);
  }

  console.log(`Checked ${files.length} JavaScript files in ${targetPath}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
