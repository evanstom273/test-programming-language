import { expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchBrowserRunner } from '../src/cli/serve';
import { temporarySourceProject } from '../src/runner/sourceFile';

it('serves the browser host and selected file only, enforcing loopback origins and path confinement', async () => {
  const root = await mkdtemp(join(tmpdir(), 'langlab-server-'));
  const directory = join(root, 'host');
  await mkdir(directory);
  await writeFile(
    join(directory, 'language-lab.webmanifest'),
    JSON.stringify({ scope: '/lab/' }),
  );
  await writeFile(join(directory, 'index.html'), '<h1>Runner host</h1>');
  await writeFile(join(root, 'private.txt'), 'private');
  await symlink(join(root, 'private.txt'), join(directory, 'leak.txt'));
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const server = await launchBrowserRunner(
    temporarySourceProject('My game.lang', 'print("selected").'),
    { directory, openBrowser: false },
  );
  try {
    const url = new URL(
      String(log.mock.calls[0][0])
        .split('\n')[0]
        .replace('Language Lab Runner: ', ''),
    );
    expect(url.hostname).toBe('127.0.0.1');
    expect(url.pathname).toBe('/lab/');
    const response = await fetch(
      url.origin + '/lab/__langlab__/' + url.searchParams.get('launch'),
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      name: 'My game.lang',
      source: 'print("selected").',
    });
    expect(await (await fetch(url)).text()).toContain('Runner host');
    expect((await fetch(url.origin + '/lab/leak.txt')).status).toBe(404);
    expect((await fetch(url.origin + '/lab/%2e%2e/private.txt')).status).toBe(
      404,
    );
    expect((await fetch(url.origin + '/lab/__langlab__/wrong')).status).toBe(
      404,
    );
    expect(
      (await fetch(url, { headers: { Origin: 'https://unrelated.example' } }))
        .status,
    ).toBe(403);
    expect(
      (await fetch(url, { method: 'POST', body: 'no uploads' })).status,
    ).toBe(405);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((accept) => server.close(() => accept()));
    log.mockRestore();
    await rm(root, { recursive: true, force: true });
  }
});
it('explains the build prerequisite for browser launch', async () => {
  await expect(
    launchBrowserRunner(temporarySourceProject('game.lang', 'print(1).'), {
      directory: '/missing-langlab-build',
    }),
  ).rejects.toThrow(/npm run build/);
});
