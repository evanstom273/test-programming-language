# Native application builds

Language Lab can package the same standalone application host used by HTML export into native Tauri applications from the desktop VS Code extension.

## Windows .exe

Open the project in desktop VS Code on Windows, then run:

**Language Lab: Build Windows Application**

The extension:

1. statically analyzes the current project, including unsaved editor buffers;
2. generates the standalone application host from the same Language Lab runtime;
3. creates an isolated temporary Tauri v2 project;
4. generates platform icons;
5. runs a release `tauri build --no-bundle`;
6. copies the resulting single `.exe` to the path selected in the Save dialog.

The finished application does not need VS Code, Language Lab, Node.js or Rust installed on the computer that runs it. It opens as its own native desktop window. On Windows it uses the system WebView2 runtime rather than launching a browser window.

The build machine needs:

- Windows;
- Rust/Cargo;
- Node.js/npm so the extension can launch the pinned Tauri CLI;
- the normal Tauri Windows build prerequisites, including Microsoft C++ build tools.

The extension uses `@tauri-apps/cli@2.12.0`. The first native build may download the CLI and Rust crates.

## Android APK

Run:

**Language Lab: Build Android APK**

The extension prepares the same native project, runs `tauri android init`, then builds an installable debug APK with `tauri android build --apk --debug` and copies it to the selected destination.

Android builds require the normal Tauri mobile prerequisites: Rust, Node.js/npm, a JDK, Android Studio/Android SDK and NDK. Release signing / Play Store AAB publishing is deliberately separate from this first direct-install APK command.

## Application settings

Native settings live in the ordinary project `langlab.json`:

~~~json
{
  "schemaVersion": 1,
  "name": "Goblin Arena",
  "entry": "main.lang",
  "application": {
    "name": "Goblin Arena",
    "identifier": "uk.example.goblinarena",
    "version": "1.0.0",
    "icon": "assets/icon.png",
    "window": {
      "width": 1280,
      "height": 720,
      "fullscreen": false,
      "resizable": true
    },
    "saveData": {
      "location": "appData"
    }
  }
}
~~~

All `application` fields are optional.

Defaults:

- name: project name;
- identifier: derived as `com.languagelab.<projectname>`;
- version: `0.1.0`;
- window: 1280 × 720, windowed, resizable;
- icon: built-in Language Lab icon;
- save-data location: platform application data.

### Icon

`application.icon` is a project-relative PNG or SVG. The builder feeds it through Tauri's icon generator so Windows and Android receive native icon sizes. If omitted, Language Lab generates a default LL icon.

### Save-data location

`application.saveData.location` accepts:

- `appData` — platform-default app data/local data directories; recommended;
- `documents` — place Tauri application directories under `$DOCUMENT/<application name>`;
- `portable` — keep application directories in `./app-data` beside the desktop executable.

Portable storage is rejected for Android because relative executable-adjacent app directories are not portable to Android.

This setting configures the native host's application directories, including the default webview storage location on platforms where Tauri uses those directories. It does not by itself add new Language Lab save/load syntax; persistent game-save APIs remain a separate language feature.

## Security and semantics

Native packaging does not create a second interpreter or transpile Language Lab into Rust. The native shell contains the same serialized ProjectSnapshot, application UI, worker runtime, parser/analyzer and RuntimeSession used by standalone HTML.

Programs do not gain arbitrary native filesystem, process, shell or network access merely because they are packaged. Native builds require VS Code Workspace Trust.

A failed build leaves its temporary native workspace on disk and prints the path in the **Language Lab Build** output channel for troubleshooting. Successful builds remove the temporary workspace.

## Troubleshooting launch failures

On Windows, the extension invokes npm's `npx-cli.js` through `node.exe` rather than spawning `npx.cmd` directly. Direct batch-file spawning with `shell: false` produces `spawn EINVAL` on current Node versions. This launcher preserves spaces and shell characters in paths without enabling shell interpretation.

If an older extension reports `spawn EINVAL`, install the updated VSIX and reload VS Code. The build output should show `node.exe` followed by `npx-cli.js`. Missing or incomplete Node/npm installations now report a prerequisite error; install/repair Node.js with npm and restart VS Code so it receives the updated PATH. Rust, C++ tools and Android prerequisites are still required for the actual build.
