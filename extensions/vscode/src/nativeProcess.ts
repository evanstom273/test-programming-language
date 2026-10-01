import { stat } from 'node:fs/promises';
import { win32 } from 'node:path';
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

export async function commandExists(command: NativeCommand): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const child = spawn(command.file, [...command.args, '--version'], {
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
