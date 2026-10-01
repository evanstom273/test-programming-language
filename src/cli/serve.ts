import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import type { ProjectSnapshot } from '../workspace/model';

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};
/** Serve built host assets and exactly one explicitly selected source, on loopback only. */
export async function launchBrowserRunner(
  project: ProjectSnapshot,
  options: { directory?: string; openBrowser?: boolean } = {},
) {
  const directory = options.directory ?? resolve(__dirname, '../../dist');
  let root: string;
  let scope: string;
  try {
    root = await realpath(directory);
    scope = JSON.parse(
      await readFile(resolve(root, 'language-lab.webmanifest'), 'utf8'),
    ).scope;
    if (
      typeof scope !== 'string' ||
      !scope.startsWith('/') ||
      !scope.endsWith('/') ||
      scope.includes('..')
    )
      throw new Error('Invalid scope.');
    await stat(resolve(root, 'index.html'));
  } catch {
    throw new Error(
      'Browser runner build is missing. Run npm run build, then retry lang:open.',
    );
  }
  const token = randomBytes(32).toString('hex');
  const payload = JSON.stringify({
    name: project.project.entry,
    source: project.files[0].content,
  });
  let origin = '';
  const server = createServer((req, res) => {
    void (async () => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'no-store');
      if (
        req.headers.host !== new URL(origin).host ||
        (req.headers.origin && req.headers.origin !== origin)
      ) {
        res.writeHead(403).end();
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405).end();
        return;
      }
      const path = decodeURIComponent(new URL(req.url ?? '/', origin).pathname);
      if (path === scope + '__langlab__/' + token) {
        res.setHeader('Content-Type', 'application/json');
        res.end(req.method === 'HEAD' ? undefined : payload);
        return;
      }
      if (!path.startsWith(scope)) {
        res.writeHead(404).end();
        return;
      }
      const relative = path.slice(scope.length) || 'index.html';
      const file = await realpath(resolve(root, relative));
      if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) {
        res.writeHead(404).end();
        return;
      }
      res.setHeader(
        'Content-Type',
        types[extname(file)] ?? 'application/octet-stream',
      );
      res.end(req.method === 'HEAD' ? undefined : await readFile(file));
    })().catch(() => {
      if (!res.headersSent) res.writeHead(404);
      res.end();
    });
  });
  await new Promise<void>((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => accept());
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Could not start local runner.');
  origin = 'http://127.0.0.1:' + address.port;
  const url = origin + scope + '?runner=1&launch=' + token;
  console.log(
    'Language Lab Runner: ' +
      url +
      '\nOnly the selected source is supplied to the program. Press Ctrl+C to close the server.',
  );
  const close = () => {
    server.closeAllConnections();
    server.close();
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
  server.once('close', () => {
    process.off('SIGINT', close);
    process.off('SIGTERM', close);
  });
  if (options.openBrowser ?? !process.env.LANGLAB_NO_BROWSER) {
    const command =
      process.platform === 'darwin'
        ? 'open'
        : process.platform === 'win32'
          ? 'rundll32'
          : 'xdg-open';
    const args =
      process.platform === 'win32'
        ? ['url.dll,FileProtocolHandler', url]
        : [url];
    const browser = spawn(command, args, { stdio: 'ignore' });
    browser.unref();
    browser.on('error', () =>
      console.error('Open the runner URL above in your browser.'),
    );
  }
  return server;
}
