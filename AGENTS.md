# Instructions for coding agents working on Language Lab

Read this file before creating or editing .lang source or changing the language implementation.

## Source-of-truth order

For current behavior, inspect:

1. docs/language-spec.md
2. docs/syntax.md
3. src/language/lexer.ts
4. src/language/parser.ts
5. src/language/runtime.ts
6. language/runtime/conformance tests

If a feature branch intentionally changes the language, its implementation/tests take precedence and the docs must be updated with it.

## Never invent .lang syntax

Language Lab is evolving. Do not assume a feature exists because Python, JavaScript, GDScript, or another language has it.

If syntax is not implemented, either use supported syntax or explicitly propose the language change.

## Mandatory source conventions

Typed declarations require a colon:

~~~text
integer: health = 100.
text: name = "Lyra".
function heal(integer: amount).
~~~

Statements end with periods, not semicolons:

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

Use explicit end markers:

~~~text
end if.
end while.
end for.
end function.
end button.
~~~

Identifiers currently begin with a letter and contain letters/digits only. Prefer camelCase.

## Do not write these unless the branch implements them

- semicolons;
- braces as block syntax;
- underscore identifiers;
- symbolic comparisons such as ==, !=, <, <=, >, >=;
- comments;
- imports/modules/public on a branch where modules have not landed;
- object/member syntax;
- classes/records;
- async/await;
- try/catch;
- break/continue;
- float/decimal/number declarations.

## Current important features

Supported source includes:

- integer, text, boolean, array;
- enums;
- export -> Inspector;
- input -> running app input;
- button -> running app action;
- assignments;
- print;
- if / elif / else;
- while;
- for each;
- typed inclusive range loops;
- named functions with typed parameters;
- return;
- arrays/indexing;
- English comparisons and boolean logic;
- word/symbol arithmetic;
- randomInteger(minimum, maximum).

## Preserve semantic distinctions

Never overload these without an explicit design decision:

~~~text
export = Inspector/configuration exposure
input  = application/user input
runtime variable = current-session state
~~~

The planned module system uses a separate visibility concept such as public. Do not reinterpret export as module export.

## Architecture rules

Do not put language semantics in React components.

The intended boundaries are:

~~~text
workspace
language services
Program
RuntimeSession
UI model
host renderer
build targets
~~~

The web IDE is a host for the language.

Static analysis/Inspector discovery should not execute arbitrary user functions.

Program/code structure should be separable from mutable RuntimeSession state.

## When adding language syntax

Every language change should include:

- lexer/parser work as required;
- runtime or analysis semantics;
- useful diagnostics;
- valid examples;
- invalid examples/tests;
- regression/conformance coverage;
- updates to relevant docs.

Do not add syntax only to highlighting/autocomplete.

## When generating .lang programs

Before presenting or committing a program:

1. scan for stray semicolons;
2. verify every typed declaration has a colon;
3. verify each block has the matching end marker;
4. verify comparisons use supported English forms;
5. verify identifiers contain no underscores;
6. avoid unsupported comments;
7. keep export, input, and internal variables purposeful;
8. run validation/tests when tooling is available.

## Git workflow

Unless the user explicitly says otherwise:

- work on a feature/docs branch;
- avoid unrelated changes;
- run appropriate checks;
- open a PR;
- do not merge the PR yourself.
