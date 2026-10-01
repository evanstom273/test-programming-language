import { build, type Plugin } from 'vite';
import { resolve } from 'node:path';

/** Build the app host once, separately from the IDE, then embed it in the exporter.
 * Vite's inline-worker transform keeps the worker inside the single script too.
 */
export function standalonePlugin(): Plugin {
  const id = 'virtual:standalone-host';
  let root = '';
  let compiled: Promise<{ script: string; style: string }> | undefined;
  return {
    name: 'language-lab-standalone',
    configResolved(config) {
      root = config.root;
    },
    resolveId(source) {
      if (source === id) return '\0' + id;
    },
    async load(source) {
      if (source !== '\0' + id) return;
      compiled ??= (async () => {
        const result = await build({
          configFile: false,
          root,
          publicDir: false,
          // A dev server may have set NODE_ENV=development; the embedded host
          // still uses React's production JSX/runtime consistently.
          esbuild: { jsxDev: false },
          logLevel: 'warn',
          define: { 'process.env.NODE_ENV': JSON.stringify('production') },
          build: {
            write: false,
            target: 'es2022',
            minify: 'esbuild',
            cssCodeSplit: false,
            lib: {
              entry: resolve(root, 'src/build/standalone/main.tsx'),
              formats: ['iife'],
              name: 'StandaloneApp',
            },
          },
        });
        if ('close' in result)
          throw new Error('Unexpected watched standalone build.');
        const output = (Array.isArray(result) ? result : [result]).flatMap(
          (r) => r.output,
        );
        const scripts = output.filter((item) => item.type === 'chunk');
        const styles = output
          .filter((item) => item.type === 'asset')
          .filter((item) => item.fileName.endsWith('.css'));
        if (
          scripts.length !== 1 ||
          output.length !== scripts.length + styles.length ||
          scripts[0].imports.length ||
          scripts[0].dynamicImports.length
        )
          throw new Error(
            'Standalone host must contain one script, inline workers and CSS only.',
          );
        for (const module of Object.keys(scripts[0].modules)) {
          if (!module.startsWith('\0')) this.addWatchFile(module.split('?')[0]);
          if (
            /[/\\](?:codemirror|dexie)[/\\]|[/\\]src[/\\](?:App|Shell)\.tsx/.test(
              module,
            )
          )
            throw new Error(
              'Standalone host must not include the IDE or workspace database.',
            );
        }
        return {
          script: scripts[0].code,
          style: styles.map((s) => String(s.source)).join('\n'),
        };
      })();
      return 'export default ' + JSON.stringify(await compiled);
    },
    handleHotUpdate({ server }) {
      compiled = undefined;
      const module = server.moduleGraph.getModuleById('\0' + id);
      if (module) server.moduleGraph.invalidateModule(module);
    },
    watchChange() {
      compiled = undefined;
    },
  };
}
