# Language Lab in VS Code

This desktop extension uses the same parser, binder, diagnostics and runtime as the browser IDE, CLI and standalone HTML target. There is no second language implementation.

## Install

Download the `language-lab-vsix` artifact from a successful PR **Build check → vscode** job, extract it, then use **Extensions → … → Install from VSIX** and select `language-lab.vsix`.

Alternatively build it from this repository with Node 20+:

```sh
npm ci
npm run vscode:package
code --install-extension language-lab.vsix
```

VS Code 1.96 or newer is required. The local package uses `language-lab-local.language-lab` as its development identifier. It is not published to the Marketplace. The repository has no declared project license; packaging does not grant a new license or publish the extension.

## Edit and run

Open a folder with a project such as:

```text
My App/
  langlab.json
  main.lang
  lib/
    maths.lang
  assets/
    player.json
```

```json
{"schemaVersion":1,"name":"My App","entry":"main.lang"}
```

The nearest `langlab.json` within the opened workspace selects the project and entry point. A `.lang` file without such a manifest runs as a temporary single-file project. Save untitled documents to disk first. A file outside the opened workspace is treated as a single file, without silently reading adjacent projects.

- Syntax highlighting, comment toggling, bracket matching and block indentation.
- Problems diagnostics for syntax, binding, types, imports and project loading.
- Completion for keywords, built-ins, bound symbols and public namespaced functions.
- Hover signatures, go-to-definition, references and document symbols.
- **Language Lab: Run Project / File**, or **Ctrl+Enter / Cmd+Enter**, opens the interactive App Preview beside the editor.
- **Language Lab: Stop Application** terminates the runtime worker.
- **Language Lab: Export Standalone HTML** exports the complete app with a Save dialog.

Unsaved editor buffers override disk files for analysis and Run, including edited imported modules and new named files. Changing source/assets stops the old preview; use **Run latest source**. Inputs, buttons, functions, events, resources and current-session state use the existing runtime. The preview supports Inspector configuration and application inputs as separate controls. No language code runs during static analysis.

## State and host boundaries

Inspector values are stored in VS Code workspace state, keyed by file URI and variable name. Source is never rewritten. Reset controls remove overrides. File/folder renames performed through VS Code migrate configuration keys and resource references; external filesystem renames cannot be reliably matched and may require reconfiguration. Update affected import paths yourself. Application inputs and runtime mutations are session-local in this release and restart from code defaults. Exported HTML includes Inspector configuration and omits transient application inputs/state, as in the browser IDE.

Disk files are loaded into the existing bounded ProjectSnapshot/VFS. Hidden entries and `node_modules`, `dist`, `test-results` are excluded. Symlinks, escaping entry paths, unsupported manifests, oversized files/projects and excessive directory counts are rejected. A project can contain at most 200 files, 1 MB per file and 10 MB total. Keep generated exports outside the source project or in `dist/`.

The extension reads files; interpreted programs do not receive VS Code's filesystem, process or network APIs. Execution/export require Workspace Trust. Static analysis runs in separate bounded Node workers under the language-server process, with cancellation, a five-second watchdog and bounded concurrency. The preview runs code in its own browser worker with existing event/output/value/operation limits, Stop and epoch protection. Webview messages are validated and scoped to the current preview generation.

Desktop VS Code is the initial target. The workspace extension may run on a remote extension host, but browser-only vscode.dev support is not implemented. CI tests VS Code 1.96 on Linux; native Windows/macOS smoke tests remain useful before Marketplace distribution.

## Architecture and development

- `src/language/` + `src/workspace/model.ts`/`vfs.ts`: shared host-independent language/project core; no React, VS Code or database dependency.
- `src/tooling/service.ts`: reusable editor queries over binding information, including partial top-level analysis of incomplete buffers.
- `extensions/vscode/src/project.ts`: bounded disk/buffer snapshot adapter.
- `server.ts` + `analysis-worker.ts`: standard LSP transport, diagnostics and providers.
- `extension.ts`: VS Code commands, trust, workspace configuration and webview lifecycle.
- `preview.tsx`: shared React controls/session hook rendered inside a restricted webview.
- `scripts/build-vscode.mjs`: bundles the extension, server, worker, preview and standalone target. The package needs no npm installation on the recipient's machine. TextMate keywords/built-ins are generated from the core catalogs.

```sh
npm run vscode:build
npm run vscode:package
# Requires a downloadable VS Code binary and desktop display (xvfb on Linux):
npm run test:vscode
```

The extension-host suite loads the files extracted from the actual VSIX, not a different source checkout. Unit tests also exercise the real LSP transport, unsaved diagnostics and filesystem boundaries. Browser tests exercise preview inputs, configuration and stale-source protection. The managed cloud environment may not reach the VS Code binary download endpoint; CI runs the real extension-host suite.

Formatting, safe rename, signature help, debugging, Marketplace publishing and web-extension packaging are follow-ups. Formatting needs comment/trivia preservation; rename needs full type/member/import reference coverage. These are not advertised as implemented. Existing completion/binding is conservative and does not promise TypeScript-level inference or completion inside malformed function bodies.
