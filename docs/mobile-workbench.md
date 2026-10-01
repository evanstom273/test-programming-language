# Mobile workbench

Choose **Code** to edit, **App** to use the running program, or **Side by side** to keep both visible. Split requires at least 700px of viewport width. Drag its divider or focus it and use the arrow keys to resize; the code pane can take 35–65%. If a saved split layout becomes too narrow, Code appears until the screen is wide enough again. Switching layouts or files keeps the active runtime intact.

**Run** starts the current source and Inspector configuration. Outside split view it opens App. Changes to source or Inspector values require another Run. **Stop** stops the program. With focus in the editor, Ctrl/Cmd+Enter runs the project.

Open **Files** to choose projects and files. Wide desktop screens have an optional Explorer sidebar. Open files appear as scrollable tabs; closing a tab does not delete its file. Each text file retains its own editor selection and undo history while the editor remains mounted. Undo history and open tabs are session UI, not durable project backups.

The horizontally scrollable touch toolbar provides undo/redo, indent/outdent, cursor left/right, punctuation and an **Insert…** snippet menu. You can hide it in Settings. Settings also offers code sizes of 14, 16, 18 or 20px and line wrapping. Code size, wrapping, toolbar visibility, chosen layout and split ratio are saved in this browser on this device, separately from project data.

**Search project** finds text case-insensitively across text files, showing up to 100 matching lines. Select a result to open its location. Ctrl/Cmd+F searches the current file. **Problems** lists syntax/project diagnostics with navigation to their source; runtime errors appear in App. **Commands** (Ctrl/Cmd+K) finds actions and files; use arrow keys and Enter, or tap a result. Panels use native browser dialogs; close with the close button or Escape.

## Data and configuration

- **Source defaults** are values written in code.
- **Inspector** configures `export` declarations without rewriting source. Overrides apply on the next Run; reset a control to return to its code default.
- **App inputs** come from `input` declarations and interact with the running app. Valid inputs are saved separately from Inspector overrides. The App reset action clears saved inputs and restarts.
- **Runtime state** belongs to the active run and is not an exported save game. `public` controls module visibility; it does not create an Inspector control.

Projects and overrides continue to use the existing Dexie/IndexedDB storage and schema. Editor preferences use the separate `langlab.editor.v1` local-storage entry; `langlab.selection.v1` remembers the last project and file selection. Browser storage is local; export source when you need a portable backup. The existing PWA/offline model is unchanged.

## Downloads and native builds

Export uses the current source, including recent edits.

| Download | Contents and next step |
| --- | --- |
| Standalone HTML | Runnable app without the IDE; includes Inspector configuration. |
| Source ZIP | Portable project source and assets; no Inspector or saved-input overrides. |
| Windows EXE build kit | ZIP containing a Tauri wrapper, app and build instructions/workflow. Build on Windows locally or with included CI; output is unsigned and requires WebView2. |
| Android APK build kit | ZIP containing the wrapper, app and build instructions/workflow. Included CI produces an ARM64 debug APK for testing, not a Play Store release. |

HTML and native kits include Inspector configuration, but exclude saved app inputs and running state. Native build kits are **not in-browser compiles** and are not finished EXE/APK files.

Read the generated kit's **README** for local toolchains and exact commands. For CI, extract the ZIP, commit its contents (including `.github/workflows/build.yml`) to your GitHub repository, run the included workflow in Actions, and download the completed artifact. CI requires internet access and your GitHub account. Language Lab does not collect cloud credentials or upload the project automatically.

Native binaries have not been compiled in this Linux development environment; verify the generated builds on the target platforms.
