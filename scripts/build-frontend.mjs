import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

function runProcess(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`command failed with exit code ${code ?? 'unknown'}`));
    });
  });
}

function isWindowsUncPath(targetPath) {
  return process.platform === 'win32' && /^[\\/]{2}/.test(targetPath);
}

function normalizeWindowsPath(targetPath) {
  return String(targetPath || '').replace(/\//g, '\\').replace(/\\+$/g, '').toLowerCase();
}

function resolveMappedDrivePath(targetPath) {
  if (!isWindowsUncPath(targetPath)) return '';

  const probe = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Get-PSDrive -PSProvider FileSystem | Where-Object { $_.DisplayRoot } | ForEach-Object { '{0}|{1}' -f $_.Name, $_.DisplayRoot }",
    ],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }
  );

  if (probe.status !== 0 || !probe.stdout) return '';

  const normalizedTarget = normalizeWindowsPath(targetPath);
  const candidates = probe.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    const [driveName, displayRootRaw] = candidate.split('|');
    if (!driveName || !displayRootRaw) continue;

    const normalizedDisplayRoot = normalizeWindowsPath(displayRootRaw);
    if (!normalizedTarget.startsWith(normalizedDisplayRoot)) continue;

    const suffix = targetPath.slice(displayRootRaw.length).replace(/^[\\/]+/, '');
    return path.win32.join(`${driveName}:\\`, suffix);
  }

  return '';
}

function buildCmdPushdScript(frontendDir) {
  const escapedDir = frontendDir.replace(/"/g, '""');
  const escapedNode = process.execPath.replace(/"/g, '""');
  return `pushd "${escapedDir}" && "${escapedNode}" ".\\node_modules\\vite\\bin\\vite.js" build && popd`;
}

async function runViteBuild(frontendDir) {
  if (isWindowsUncPath(frontendDir)) {
    await runProcess('cmd.exe', ['/d', '/s', '/c', buildCmdPushdScript(frontendDir)], frontendDir);
    return;
  }

  const viteBin = path.resolve(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js');
  await runProcess(process.execPath, [viteBin, 'build'], frontendDir);
}

async function syncFrontendDist(frontendDir, repoRoot) {
  const distDir = path.resolve(frontendDir, 'dist');
  const targetDir = path.resolve(repoRoot, 'backend', 'public', 'ui');

  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(path.dirname(targetDir), { recursive: true });
  await fs.cp(distDir, targetDir, { recursive: true });

  console.log(`Synced frontend dist to ${targetDir}`);
}

async function main() {
  const frontendDir = process.cwd();
  const buildFrontendDir = resolveMappedDrivePath(frontendDir) || frontendDir;
  const repoRoot = path.resolve(buildFrontendDir, '..');

  await runViteBuild(buildFrontendDir);
  await syncFrontendDist(buildFrontendDir, repoRoot);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
