import type { ProjectSnapshot } from '../../workspace/model';
import {
  resolveApplicationSettings,
  type ResolvedApplicationSettings,
} from '../../workspace/application';

export type NativeTarget = 'windows' | 'android';

export interface NativeBuildDefinition {
  application: ResolvedApplicationSettings;
  crateName: string;
  tauri: Record<string, unknown>;
  iconFile?: {
    path: string;
    content: string | Uint8Array;
  };
}

function crateName(name: string) {
  let value = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  if (!value) value = 'language-lab-app';
  if (!/^[a-z]/.test(value)) value = 'app-' + value;
  return value;
}

function dataOverride(
  app: ResolvedApplicationSettings,
  target: NativeTarget,
): string | undefined {
  if (app.saveData.location === 'appData') return undefined;
  if (app.saveData.location === 'portable') {
    if (target === 'android')
      throw new Error(
        'Portable save data is not supported on Android. Use appData or documents.',
      );
    return './app-data';
  }
  const folder = app.name.replace(/[\\/:*?"<>|]/g, '-').slice(0, 80);
  return '$DOCUMENT/' + folder;
}

export function nativeBuildDefinition(
  snapshot: ProjectSnapshot,
  target: NativeTarget,
): NativeBuildDefinition {
  const application = resolveApplicationSettings(
    snapshot.project.name,
    snapshot.project.application,
  );
  const icon = application.icon
    ? snapshot.files.find(
        (file) => file.kind === 'file' && file.path === application.icon,
      )
    : undefined;
  if (application.icon && !icon)
    throw new Error(
      'Application icon does not exist in the project: ' + application.icon,
    );

  const override = dataOverride(application, target);
  const bundle: Record<string, unknown> = {
    active: true,
    targets: 'all',
    android: { minSdkVersion: 24 },
    icon: [
      'icons/32x32.png',
      'icons/128x128.png',
      'icons/128x128@2x.png',
      'icons/icon.icns',
      'icons/icon.ico',
    ],
  };

  const app: Record<string, unknown> = {
    security: { csp: null },
    windows: [
      {
        label: 'main',
        title: application.name,
        width: application.window.width,
        height: application.window.height,
        fullscreen: application.window.fullscreen,
        resizable: application.window.resizable,
        center: true,
      },
    ],
  };
  if (override) app.appDirectoriesOverride = override;

  return {
    application,
    crateName: crateName(application.name),
    tauri: {
      $schema: 'https://schema.tauri.app/config/2',
      productName: application.name,
      version: application.version,
      identifier: application.identifier,
      build: { frontendDist: '../dist' },
      app,
      bundle,
    },
    iconFile: icon
      ? {
          path:
            'app-icon.' +
            (application.icon?.split('.').pop()?.toLowerCase() || 'png'),
          content: icon.bytes ?? icon.content,
        }
      : undefined,
  };
}

export const defaultIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<rect width="512" height="512" rx="96" fill="#0d1117"/>
<rect x="28" y="28" width="456" height="456" rx="76" fill="#161b22" stroke="#58a6ff" stroke-width="24"/>
<text x="256" y="300" text-anchor="middle" font-family="Arial,sans-serif" font-size="170" font-weight="700" fill="#f0f6fc">LL</text>
</svg>`;

export function cargoToml(definition: NativeBuildDefinition): string {
  return `[package]
name = "${definition.crateName}"
version = "${definition.application.version}"
edition = "2021"

[lib]
name = "language_lab_app_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }

[profile.release]
strip = true
lto = true
codegen-units = 1
panic = "abort"
`;
}

export const tauriBuildRs = 'fn main() { tauri_build::build() }\n';

export const tauriLibRs = `#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Language Lab application");
}
`;

export const tauriMainRs = `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    language_lab_app_lib::run();
}
`;

export const tauriCapability = JSON.stringify(
  {
    $schema: '../gen/schemas/desktop-schema.json',
    identifier: 'default',
    description: 'Language Lab application window',
    windows: ['main'],
    permissions: ['core:default'],
  },
  null,
  2,
);
