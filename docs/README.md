# Language Lab documentation

This directory documents the programming language implemented by Language Lab, the runtime that executes it, and the conventions used when writing .lang source.

These documents describe the behavior on main at the time they were written. Language Lab is evolving quickly, so implementation and tests remain the final authority when a feature branch deliberately changes the language.

## Start here

- [VS Code](vscode.md) — installable desktop extension, LSP tooling and App Preview.
- [General coding improvements](coding-improvements.md) — comments, loop control, typed returns and standard helpers.
- [Standalone HTML applications](standalone-html.md) — export one self-contained app file, without the IDE.
- **running-lang-files.md** — CLI commands, temporary browser runner, file opening, explicit saving, and PWA/platform support.

- **language-spec.md** — the current language contract: lexical rules, statements, expressions, scope, errors, and execution semantics.
- **syntax.md** — a practical syntax reference with valid examples.
- **types.md** — primitive types, enums, arrays, values, equality, and numeric behavior.
- **functions.md** — user functions, parameters, return behavior, scope, and built-in functions.
- **ui.md** — the distinction between export, input, button, Inspector state, and runtime state.
- **architecture.md** — how source becomes tokens, AST, runtime state, IDE controls, and output.
- **conventions.md** — style and naming conventions for humans and coding agents.
- **modules.md** — current multi-file project/import behavior and module conventions.

- **gdscript-inspiration.md** — annotations, typed data, resources, lifecycle/signals, graphics primitives, and compatibility decisions.

## Language identity

Language Lab is intentionally English-like executable pseudocode. It should be readable without becoming verbose for the sake of it.

The central conventions are:

- typed declarations always use a colon;
- ordinary statements end with a period;
- block headers use comma + do + period;
- blocks close explicitly with end;
- familiar arithmetic symbols and their English equivalents may coexist;
- the language should prefer clear words for control flow and comparisons;
- the IDE is a host for the language, not the definition of the language itself.

Example:

~~~text
integer: health = 100.
integer: damage = randomInteger(8, 15).

if health is greater than 0, do.
    health = health - damage.
    print("Health:", health).
end if.
~~~

## Supported versus planned

A syntax shown as supported in the reference files should work on main and should have implementation/test coverage.

Planned syntax must be labelled as planned. Multi-file projects, relative namespaced imports, public module functions, and Python-style range loops are implemented and documented as supported.

When in doubt, check:

1. src/language/lexer.ts
2. src/language/parser.ts
3. src/language/analysis.ts
4. src/language/runtime.ts
5. tests/runtime.test.ts and other language tests
