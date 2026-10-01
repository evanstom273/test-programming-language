import { build as bundle } from 'esbuild';
import { build } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'extensions/vscode/dist');
await mkdir(out, { recursive: true });
const grammarBuild = await bundle({
  entryPoints: [resolve(root, 'extensions/vscode/src/grammar.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const grammar = (
  await import(
    'data:text/javascript;base64,' +
      Buffer.from(grammarBuild.outputFiles[0].contents).toString('base64')
  )
).default;
await writeFile(
  resolve(root, 'extensions/vscode/syntaxes/langlab.tmLanguage.json'),
  JSON.stringify(grammar, null, 2) + '\n',
);
for (const entry of ['extension', 'server', 'analysis-worker'])
  await bundle({
    entryPoints: [resolve(root, 'extensions/vscode/src/' + entry + '.ts')],
    outfile: resolve(out, entry + '.cjs'),
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    external: ['vscode'],
    sourcemap: false,
  });
for (const [name, entry] of [
  ['standalone', 'src/build/standalone/main.tsx'],
  ['preview', 'extensions/vscode/src/preview.tsx'],
]) {
  const result = await build({
    configFile: false,
    root,
    publicDir: false,
    logLevel: 'warn',
    esbuild: { jsxDev: false },
    define: { 'process.env.NODE_ENV': '"production"' },
    build: {
      write: false,
      target: 'es2022',
      minify: 'esbuild',
      cssCodeSplit: false,
      lib: { entry: resolve(root, entry), formats: ['iife'], name: 'AppHost' },
    },
  });
  const output = (Array.isArray(result) ? result : [result]).flatMap(
    (r) => r.output,
  );
  const scripts = output.filter((r) => r.type === 'chunk');
  const css = output.filter(
    (r) => r.type === 'asset' && r.fileName.endsWith('.css'),
  );
  if (
    scripts.length !== 1 ||
    output.length !== scripts.length + css.length ||
    scripts[0].imports.length ||
    scripts[0].dynamicImports.length
  )
    throw new Error('Host must be self contained.');
  await writeFile(
    resolve(out, name + '-host.json'),
    JSON.stringify({
      script: scripts[0].code,
      style: css.map((r) => String(r.source)).join('\n'),
    }),
  );
}
await bundle({
  entryPoints: [resolve(root, 'extensions/vscode/test/suite.ts')],
  outfile: resolve(out, 'test.cjs'),
  platform: 'node',
  format: 'cjs',
  bundle: true,
  external: ['vscode'],
});
