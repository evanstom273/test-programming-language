import { describe, expect, it } from 'vitest';
import { singleFileSnapshot } from '../src/workspace/model';
import {
  serializeProject,
  deserializeProject,
} from '../src/build/standalone/model';
import {
  standaloneDocument,
  standaloneFilename,
} from '../src/build/standalone/document';
import { compileProject } from '../src/language/analysis';
import { RuntimeSession } from '../src/language/runtime';

describe('standalone project packaging', () => {
  it('preserves code, module/resource identities and configuration while excluding saved app inputs and editor metadata', () => {
    const project = singleFileSnapshot(
      'export integer: factor = 3. input integer: number = 2. print(factor * number).',
    );
    project.files[0].exportOverrides = { factor: 4 };
    project.files[0].inputOverrides = { number: 99 };
    project.files[0].revision = 40;
    project.files[0].createdAt = 12345;
    project.files.push({
      ...project.files[0],
      id: 'asset',
      path: 'assets/data.bin',
      bytes: new Uint8Array([0, 255, 32, 127]),
      content: '',
      exportOverrides: undefined,
      inputOverrides: undefined,
    });
    const before = structuredClone(project);
    const json = serializeProject(project);
    const restored = deserializeProject(json);
    expect(project).toEqual(before);
    expect(restored.files[0].id).toBe(project.files[0].id);
    expect(restored.files[0].inputOverrides).toBeUndefined();
    expect(restored.files[0].revision).toBe(0);
    expect(restored.files[1].bytes).toEqual(project.files[1].bytes);
    expect(json).not.toContain('inputOverrides');
    const session = new RuntimeSession(compileProject(restored), {
      modules: {
        'main.lang': { exportOverrides: restored.files[0].exportOverrides },
      },
    });
    expect(session.snapshot().output).toEqual(['8']);
  });
  it('serializes without executing arbitrary source or computed exports', () => {
    const project = singleFileSnapshot(
      'function stuck(). while true, do. end while. end function. export integer: number = stuck().',
    );
    expect(deserializeProject(serializeProject(project)).files[0].content).toBe(
      project.files[0].content,
    );
  });
  it('rejects unsafe paths, oversized files, unknown formats and corrupt binary data', () => {
    const project = singleFileSnapshot('print(1).');
    project.files[0].path = '../main.lang';
    expect(() => serializeProject(project)).toThrow(/path/);
    project.files[0].path = 'main.lang';
    project.files[0].content = 'x'.repeat(1_000_001);
    expect(() => serializeProject(project)).toThrow(/limit/);
    expect(() => deserializeProject('{"version":2,"files":[]}')).toThrow(
      /format/,
    );
    const valid = JSON.parse(serializeProject(singleFileSnapshot('print(1).')));
    valid.files[0].bytes = '%%%';
    expect(() => deserializeProject(JSON.stringify(valid))).toThrow();
  });
  it('keeps HTML, closing script tags, Unicode and malicious titles inert', () => {
    const text =
      '</script><script>window.pwned = true</script> <!-- & 🐉\u2028\u2029';
    const project = singleFileSnapshot(text);
    project.project.name = '</title><img src=x onerror=alert(1)>';
    const host = {
      script: `console.log(${JSON.stringify(text)})`,
      style: 'body{color:white}',
    };
    const html = standaloneDocument(project, host);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>window.pwned');
    expect(html.match(/<script(?: |\>)/g)).toHaveLength(3);
    const json = html.match(
      /id="app-project" type="application\/json">([\s\S]*?)<\/script>/,
    )![1];
    expect(deserializeProject(json).files[0].content).toBe(text);
    const encoded = html.match(
      /id="app-host" type="application\/octet-stream">([^<]*)<\/script>/,
    )![1];
    expect(Buffer.from(encoded, 'base64').toString('utf8')).toBe(host.script);
    expect(html).toContain("connect-src 'none'");
    expect(html).not.toContain('src="http');
  });
  it('provides a portable HTML filename', () => {
    expect(standaloneFilename('My game')).toBe('My game.html');
    expect(standaloneFilename('../bad:game?')).toBe('..-bad-game-.html');
    expect(standaloneFilename('...')).toBe('Application.html');
  });
});
