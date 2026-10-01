import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { nativeBuildKit } from '../src/build/native/kit';
import { singleFileSnapshot } from '../src/workspace/model';
import { standaloneDocument } from '../src/build/standalone/document';
import { deserializeProject } from '../src/build/standalone/model';

const snapshot = () => {
  const p = singleFileSnapshot(
    'export text: title = "Game". input integer: score = 0.',
  );
  p.project.name = 'Pocket Game';
  p.files[0].exportOverrides = { title: 'Shared title' };
  p.files[0].inputOverrides = { score: 999 };
  return p;
};
describe('portable browser native build kits', () => {
  for (const target of ['windows', 'android'] as const)
    it(`packages a complete ${target} workspace and build workflow`, () => {
      const project = snapshot();
      const html = standaloneDocument(project, {
        script: 'console.log("host")',
        style: '',
      });
      const files = unzipSync(nativeBuildKit(project, html, target));
      const text = (name: string) => strFromU8(files[name]);
      expect(text('dist/index.html')).toBe(html);
      const shipped = deserializeProject(
        text('dist/index.html').match(
          /<script id="app-project" type="application\/json">(.*?)<\/script>/s,
        )![1],
      );
      expect(shipped.files[0].exportOverrides).toEqual({
        title: 'Shared title',
      });
      expect(shipped.files[0].inputOverrides).toBeUndefined();
      expect(
        JSON.parse(text('src-tauri/tauri.conf.json')).build.frontendDist,
      ).toBe('../dist');
      expect(text('src-tauri/Cargo.toml')).toContain('name = "pocket-game"');
      for (const path of [
        'src-tauri/src/main.rs',
        'src-tauri/src/lib.rs',
        'src-tauri/build.rs',
        'src-tauri/capabilities/default.json',
        'app-icon.svg',
      ])
        expect(files[path].length).toBeGreaterThan(0);
      const workflow = text('.github/workflows/build.yml');
      expect(workflow).toContain('workflow_dispatch:');
      expect(workflow).toContain('if-no-files-found: error');
      expect(workflow).toContain('contents: read');
      if (target === 'windows') {
        expect(workflow).toContain('windows-latest');
        expect(workflow).toContain('target/release/pocket-game.exe');
      } else {
        expect(workflow).toContain('aarch64-linux-android');
        expect(workflow).toContain('--apk --debug --target aarch64');
        expect(workflow).toContain('outputs/apk/**/*.apk');
        expect(text('README.md')).toContain('signing keys can change');
      }
      expect(text('README.md')).toContain('NOT an EXE or APK yet');
      expect(project.files[0].inputOverrides).toEqual({ score: 999 });
    });
  it('does not interpolate project names into workflow shell commands', () => {
    const project = snapshot();
    project.project.name = 'game $(echo injected)';
    const files = unzipSync(nativeBuildKit(project, 'html', 'windows'));
    expect(strFromU8(files['.github/workflows/build.yml'])).not.toContain(
      '$(echo',
    );
  });
  it('rejects unsupported icon formats and incompatible Android settings', () => {
    const project = snapshot();
    project.project.application = { saveData: { location: 'portable' } };
    expect(() => nativeBuildKit(project, 'html', 'android')).toThrow(
      'Portable',
    );
    project.project.application = { icon: 'bad.jpg' };
    project.files.push({
      ...project.files[0],
      id: 'icon',
      path: 'bad.jpg',
      bytes: new Uint8Array([1]),
    });
    expect(() => nativeBuildKit(project, 'html', 'windows')).toThrow(
      'PNG or SVG',
    );
  });
});
