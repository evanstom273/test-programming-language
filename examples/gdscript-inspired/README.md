# GDScript-inspired language features

ZIP the **contents** of this directory (with `langlab.json` at the root), then use **Import project** in Language Lab. Run `main.lang` to try annotations, typed JSON resources, records, dictionaries, constants, floats, vectors, colours, signals, and explicit function return types together.

`lifecycle.lang` is intentionally unreferenced and does not execute with `main.lang`. Make it the entry point to try update, keyboard, and pointer events. Stop ends updates; Run initializes a new session. Keyboard/pointer events belong to the labelled event surface, not the editor.

Asset picks in resource-typed controls store stable workspace file IDs. Source path literals remain paths: update them when moving their target file. ZIPs contain source/assets, not personal Inspector/input overrides; a new import resolves its own resource IDs on Run.
