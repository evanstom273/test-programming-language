# Standalone HTML applications

**Download standalone HTML** produces one `.html` file containing your program, its project files/assets, the Language Lab interpreter, a worker, styles, and the application controls. Give that file to someone else: they do not need Language Lab, the IDE, Node.js, an account, or an internet connection.

## Export and run

1. In the IDE, open **Files → Project actions → Download standalone HTML**. The project's configured entry point is used, even when another file is selected in the editor.
2. For a single `.lang` file, the temporary file runner also has **Download standalone HTML**; saving an IDE project is not required.
3. Open the downloaded `.html` file in a current browser. The application starts automatically.

Only your application's name, inputs, buttons/events and printed output are shown, with **Restart** and **Stop**. There is no editor, Explorer, Inspector, source picker, project library or Language Lab navigation. Restart creates a fresh runtime and restores the exported configuration and code defaults. Stop terminates the worker, including running code. Configuration changes require re-exporting the application.

The exported file works offline with no requests to Language Lab, a CDN, or an external worker file. It can also be hosted on an ordinary static website. No server-side execution is required. It is a browser application, not a native executable or an installable PWA package.

On mobile the app uses the same touch-sized controls and responsive layout. Open the HTML in a browser that executes local HTML; some Files/Downloads apps, especially iOS previewers, display a static preview or refuse active content. In that case, host the **same single HTML file** on a static site and open its URL in the browser. This is a file-opening restriction, not a requirement to install Language Lab. Managed browsers may also block local HTML by policy. The browser must support JavaScript, Web Workers, blob URLs and structured cloning. Actual device file-opening behavior varies; mobile viewport tests do not guarantee every OS file association.

## What is included

- All source files and assets in the selected project, with stable file identities and relative paths. Modules and JSON resources resolve inside that snapshot. Only modules reachable from the configured entry point execute.
- Current **Inspector/export overrides**, as author configuration. These remain distinct from code defaults and are never written into source.
- The current language/runtime implementation, application renderer and styles. Existing language features run through the same parser, analyzer and RuntimeSession as the IDE; no alternate language or generated JavaScript semantics are introduced.

**Saved input overrides, editor preferences, database contents, runtime mutations and output history are not included.** Application inputs start from their code defaults. User changes and state survive button presses in the current session; restarting, reloading or closing discards them. There is no new persistent application save-data feature.

The export contains readable source and assets, including unreferenced files. Treat it as a distributable copy of the selected project, not a way to hide code or secrets. It does not contain other projects in your library. Source download and ZIP export remain available separately.

## Validation and isolation

Export runs static analysis in a worker and reports syntax/module/type diagnostics with source locations. It never executes user functions just to build the artifact. An application can still encounter a runtime error when run, such as division by zero or an unavailable dynamically selected resource.

Existing file/project size limits, operation/time/call-depth limits, output/event/value limits, stale-message protection and the worker termination watchdog remain active. Embedded source is treated as data, not interpolated JavaScript or HTML. A content security policy prevents network connections and external resources. Programs gain no unrestricted filesystem or network access.

A one-file export cannot invent missing modules or assets: use a complete IDE project when dependencies are needed. Binary assets are preserved in the snapshot; this export does not add new image/audio/language APIs beyond what the interpreter already supports.

## Build architecture

`build/standalonePlugin.ts` builds a separate production IIFE host during the IDE build (and on demand in development). Its dependency graph contains the shared runtime/session hook and application controls, not CodeMirror, the IDE shell or Dexie. The worker is bundled inline with Vite. The exporter receives that host through a virtual module and is itself loaded only when exporting; the PWA precaches it for offline export.

`src/build/standalone/` owns the versioned payload, HTML envelope, safe serialization, export validation/download and application-only entry point. The artifact embeds its host as base64 data and creates a local blob script; that host creates a blob worker. Nothing is fetched at runtime. The shared runtime client still owns epochs, message limits, watchdogs and hard termination.

Tests exercise actual downloaded files in a fresh offline browser context over `file://`, with the authoring page closed. They cover inputs/buttons/functions/signals, configuration/default separation, restart/Stop, limits, modules/resources, injection strings, mobile layout and the production PWA export path. In managed cloud browsers that block `file://`, `STANDALONE_TEST_TRANSPORT=loopback` previews the exact downloaded file through a local test response; CI/default retains real local-file navigation.
