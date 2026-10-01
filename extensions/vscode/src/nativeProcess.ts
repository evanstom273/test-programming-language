import { stat } from 'node:fs/promises';
import { win32, posix } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';

export interface NativeCommand {
  file: string;
  args: string[];
}
const isFile = async (path: string) => {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
};

/** Windows environment keys are case insensitive; Node forwards only one of
 * PATH/Path when both exist. Keep all inherited entries under one key. */
export async function nativeEnvironment(
  platform: NodeJS.Platform = process.platform,
  inherited: NodeJS.ProcessEnv = process.env,
  exists: (path: string) => Promise<boolean> = isFile,
  home = homedir(),
): Promise<{ env: NodeJS.ProcessEnv; cargo: NativeCommand }> {
  const windows = platform === 'win32';
  const paths = windows ? win32 : posix;
  const separator = windows ? ';' : ':';
  const env = { ...inherited };
  const lookup = (name: string) =>
    Object.entries(inherited).find(([key]) =>
      windows ? key.toLowerCase() === name.toLowerCase() : key === name,
    )?.[1];
  const directories: string[] = [];
  for (const [key, value] of Object.entries(inherited)) {
    if (windows ? key.toLowerCase() === 'path' : key === 'PATH') {
      delete env[key];
      for (let directory of (value ?? '').split(separator)) {
        directory = directory.replace(/^"|"$/g, '');
        if (windows)
          directory = directory.replace(
            /%([^%]+)%/g,
            (match, name) => lookup(name) ?? match,
          );
        if (directory) directories.push(paths.resolve(directory));
      }
    }
  }
  const cargoHome = lookup('CARGO_HOME');
  const profile = windows ? (lookup('USERPROFILE') ?? home) : home;
  const candidates = [
    ...directories,
    ...(cargoHome ? [paths.resolve(cargoHome, 'bin')] : []),
    paths.resolve(profile, '.cargo', 'bin'),
  ];
  const executable = windows ? 'cargo.exe' : 'cargo';
  let cargo: string | undefined;
  for (const directory of candidates) {
    const candidate = paths.join(directory, executable);
    if (await exists(candidate)) {
      cargo = candidate;
      break;
    }
  }
  if (!cargo)
    throw new Error(
      'Cargo was not found on PATH, in CARGO_HOME/bin or in your .cargo/bin folder. Install Rust with rustup before building native applications.',
    );
  // Tauri resolves cargo/rustc by name, so its subprocesses must inherit this.
  env.PATH = [paths.dirname(cargo), ...directories]
    .filter(
      (p, i, all) =>
        all.findIndex((other) =>
          windows ? other.toLowerCase() === p.toLowerCase() : other === p,
        ) === i,
    )
    .join(separator);
  return { env, cargo: { file: cargo, args: [] } };
}

/** .cmd files cannot be spawned directly on Windows. Invoke npm's real JS
 * entry point with node.exe, retaining argv boundaries and shell:false. */
export async function npxCommand(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  exists: (path: string) => Promise<boolean> = isFile,
): Promise<NativeCommand> {
  if (platform !== 'win32') return { file: 'npx', args: [] };
  const path =
    Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] ??
    '';
  const directories = path
    .split(';')
    .filter(Boolean)
    .map((p) => win32.resolve(p.replace(/^"|"$/g, '')));
  let shim: string | undefined;
  for (const directory of directories) {
    if (await exists(win32.join(directory, 'npx.cmd'))) {
      shim = directory;
      break;
    }
  }
  if (!shim)
    throw new Error(
      'Node.js/npm was not found on PATH. Install Node.js with npm, then restart VS Code.',
    );
  const cli = win32.join(shim, 'node_modules', 'npm', 'bin', 'npx-cli.js');
  if (!(await exists(cli)))
    throw new Error(
      "Cannot locate npm's npx-cli.js beside " +
        win32.join(shim, 'npx.cmd') +
        '. Repair your Node.js/npm installation, then restart VS Code.',
    );
  for (const directory of [shim, ...directories]) {
    const node = win32.join(directory, 'node.exe');
    if (await exists(node)) return { file: node, args: [cli] };
  }
  throw new Error(
    'node.exe was not found on PATH. Install Node.js, then restart VS Code.',
  );
}

export async function commandExists(
  command: NativeCommand,
  env: NodeJS.ProcessEnv = process.env,
  cwd?: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const child = spawn(command.file, [...command.args, '--version'], {
        env,
        cwd,
        shell: false,
        windowsHide: true,
        stdio: 'ignore',
        timeout: 10000,
      });
      child.once('error', () => resolve(false));
      child.once('close', (code) => resolve(code === 0));
    } catch {
      resolve(false);
    }
  });
}
