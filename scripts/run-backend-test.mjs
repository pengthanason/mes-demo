import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const backendRoot = path.join(repoRoot, 'backend');
const envFilePath = path.join(backendRoot, 'envs', '.env.test');

function parseEnvFile(content) {
  const result = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1);

    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\n/g, '\n');
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

function loadTestEnv() {
  const content = fs.readFileSync(envFilePath, 'utf8');
  const parsed = parseEnvFile(content);

  for (const [key, value] of Object.entries(parsed)) {
    process.env[key] = value;
  }

  process.env.MES_ENV = 'test';
  process.env.MES_RATE_LIMIT_ENABLED = 'false';
  process.env.MES_PROD_DB_HOST = '';
  process.env.MES_PROD_DB_NAME = '';
  process.env.WMS_API_URL = '';
  process.env.MRP_API_URL = '';
  process.env.JIG_API_URL = '';
  process.env.JIG_API_KEY = '';
}

function runNodeTests(testFiles) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--test', ...testFiles],
      {
        cwd: backendRoot,
        env: process.env,
        stdio: 'inherit',
      }
    );

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`backend tests exited with code ${code}`));
    });
  });
}

async function main() {
  loadTestEnv();
  const testFiles = process.argv.slice(2);
  const targets = testFiles.length ? testFiles : ['tests/e2e.dbflow.test.js'];
  await runNodeTests(targets);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
