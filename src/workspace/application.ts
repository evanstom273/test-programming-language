import type { ApplicationSettings } from './model';
import { canonicalPath } from './vfs';

const PRODUCT_NAME = /^[^\\/:*?"<>|]+$/;
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+$/;
const VERSION =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export function deriveIdentifier(name: string): string {
  let segment = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!segment) segment = 'application';
  if (!/^[a-z]/.test(segment)) segment = 'app' + segment;
  return 'com.languagelab.' + segment.slice(0, 48);
}

export function validateApplicationSettings(
  value: unknown,
): ApplicationSettings | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('application must be an object.');

  const input = value as Record<string, unknown>;
  const allowed = new Set([
    'name',
    'identifier',
    'version',
    'icon',
    'window',
    'saveData',
  ]);
  for (const key of Object.keys(input))
    if (!allowed.has(key))
      throw new Error('Unknown application setting: ' + key);

  const result: ApplicationSettings = {};

  if (input.name !== undefined) {
    if (
      typeof input.name !== 'string' ||
      !input.name.trim() ||
      input.name.length > 120 ||
      !PRODUCT_NAME.test(input.name)
    )
      throw new Error(
        'application.name must be 1-120 characters and may not contain \\ / : * ? " < > |.',
      );
    result.name = input.name.trim();
  }

  if (input.identifier !== undefined) {
    if (
      typeof input.identifier !== 'string' ||
      input.identifier.length > 180 ||
      !IDENTIFIER.test(input.identifier)
    )
      throw new Error(
        'application.identifier must use reverse-domain notation such as com.example.game.',
      );
    result.identifier = input.identifier;
  }

  if (input.version !== undefined) {
    if (typeof input.version !== 'string' || !VERSION.test(input.version))
      throw new Error(
        'application.version must be semantic versioning such as 1.0.0.',
      );
    result.version = input.version;
  }

  if (input.icon !== undefined) {
    if (typeof input.icon !== 'string')
      throw new Error('application.icon must be a project-relative path.');
    result.icon = canonicalPath(input.icon);
  }

  if (input.window !== undefined) {
    if (
      !input.window ||
      typeof input.window !== 'object' ||
      Array.isArray(input.window)
    )
      throw new Error('application.window must be an object.');
    const window = input.window as Record<string, unknown>;
    for (const key of Object.keys(window))
      if (!['width', 'height', 'fullscreen', 'resizable'].includes(key))
        throw new Error('Unknown application.window setting: ' + key);
    const settings: NonNullable<ApplicationSettings['window']> = {};
    for (const dimension of ['width', 'height'] as const) {
      const value = window[dimension];
      if (value === undefined) continue;
      if (
        typeof value !== 'number' ||
        !Number.isInteger(value) ||
        value < 320 ||
        value > 8192
      )
        throw new Error(
          'application.window.' +
            dimension +
            ' must be an integer from 320 to 8192.',
        );
      settings[dimension] = value;
    }
    for (const option of ['fullscreen', 'resizable'] as const) {
      const value = window[option];
      if (value === undefined) continue;
      if (typeof value !== 'boolean')
        throw new Error(
          'application.window.' + option + ' must be true or false.',
        );
      settings[option] = value;
    }
    result.window = settings;
  }

  if (input.saveData !== undefined) {
    if (
      !input.saveData ||
      typeof input.saveData !== 'object' ||
      Array.isArray(input.saveData)
    )
      throw new Error('application.saveData must be an object.');
    const saveData = input.saveData as Record<string, unknown>;
    for (const key of Object.keys(saveData))
      if (key !== 'location')
        throw new Error('Unknown application.saveData setting: ' + key);
    if (
      saveData.location !== undefined &&
      !['appData', 'documents', 'portable'].includes(
        String(saveData.location),
      )
    )
      throw new Error(
        'application.saveData.location must be appData, documents or portable.',
      );
    result.saveData = {
      location: (saveData.location ?? 'appData') as
        | 'appData'
        | 'documents'
        | 'portable',
    };
  }

  return result;
}

export interface ResolvedApplicationSettings {
  name: string;
  identifier: string;
  version: string;
  icon?: string;
  window: {
    width: number;
    height: number;
    fullscreen: boolean;
    resizable: boolean;
  };
  saveData: {
    location: 'appData' | 'documents' | 'portable';
  };
}

export function resolveApplicationSettings(
  projectName: string,
  value?: ApplicationSettings,
): ResolvedApplicationSettings {
  const name = value?.name ?? projectName;
  return {
    name,
    identifier: value?.identifier ?? deriveIdentifier(name),
    version: value?.version ?? '0.1.0',
    icon: value?.icon,
    window: {
      width: value?.window?.width ?? 1280,
      height: value?.window?.height ?? 720,
      fullscreen: value?.window?.fullscreen ?? false,
      resizable: value?.window?.resizable ?? true,
    },
    saveData: {
      location: value?.saveData?.location ?? 'appData',
    },
  };
}
