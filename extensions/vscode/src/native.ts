import { spawn } from 'node:child_process';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { OutputChannel } from 'vscode';
import type { ProjectSnapshot } from '../../../src/workspace/model';
import {
  cargoToml,
  defaultIconSvg,
  nativeBuildDefinition,
  tauriBuildRs,
  tauriCapability,
  tauriLibRs,
  tauriMainRs,
  type NativeTarget,
} from '../../../src/build/native/config';
import { standaloneDocument } from '../../../src/build/standalone/document';

const TAURI_CLI = '@tauri-apps/cli@2.12.0';

export function nativeFilename(project: ProjectSnapshot, target: NativeTarget) {
  const definition = nativeBuildDefinition(project, target);
  const safe = definition.application.name
    .replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '-')
    .replace(/[. ]+$/g, '')
    .slice(0, 100) || 'Application';
  return safe + (target === 'windows' ? '.exe' : '.apk');
}

async function commandExists(command: string) {
  return new Promise<boolean>((resolvePromise) => {
    const child = spawn(command, ['--version'], {
      shell: false,
      windowsHide: true,
      stdio: 'ignore',
    });
    child.once('error', () => resolvePromise(false));
    child.once('exit', (code) => resolvePromise(code === 0));
  });
}

function run(
  command: string,
  args: string[],
  cwd: string,
  output: OutputChannel,
) {
  output.appendLine('');
  output.appendLine('> ' + command + ' ' + args.join(' '));
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        NO_UPDATE_NOTIFIER: '1',
        CI: 'true',
      },
      shell: false,
      windowsHide: true,
    });
    child.stdout.on('data', (data) => output.append(String(data)));
    child.stderr.on('data', (data) => output.append(String(data)));
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error('Build command failed with exit code ' + code + '.'));
    });
  });
}

async function writeSource(path: string, content: string | Uint8Array) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

async function findApks(root: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.apk'))
        found.push(path);
    }
  }
  await walk(root);
  return found;
}

async function newest(paths: string[]) {
  const values = await Promise.all(
    paths.map(async (path) => ({ path, time: (await stat(path)).mtimeMs })),
  );
  return values.sort((a, b) => b.time - a.time)[0]?.path;
}

async function prepare(
  project: ProjectSnapshot,
  host: { script: string; style: string },
  target: NativeTarget,
  output: OutputChannel,
) {
  const definition = nativeBuildDefinition(project, target);
  const root = await mkdtemp(join(tmpdir(), 'language-lab-native-'));
  const tauri = join(root, 'src-tauri');

  await mkdir(join(root, 'dist'), { recursive: true });
  await mkdir(join(tauri, 'src'), { recursive: true });
  await mkdir(join(tauri, 'capabilities'), { recursive: true });

  await writeFile(
    join(root, 'dist', 'index.html'),
    standaloneDocument(project, host),
    'utf8',
  );
  await writeFile(join(tauri, 'Cargo.toml'), cargoToml(definition), 'utf8');
  await writeFile(join(tauri, 'build.rs'), tauriBuildRs, 'utf8');
  await writeFile(join(tauri, 'src', 'lib.rs'), tauriLibRs, 'utf8');
  await writeFile(join(tauri, 'src', 'main.rs'), tauriMainRs, 'utf8');
  await writeFile(
    join(tauri, 'capabilities', 'default.json'),
    tauriCapability,
    'utf8',
  );
  await writeFile(
    join(tauri, 'tauri.conf.json'),
    JSON.stringify(definition.tauri, null, 2) + '\n',
    'utf8',
  );

  const iconPath = definition.iconFile
    ? join(root, definition.iconFile.path)
    : join(root, 'app-icon.svg');
  if (definition.iconFile)
    await writeSource(iconPath, definition.iconFile.content);
  else await writeFile(iconPath, defaultIconSvg, 'utf8');

  output.appendLine('Native build workspace: ' + root);
  return { root, tauri, definition, iconPath };
}

export async function buildNativeApplication(
  project: ProjectSnapshot,
  host: { script: string; style: string },
  target: NativeTarget,
  destination: string,
  output: OutputChannel,
) {
  if (target === 'windows' && process.platform !== 'win32')
    throw new Error(
      'Windows .exe builds currently run on Windows. Open the project in desktop VS Code on Windows and run the command again.',
    );
  if (!(await commandExists('cargo')))
    throw new Error(
      'Rust/Cargo is required to build native applications. Install the Rust toolchain, then restart VS Code.',
    );

  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  if (!(await commandExists(npx)))
    throw new Error(
      'Node.js/npm is required to launch the Tauri builder. Install Node.js, then restart VS Code.',
    );

  const workspace = await prepare(project, host, target, output);
  let success = false;
  try {
    await run(
      npx,
      ['--yes', TAURI_CLI, 'icon', workspace.iconPath, '--output', 'src-tauri/icons'],
      workspace.root,
      output,
    );

    if (target === 'windows') {
      await run(
        npx,
        ['--yes', TAURI_CLI, 'build', '--no-bundle', '--ci', '--no-sign'],
        workspace.root,
        output,
      );
      const executable = join(
        workspace.tauri,
        'target',
        'release',
        workspace.definition.crateName + '.exe',
      );
      await copyFile(executable, destination);
    } else {
      await run(
        npx,
        ['--yes', TAURI_CLI, 'android', 'init', '--ci'],
        workspace.root,
        output,
      );
      await run(
        npx,
        ['--yes', TAURI_CLI, 'android', 'build', '--apk', '--debug', '--ci'],
        workspace.root,
        output,
      );
      const apkRoot = join(
        workspace.tauri,
        'gen',
        'android',
        'app',
        'build',
        'outputs',
        'apk',
      );
      const apk = await newest(await findApks(apkRoot));
      if (!apk)
        throw new Error('Android build completed but no APK was found.');
      await copyFile(apk, destination);
    }

    success = true;
    output.appendLine('');
    output.appendLine('Built: ' + destination);
  } finally {
    if (success) await rm(workspace.root, { recursive: true, force: true });
    else
      output.appendLine(
        'Build workspace kept for troubleshooting: ' + workspace.root,
      );
  }
}
