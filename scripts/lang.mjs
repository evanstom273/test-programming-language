import { spawnSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const build = spawnSync(
  process.execPath,
  [
    resolve(root, 'node_modules/typescript/bin/tsc'),
    '-p',
    resolve(root, 'tsconfig.cli.json'),
  ],
  { cwd: root, stdio: 'inherit' },
);
if (build.status !== 0) process.exit(build.status ?? 1);
mkdirSync(resolve(root, '.langlab-cli'), { recursive: true });
writeFileSync(
  resolve(root, '.langlab-cli/package.json'),
  '{"type":"commonjs"}\n',
);
if (process.argv[2] !== '--build') {
  const child = spawn(
    process.execPath,
    [resolve(root, '.langlab-cli/cli/main.js'), ...process.argv.slice(2)],
    { cwd: process.cwd(), stdio: 'inherit' },
  );
  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));
  child.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1);
  });
}
