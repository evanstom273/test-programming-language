import { expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  commandExists,
  npxCommand,
} from '../extensions/vscode/src/nativeProcess';

it('launches npm with node.exe instead of spawning a Windows batch file', async () => {
  const root = 'C:\\Program Files\\Node (LTS) & tools';
  const cli = root + '\\node_modules\\npm\\bin\\npx-cli.js';
  const files = new Set([root + '\\npx.cmd', root + '\\node.exe', cli]);
  expect(
    await npxCommand('win32', { Path: '"' + root + '"' }, async (p) =>
      files.has(p),
    ),
  ).toEqual({ file: root + '\\node.exe', args: [cli] });
});
it('supports npm installed separately from node and respects PATH order', async () => {
  const files = new Set([
    'C:\\npm\\npx.cmd',
    'C:\\npm\\node_modules\\npm\\bin\\npx-cli.js',
    'C:\\node\\node.exe',
  ]);
  expect(
    await npxCommand('win32', { PATH: 'C:\\npm;C:\\node' }, async (p) =>
      files.has(p),
    ),
  ).toEqual({
    file: 'C:\\node\\node.exe',
    args: ['C:\\npm\\node_modules\\npm\\bin\\npx-cli.js'],
  });
});
it('reports missing or incomplete toolchains clearly', async () => {
  await expect(npxCommand('win32', {}, async () => false)).rejects.toThrow(
    /Install Node.js/,
  );
  await expect(
    npxCommand('win32', { Path: 'C:\\npm' }, async (p) =>
      p.endsWith('npx.cmd'),
    ),
  ).rejects.toThrow(/npx-cli.js/);
  await expect(
    npxCommand(
      'win32',
      { Path: 'C:\\npm' },
      async (p) => !p.endsWith('node.exe'),
    ),
  ).rejects.toThrow(/node.exe/);
});
it('keeps Unix executable invocation unchanged', async () => {
  expect(await npxCommand('linux')).toEqual({ file: 'npx', args: [] });
  expect(await npxCommand('darwin')).toEqual({ file: 'npx', args: [] });
});
it('handles missing commands and synchronous spawn errors in prerequisite checks', async () => {
  expect(
    await commandExists({
      file: 'language-lab-missing-command-78463',
      args: [],
    }),
  ).toBe(false);
  expect(await commandExists({ file: 'bad\0command', args: [] })).toBe(false);
});
it('runs installed npm through the selected launcher on this operating system', async () => {
  const command = await npxCommand();
  if (process.platform === 'win32') {
    expect(command.file).toMatch(/node\.exe$/i);
    expect(command.args[0]).toMatch(/npx-cli\.js$/);
  }
  expect(await commandExists(command)).toBe(true);
});
it('preserves spaces and shell metacharacters in paths and arguments', async () => {
  const root = await mkdtemp(join(tmpdir(), 'Language Lab (test) & '));
  try {
    const script = join(root, 'cli.js');
    await writeFile(
      script,
      'console.log(JSON.stringify(process.argv.slice(2)))',
    );
    const args = [
      'icon',
      'a path & b %TEMP% ! value.svg',
      '--output',
      'folder (one)',
    ];
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, [script, ...args], {
        shell: false,
        windowsHide: true,
      });
      let text = '';
      child.stdout.on('data', (b) => (text += String(b)));
      child.on('error', reject);
      child.on('close', (code) =>
        code === 0 ? resolve(text) : reject(new Error('exit ' + code)),
      );
    });
    expect(JSON.parse(output)).toEqual(args);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
