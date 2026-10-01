import { expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  commandExists,
  npxCommand,
  nativeEnvironment,
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

it('finds a normal Rust installation when VS Code inherited a stale PATH', async () => {
  const env = {
    Path: 'C:\\Windows\\System32',
    USERPROFILE: 'C:\\Users\\evans',
  };
  const cargo = 'C:\\Users\\evans\\.cargo\\bin\\cargo.exe';
  const result = await nativeEnvironment(
    'win32',
    env,
    async (p) => p === cargo,
    'C:\\Unused',
  );
  expect(result.cargo.file).toBe(cargo);
  expect(result.env.PATH).toBe(
    'C:\\Users\\evans\\.cargo\\bin;C:\\Windows\\System32',
  );
  expect(result.env.Path).toBeUndefined();
  expect(env.Path).toBe('C:\\Windows\\System32');
});
it('merges PATH casing and unquotes/expands Windows entries', async () => {
  const env = {
    PATH: 'C:\\node',
    Path: '"%USERPROFILE%\\.cargo\\bin";C:\\other',
    USERPROFILE: 'C:\\Users\\Test User',
  };
  const result = await nativeEnvironment(
    'win32',
    env,
    async (p) => p === 'C:\\Users\\Test User\\.cargo\\bin\\cargo.exe',
  );
  expect(
    Object.keys(result.env).filter((k) => k.toLowerCase() === 'path'),
  ).toEqual(['PATH']);
  expect(result.env.PATH).toBe(
    'C:\\Users\\Test User\\.cargo\\bin;C:\\node;C:\\other',
  );
});
it('honors custom CARGO_HOME and leaves non-PATH configuration intact', async () => {
  const env = {
    PATH: '/usr/bin',
    CARGO_HOME: '/opt/rust cargo',
    RUSTUP_HOME: '/opt/rustup',
  };
  const result = await nativeEnvironment(
    'linux',
    env,
    async (p) => p === '/opt/rust cargo/bin/cargo',
    '/home/test',
  );
  expect(result.env).toEqual({ ...env, PATH: '/opt/rust cargo/bin:/usr/bin' });
  await expect(
    nativeEnvironment('win32', {}, async () => false, 'C:\\Missing'),
  ).rejects.toThrow(/Cargo was not found/);
});
it.runIf(process.platform === 'win32')(
  'passes discovered Cargo to a child process running metadata from a temporary build directory',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'Language Lab cargo '));
    try {
      const inherited = { ...process.env };
      for (const key of Object.keys(inherited))
        if (key.toLowerCase() === 'path') delete inherited[key];
      inherited.PATH = join(
        process.env.SystemRoot ?? 'C:\\Windows',
        'System32',
      );
      const { env, cargo } = await nativeEnvironment('win32', inherited);
      expect(await commandExists(cargo, env, root)).toBe(true);
      await writeFile(
        join(root, 'Cargo.toml'),
        '[package]\nname="metadata-probe"\nversion="0.1.0"\nedition="2021"\n[lib]\npath="lib.rs"\n',
      );
      await writeFile(join(root, 'lib.rs'), '');
      const stdout = await new Promise<string>((resolve, reject) => {
        const code =
          "const r=require('node:child_process').spawnSync('cargo',['metadata','--no-deps','--format-version','1'],{encoding:'utf8'});if(r.error)throw r.error;process.stdout.write(r.stdout);process.stderr.write(r.stderr);process.exit(r.status??1)";
        const child = spawn(process.execPath, ['-e', code], {
          cwd: root,
          env,
          shell: false,
        });
        let out = '',
          err = '';
        child.stdout.on('data', (b) => (out += String(b)));
        child.stderr.on('data', (b) => (err += String(b)));
        child.on('error', reject);
        child.on('close', (code) =>
          code === 0 ? resolve(out) : reject(new Error(err)),
        );
      });
      expect(JSON.parse(stdout).packages[0].name).toBe('metadata-probe');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
