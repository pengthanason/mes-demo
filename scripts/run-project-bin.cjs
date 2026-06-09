const path = require('node:path');
const { spawnSync } = require('node:child_process');

module.exports = function runProjectBin(relativeScriptPath, args = [], envOverrides = {}) {
  const cwd = process.env.INIT_CWD || process.cwd();
  const scriptPath = path.resolve(cwd, relativeScriptPath);
  const result = spawnSync(
    process.execPath,
    [scriptPath, ...args],
    {
      cwd,
      env: { ...process.env, ...envOverrides },
      stdio: 'inherit',
    }
  );

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === 'number') {
    process.exit(result.status);
  }

  process.exit(1);
};
