const path = require('path');
const { spawn } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const pm2Home = path.join(projectRoot, '.pm2');

// Enforce project-local PM2_HOME to prevent EPERM on Windows user home directory
process.env.PM2_HOME = pm2Home;
process.env.PM2_PIDUSAGE_DISABLE = 'true';

const pm2Bin = path.join(projectRoot, 'node_modules', 'pm2', 'bin', 'pm2');
const args = process.argv.slice(2);

const child = spawn(process.execPath, [pm2Bin, ...args], {
  cwd: projectRoot,
  env: process.env,
  stdio: 'inherit',
  windowsHide: false
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
