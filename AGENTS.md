# Instructions for coding agents working on Language Lab

Read this before creating/editing .lang source or changing the language implementation.

## Source of truth

Check, in order:

1. docs/language-spec.md
2. docs/syntax.md
3. src/language/lexer.ts
4. src/language/parser.ts
5. src/language/analysis.ts
6. src/language/runtime.ts
7. language/runtime/conformance tests

If the current feature branch intentionally changes syntax, its implementation/tests take precedence and the docs must be updated in the same work.

## Never invent .lang syntax

Do not assume a feature exists because Python, JavaScript, TypeScript, GDScript, or another language has it.

Use supported syntax or explicitly implement/propose the language change.

## Mandatory source conventions

Typed declarations use a colon:

~~~text
integer: health = 100.
function heal(integer: amount).
~~~

Statements use periods, not semicolons:

~~~text
health = health - 10.
print(health).
~~~

Block headers use comma + do + period:

~~~text
if alive, do.
    print("Alive.").
end if.
~~~

Explicit end markers are required.

Identifiers begin with a letter or underscore and contain letters, digits or underscores. Prefer camelCase.

## Current counting loops

Python-style range:

~~~text
for x in range(10), do.
    print(x).
end for.
~~~

range follows Python semantics: stop is exclusive and forms are range(stop), range(start, stop), range(start, stop, step).

The older typed form remains supported and is inclusive:

~~~text
for integer: x from 1 to 10, do.
    print(x).
end for.
~~~

Do not confuse the endpoint semantics.

## Current important features

Supported source includes:

- integer, text, boolean, array;
- enums;
- export -> Inspector;
- input -> running app input;
- button -> running app action;
- assignments and print;
- if / elif / else;
- while;
- for each;
- Python-style range loops;
- typed inclusive range loops;
- named functions with typed parameters;
- public module functions;
- relative namespaced imports;
- return; break/continue inside loops;
- # and /* */ comments, float, constants, typed collections/records, resources, signals/events;
- text/math helpers documented in docs/coding-improvements.md;
- arrays/indexing;
- English comparisons and boolean logic;
- word/symbol arithmetic;
- randomInteger(minimum, maximum).

## Preserve semantic distinctions

~~~text
export = Inspector/configuration exposure
input  = application/user input
public = module visibility
runtime variable = current-session state
~~~

Do not reinterpret export as module export.

## Architecture rules

Do not put language semantics in React components.

The intended boundaries are:

~~~text
workspace / VFS
parser + static analysis
immutable Program
RuntimeSession
worker protocol
serializable UI model
host renderer
build targets
~~~

Static analysis must not execute arbitrary user functions.

The web IDE is one host for the language.

## When adding syntax

Every language change should include:

- lexer/parser changes as needed;
- static-analysis rules;
- runtime semantics;
- useful diagnostics;
- valid examples;
- invalid/regression tests;
- docs;
- editor completion/highlighting where relevant.

Do not add syntax only to CodeMirror.

## When generating .lang programs

Before presenting or committing source:

1. scan for stray semicolons;
2. verify typed declarations have colons;
3. verify every block has its end marker;
4. verify comparisons use supported English forms;
5. prefer camelCase identifiers;
6. use # line comments or non-nesting /* */ block comments;
7. use correct range endpoint semantics;
8. keep export/input/public/internal state purposeful;
9. validate/build/test when tooling is available.

## Do not write these unless the branch implements them

- semicolons;
- braces as block syntax;
- symbolic comparisons such as ==, !=, <, <=, >, >=;
- classes/inheritance;
- async/await;
- try/catch;
- remote/package imports.

## Git workflow

Unless the user explicitly says otherwise:

- use a feature/docs branch;
- avoid unrelated changes;
- run appropriate checks;
- open/update a PR;
- do not merge it yourself.

## Scenes and application UI

Scenes are first-class and preserve RuntimeSession state:

~~~text
scene CharacterCreator.
    heading "Create Character".
    input text: name = "Lyra".
    button "Continue", do.
        go to Arena.
    end button.
end scene.
~~~

Scene-local presentation statements include `heading`, `paragraph`, `stat`, and `progress`. Scene inputs/buttons are only exposed while that scene is active. Use `on enter` and `on leave` for transition lifecycle logic. Persistent internal state belongs at module top level.
