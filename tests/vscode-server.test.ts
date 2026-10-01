import { it, expect } from 'vitest';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

it('real LSP transport serves unsaved project diagnostics, completions, hover and definitions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'langlab-lsp-'));
  let child: ReturnType<typeof spawn> | undefined;
  try {
    for (const entry of ['server', 'analysis-worker'])
      await build({
        entryPoints: [resolve('extensions/vscode/src/' + entry + '.ts')],
        outfile: join(root, entry + '.cjs'),
        platform: 'node',
        bundle: true,
        format: 'cjs',
      });
    await writeFile(
      join(root, 'langlab.json'),
      JSON.stringify({ schemaVersion: 1, name: 'Test', entry: 'main.lang' }),
    );
    await writeFile(
      join(root, 'main.lang'),
      'integer: value = 1. print(value).',
    );
    // Keep bundled tools outside the project loader's bounded source folder.
    const uri = pathToFileURL(join(root, 'main.lang')).href;
    child = spawn(process.execPath, [join(root, 'server.cjs'), '--stdio'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let buffer = Buffer.alloc(0),
      serial = 0;
    const responses = new Map<number, (value: any) => void>();
    const diagnostics: any[] = [];
    child.stdout!.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (true) {
        const end = buffer.indexOf('\r\n\r\n');
        if (end < 0) return;
        const length = Number(
          buffer
            .subarray(0, end)
            .toString()
            .match(/Content-Length: (\d+)/i)?.[1],
        );
        if (buffer.length < end + 4 + length) return;
        const message = JSON.parse(
          buffer.subarray(end + 4, end + 4 + length).toString(),
        );
        buffer = buffer.subarray(end + 4 + length);
        if (message.id !== undefined) {
          responses.get(message.id)?.(message);
          responses.delete(message.id);
        }
        if (message.method === 'textDocument/publishDiagnostics')
          diagnostics.push(message.params);
      }
    });
    function send(message: unknown) {
      const text = JSON.stringify(message);
      child!.stdin!.write(
        'Content-Length: ' + Buffer.byteLength(text) + '\r\n\r\n' + text,
      );
    }
    async function request(method: string, params: unknown): Promise<any> {
      const id = ++serial;
      return new Promise((accept, reject) => {
        const timer = setTimeout(
          () => reject(new Error('LSP timed out: ' + method)),
          10000,
        );
        responses.set(id, (r) => {
          clearTimeout(timer);
          if (r.error) reject(new Error(JSON.stringify(r.error)));
          else accept(r.result);
        });
        send({ jsonrpc: '2.0', id, method, params });
      });
    }
    await request('initialize', {
      processId: process.pid,
      capabilities: {},
      rootUri: null,
    });
    send({ jsonrpc: '2.0', method: 'initialized', params: {} });
    send({
      jsonrpc: '2.0',
      method: 'textDocument/didOpen',
      params: {
        textDocument: {
          uri,
          languageId: 'langlab',
          version: 1,
          text: 'integer: amount = 2. print(amount).',
        },
      },
    });
    const result = await request('textDocument/definition', {
      textDocument: { uri },
      position: { line: 0, character: 27 },
    });
    expect(result.uri).toBe(uri);
    expect(result.range.start.character).toBe(9);
    expect(
      (
        await request('textDocument/hover', {
          textDocument: { uri },
          position: { line: 0, character: 27 },
        })
      ).contents.value,
    ).toBe('integer: amount');
    expect(
      (
        await request('textDocument/completion', {
          textDocument: { uri },
          position: { line: 0, character: 34 },
        })
      ).some((x: any) => x.label === 'clamp'),
    ).toBe(true);
    send({
      jsonrpc: '2.0',
      method: 'textDocument/didChange',
      params: {
        textDocument: { uri, version: 2 },
        contentChanges: [{ text: 'integer missing = 1.' }],
      },
    });
    await expect
      .poll(
        () =>
          diagnostics
            .at(-1)
            ?.diagnostics?.some((d: any) => d.code === 'SYNTAX_ERROR'),
        { timeout: 10000 },
      )
      .toBe(true);
    send({
      jsonrpc: '2.0',
      method: 'textDocument/didChange',
      params: {
        textDocument: { uri, version: 3 },
        contentChanges: [{ text: 'print(7).' }],
      },
    });
    await expect
      .poll(() => diagnostics.at(-1)?.diagnostics?.length, { timeout: 10000 })
      .toBe(0);
    await request('shutdown', null);
    send({ jsonrpc: '2.0', method: 'exit' });
  } finally {
    child?.kill();
    await rm(root, { recursive: true, force: true });
  }
}, 30000);
