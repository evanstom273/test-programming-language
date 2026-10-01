# Running .lang files

For a distributable application that requires no Language Lab tooling, use [Download standalone HTML](standalone-html.md).

A `.lang` file is now directly runnable **source**. Language Lab supplies the interpreter and application host; the file is not a native executable and does not install itself.

## Command line

Use Node.js 20 or newer and install the repository dependencies once:

```sh
npm ci
npm run lang:check -- examples/hello.lang
npm run lang:run -- examples/hello.lang
```

For your own files, including paths with spaces:

```sh
npm run lang:check -- "path/to/My game.lang"
npm run lang:run -- "path/to/My game.lang"
```

`lang:check` performs static analysis without executing user code. Diagnostics contain the supplied filename, line, column, code, and message. Valid interactive programs also pass checking.

`lang:run` runs console programs and prints their output. Exports use their code defaults. Ordinary functions, `randomInteger`, both range-loop forms, records, collections, JSON conversions, vectors/colours, and local signal queues use the same interpreter as the IDE.

Programs declaring inputs, buttons, or host lifecycle/input handlers (including `on start`) require a browser host. `lang:run` detects these from the validated, reachable AST **before executing any top-level statements**, prints instructions, and exits with status 2. It never pretends a terminal rendered controls or an update loop.

Exit codes: 0 = successful check/run, 1 = file/analysis/execution error, 2 = interactive host required, 130 = interrupted execution after startup. Ctrl+C stops execution. An operation/time budget or the five-second parent watchdog also stops a stuck worker.

### Launch an interactive file

Build the web host, then launch the selected file:

```sh
npm run build
npm run lang:open -- examples/interactive-calculator.lang
```

`lang:open` starts a local server on a random **127.0.0.1** port, prints its URL, and attempts to open the default browser. If automatic launch is unavailable, open the printed URL manually. Keep the terminal open; Ctrl+C closes the server. Run `npm run build` again after changing host code. `LANGLAB_NO_BROWSER=1` suppresses automatic browser launch for automation.

The server serves the built host and one bounded source payload behind a random launch token. It does not expose the selected file's directory, accept uploads, or load neighboring resources. Requests are restricted to its loopback origin; source responses are not cached. File contents and absolute disk paths are not placed in the launch URL. The runner removes the launch token from the visible URL after receiving it.

These are repository-local npm commands. A global `ll` executable is **not** installed or published. The npm wrapper compiles the shared TypeScript core and CLI adapter into ignored `.langlab-cli/`; it does not compile the user's language program into JavaScript. No additional runtime dependency is installed.

## Desktop browser / installed PWA

1. In the IDE's Files/Explorer area, choose **Open / Run .lang File**. On a narrow screen, open Files first.
2. Choose a `.lang` file from your device. It opens in Language Lab Runner and immediately runs in a worker.
3. Alternatively, drag one `.lang` file onto the IDE or runner.
4. Use the program's controls/buttons, or **Run**, **Stop**, and **Clear output**.
5. Open **Program settings (exports)** for optional configuration. Changing an export stops the old session; press Run to apply it.

The runner can also be opened directly at the deployment's `?runner=1` URL. It has no CodeMirror editor or project browser. Its entry does not initialize IndexedDB or import the workspace library until Save is requested. The PWA may still precache IDE assets for offline availability.

## Android and iOS

Open Language Lab in the browser or installed home-screen app, then choose **Open / Run .lang File**. Use the device's Files/Downloads picker. If the `.lang` file is hidden by the platform's type filter, choose **Browse all files**; Language Lab still validates the extension and contents itself. Controls retain touch-sized targets and the numeric/text keyboard behavior used by the IDE.

After the PWA has loaded and its service worker has finished caching, the runner works offline with files available on the device. Cloud-only files may need to be downloaded first. Closing/reloading the page discards the temporary session, configuration, and user input.

### OS file associations: actual support

| Platform | Opening a `.lang` file from the operating system |
|---|---|
| Installed desktop Chromium (Chrome/Edge, including Windows; OS/browser policy permitting) | Manifest `file_handlers` advertises `.lang`; `launchQueue` receives the file after the browser/OS grants access. Installation/association permissions are controlled by the browser and OS. Registration is not guaranteed merely by visiting the site. |
| Android Chrome/PWA | Manifest file handlers are not supported. Use Open / Run and the device file picker. This change does not implement Android share-sheet receiving. |
| Safari / iOS home-screen apps | Manifest file handlers are not supported. Use Open / Run and the Files picker. Universal “Open with Language Lab” registration is not available. |
| Firefox / unsupported browsers | Use the picker, or desktop drag/drop. Unsupported manifest members are ignored. |

The file-handler action and Run File shortcut stay within the GitHub Pages deployment subpath. File launches use the same temporary runner; handles are read once and are not retained or used to write back to the device. Multiple-file launches are rejected with instructions rather than choosing a file silently.

Support reference, checked 2026-10-01: [MDN file_handlers](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/file_handlers) and [MDN browser compatibility data](https://github.com/mdn/browser-compat-data/blob/main/manifests/webapp/file_handlers.json). Desktop Chromium support starts at version 102; this remains a feature-detected API. Automated tests validate the manifest and launch consumer; actual OS registration/chooser behavior requires testing on the target installed browser and device.

## Temporary files and saving

A selected source file becomes a one-file `ProjectSnapshot`, with its filename as the entry point and fresh project/file IDs. The usual VFS, parser, static analyzer, immutable Program, RuntimeSession, and typed worker messages execute it. There is no alternate language parser or special evaluation path.

Opening and running does not add anything to your project library, change existing projects, rewrite source, or overwrite the device file. Input and export overrides stay in memory. Run reapplies code defaults and those temporary overrides; button/event mutations remain runtime state.

**Save as project** explicitly imports a copy through the existing transactional workspace store, including current source and user configuration/input overrides. Runtime mutations are not saved as defaults. The file/project identities remain stable. **Open saved project in IDE** selects that project. Further runner edits do not silently update the saved copy. Save failures are reported without partial project insertion.

## Files, dependencies, and limits

- Files must have a `.lang` extension and contain valid UTF-8 (an optional UTF-8 BOM is accepted).
- The file-size limit remains 1 MB in bytes. Unsafe path-like device names are rejected. Spaces/Unicode in safe basenames are supported; `.LANG` is normalized to `.lang` inside the temporary project.
- A single-file snapshot contains **only that file**. An import of a neighboring disk file fails analysis. A resource outside the snapshot fails when evaluated, even if such a file exists beside the source on disk. `check` is static analysis, not a guarantee that a dynamically selected resource will exist.
- JSON embedded in source through dictionaries or `parseJSON` works normally. Programs needing modules or asset files should use a project containing those files in the IDE.
- Workers, step/time/call-depth limits, bounded output and values, event count/payload limits, epoch checks, and Stop remain in effect. CLI execution uses a Node worker with a memory limit and hard-termination watchdog. The language receives no Node/browser filesystem or network API.

## Downloaded source versus other artifacts

| Artifact / mode | What it contains / does |
|---|---|
| Download file for `.lang` source | Clean source text and a `.lang` filename, with `text/x-language-lab;charset=utf-8`. No overrides, executable wrapper, manifest, or runtime is inserted. MIME/extension registration is not assumed on every OS. |
| Project ZIP | Project metadata, source files, and assets. Import it in the IDE for multi-file execution; the single-file runner does not unpack ZIPs. |
| Interactive runner | Language Lab's lightweight browser host for source, controls, buttons, events, and output. |
| Standalone HTML app | A complete, offline browser application with the interpreter, controls, source and project assets embedded. See [standalone export](standalone-html.md). |
| Future native build | EXE/APK, bytecode, a JS compiler and debugger remain separate future targets. |

Downloading a file from a multi-file project does not bundle its dependencies. Use project ZIP export when those files are needed.
