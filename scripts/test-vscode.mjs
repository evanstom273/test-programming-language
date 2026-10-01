import { runTests } from '@vscode/test-electron';
import { mkdtemp, writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { unzipSync } from 'fflate';
const workspace = await mkdtemp(join(tmpdir(), 'langlab-vscode-'));
try {
  await mkdir(join(workspace, 'lib'));
  await writeFile(
    join(workspace, 'langlab.json'),
    JSON.stringify({
      schemaVersion: 1,
      name: 'Extension test',
      entry: 'main.lang',
    }),
  );
  await writeFile(
    join(workspace, 'main.lang'),
    'import "./lib/maths.lang" as maths.\ninput integer: number = 3.\nbutton "Double", do. print(maths.double(number)). end button.',
  );
  await writeFile(
    join(workspace, 'lib/maths.lang'),
    'public function double(integer: value) returns integer. return value * 2. end function.',
  );
  const packaged = await mkdtemp(join(tmpdir(), 'langlab-vsix-'));
  const files = unzipSync(await readFile(resolve('language-lab.vsix')));
  for (const [name, bytes] of Object.entries(files)) {
    if (!name.startsWith('extension/')) continue;
    if (name.split('/').some((part) => part === '..') || name.includes('\\'))
      throw new Error('Unsafe package path.');
    if (name.endsWith('/')) continue;
    await mkdir(dirname(join(packaged, name)), { recursive: true });
    await writeFile(join(packaged, name), bytes);
  }
  try {
    await runTests({
      version: '1.96.4',
      extensionDevelopmentPath: join(packaged, 'extension'),
      extensionTestsPath: resolve('extensions/vscode/dist/test.cjs'),
      launchArgs: [
        workspace,
        '--disable-workspace-trust',
        '--no-sandbox',
        '--disable-gpu',
      ],
    });
  } finally {
    await rm(packaged, { recursive: true, force: true });
  }
} finally {
  await rm(workspace, { recursive: true, force: true });
}
