import { describe, expect, it } from 'vitest';
import {
  deriveIdentifier,
  resolveApplicationSettings,
  validateApplicationSettings,
} from '../src/workspace/application';
import {
  cargoToml,
  nativeBuildDefinition,
} from '../src/build/native/config';
import { singleFileSnapshot } from '../src/workspace/model';

describe('native application configuration', () => {
  it('derives stable native defaults without changing ordinary projects', () => {
    const project = singleFileSnapshot('print("hello").');
    project.project.name = 'Goblin Arena';
    const definition = nativeBuildDefinition(project, 'windows');

    expect(definition.application).toMatchObject({
      name: 'Goblin Arena',
      identifier: 'com.languagelab.goblinarena',
      version: '0.1.0',
      window: {
        width: 1280,
        height: 720,
        fullscreen: false,
        resizable: true,
      },
      saveData: { location: 'appData' },
    });
    expect(definition.tauri).toMatchObject({
      productName: 'Goblin Arena',
      identifier: 'com.languagelab.goblinarena',
      app: {
        windows: [
          {
            title: 'Goblin Arena',
            width: 1280,
            height: 720,
            fullscreen: false,
            resizable: true,
          },
        ],
      },
    });
    expect(cargoToml(definition)).toContain('name = "goblin-arena"');
  });

  it('maps manifest window and save-data settings into Tauri', () => {
    const project = singleFileSnapshot('print("hello").');
    project.project.application = validateApplicationSettings({
      name: 'Lyra RPG',
      identifier: 'uk.example.lyrarpg',
      version: '2.3.4',
      window: {
        width: 1600,
        height: 900,
        fullscreen: true,
        resizable: false,
      },
      saveData: { location: 'documents' },
    });
    const definition = nativeBuildDefinition(project, 'windows');
    expect(definition.tauri).toMatchObject({
      productName: 'Lyra RPG',
      version: '2.3.4',
      identifier: 'uk.example.lyrarpg',
      app: {
        appDirectoriesOverride: '$DOCUMENT/Lyra RPG',
        windows: [
          {
            width: 1600,
            height: 900,
            fullscreen: true,
            resizable: false,
          },
        ],
      },
    });
  });

  it('keeps portable data beside desktop executable and rejects it on Android', () => {
    const project = singleFileSnapshot('print("hello").');
    project.project.application = validateApplicationSettings({
      saveData: { location: 'portable' },
    });
    expect(nativeBuildDefinition(project, 'windows').tauri).toMatchObject({
      app: { appDirectoriesOverride: './app-data' },
    });
    expect(() => nativeBuildDefinition(project, 'android')).toThrow(
      /Portable save data is not supported on Android/,
    );
  });

  it('validates native metadata early', () => {
    expect(() =>
      validateApplicationSettings({ identifier: 'not an id' }),
    ).toThrow(/reverse-domain/);
    expect(() =>
      validateApplicationSettings({ version: 'version one' }),
    ).toThrow(/semantic versioning/);
    expect(() =>
      validateApplicationSettings({ window: { width: 100 } }),
    ).toThrow(/320 to 8192/);
    expect(() =>
      validateApplicationSettings({ saveData: { location: 'desktop' } }),
    ).toThrow(/appData, documents or portable/);
    expect(deriveIdentifier('123 !')).toBe('com.languagelab.app123');
  });

  it('requires configured icons to exist and carries binary icons into the build', () => {
    const project = singleFileSnapshot('print("hello").');
    project.project.application = validateApplicationSettings({
      icon: 'assets/icon.png',
    });
    expect(() => nativeBuildDefinition(project, 'windows')).toThrow(
      /icon does not exist/,
    );
    project.files.push({
      id: 'icon',
      projectId: 'single',
      path: 'assets/icon.png',
      name: 'icon.png',
      kind: 'file',
      content: '',
      bytes: new Uint8Array([1, 2, 3]),
      revision: 0,
      createdAt: 0,
      updatedAt: 0,
    });
    expect(nativeBuildDefinition(project, 'windows').iconFile?.content).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it('resolves partial settings over project defaults', () => {
    expect(
      resolveApplicationSettings('Demo', {
        window: { width: 900 },
        saveData: { location: 'documents' },
      }),
    ).toEqual({
      name: 'Demo',
      identifier: 'com.languagelab.demo',
      version: '0.1.0',
      window: {
        width: 900,
        height: 720,
        fullscreen: false,
        resizable: true,
      },
      saveData: { location: 'documents' },
    });
  });
});
