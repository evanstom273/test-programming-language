// Uses the existing standalone host; run npm run vscode:build first.
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const compiled = await build({
  stdin: {
    contents: `export { compileProject } from './src/language/analysis';
export { singleFileSnapshot } from './src/workspace/model';
export { standaloneDocument } from './src/build/standalone/document';
export { exportProject } from './src/workspace/archive';`,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const {
  compileProject,
  singleFileSnapshot,
  standaloneDocument,
  exportProject,
} = await import(
  'data:text/javascript;base64,' +
    Buffer.from(compiled.outputFiles[0].contents).toString('base64')
);
const sourceRoot = resolve(root, 'examples/emberfall');
const manifest = JSON.parse(
  await readFile(resolve(sourceRoot, 'langlab.json'), 'utf8'),
);
const project = singleFileSnapshot('');
project.project = {
  ...project.project,
  id: 'emberfall',
  name: manifest.name,
  entry: manifest.entry,
};
project.files = await Promise.all(
  ['main.lang', 'lib/rules.lang', 'README.md'].map(async (path) => ({
    ...project.files[0],
    id: 'emberfall:' + path,
    projectId: 'emberfall',
    path,
    name: path.split('/').at(-1),
    content: await readFile(resolve(sourceRoot, path), 'utf8'),
  })),
);
compileProject(project);
const host = JSON.parse(
  await readFile(
    resolve(root, 'extensions/vscode/dist/standalone-host.json'),
    'utf8',
  ),
);
const out = resolve(root, 'dist/emberfall');
await mkdir(out, { recursive: true });
await writeFile(
  resolve(out, 'Emberfall.html'),
  standaloneDocument(project, host),
);
await writeFile(resolve(out, 'Emberfall-project.zip'), exportProject(project));
console.log('Built dist/emberfall/Emberfall.html and Emberfall-project.zip');
