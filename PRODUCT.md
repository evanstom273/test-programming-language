# Language Lab

Language Lab is a typed programming language and local-first browser/mobile IDE. Its audience writes real applications and games, often on a phone or foldable. The same runtime powers IDE previews, standalone HTML and native build targets.

The main workflow is to open a project, edit source, configure exported values in Inspector, Run, and interact with the resulting app. Projects, source and control overrides live in Dexie/IndexedDB. The PWA must remain usable offline. Source defaults, Inspector overrides, app inputs, session state and editor preferences are distinct.

`export` means Inspector configuration, `input` means app input and `public` means module visibility. Language behavior belongs in analysis/runtime modules, not React. Switching files or layouts must not reset an active runtime; source changes require a new Run.

The browser workbench prioritizes mobile touch editing and Pixel Fold-style responsive layouts. The user's confirmed navigation is Code / App / Side by side, with split available on wider screens. Preserve the recognizable dark code-editor identity and straightforward task-oriented controls.

Standalone HTML is directly runnable without the IDE. Native EXE/APK creation requires native toolchains or CI; the browser offers explicitly labelled build-kit downloads, not fabricated executable files. No credentials are collected for builds.
