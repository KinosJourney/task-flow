import { spawn } from 'node:child_process';

/**
 * VSCode / Cursor 的集成终端会带上 ELECTRON_RUN_AS_NODE=1，Electron 会因此
 * 以纯 Node 启动，require('electron') 拿不到 app，表现为 "Cannot read
 * properties of undefined"。所有会拉起 Electron 的脚本都经由本包装器。
 */
const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('用法: node scripts/run-electron.mjs <command> [args...]');
  process.exit(2);
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(command, args, {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
