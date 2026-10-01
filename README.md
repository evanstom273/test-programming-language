# Language Lab

A browser-based IDE and early interpreter for an English-like, executable-pseudocode programming language.

The language deliberately keeps symbolic syntax small. The current allowed symbols are:

```text
. , ( ) [ ] " =
```

Logic and arithmetic are intended to read mostly as words.

## Current example

```text
text name = "Lyra".
integer health = 100.
integer damage = 25.
array inventory = ["sword", "potion", "key"].

print("Hello", name).
health = health minus damage.
print("Health remaining", health).
print("First item", inventory[0]).
```

## Stack

- Vite
- React
- TypeScript
- Tailwind CSS
- CodeMirror 6
- Dexie / IndexedDB
- vite-plugin-pwa
- TypeScript lexer, parser, and interpreter

Everything currently runs directly in the browser. There is no Python runtime or server dependency.

## Development

```bash
npm install
npm run dev
```

Build with:

```bash
npm run build
```

## Current language foundation

- Tokenizer / lexer with line and column information
- `integer`, `text`, `boolean`, and `array` declarations
- Assignment with `=`
- Strings, numbers, booleans, arrays, and array indexing
- `print(...)`
- English arithmetic: `plus`, `minus`, `times`, `divided by`, `remainder`
- CodeMirror highlighting, completion suggestions, and diagnostics
- Local files persisted with IndexedDB
- Installable PWA shell for phone/desktop
- GitHub Pages deployment workflow

This is intentionally only the foundation. The language and IDE are meant to evolve together.
