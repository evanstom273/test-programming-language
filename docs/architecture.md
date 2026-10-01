# Current architecture and execution model

## The language is not the webpage

Language Lab currently ships as a browser IDE, but the programming language and its execution model are conceptually separate from the React interface.

The main flow on current main is:

~~~text
.lang source
    |
    v
lexer / tokenizer
    |
    v
parser
    |
    v
AST
    |
    v
ProgramSession / interpreter
    |
    +--> output
    +--> input metadata/current values
    +--> button metadata/events
    |
    v
React host renders the session
~~~

The browser page is one host for the language. The roadmap deliberately moves toward making the core reusable by standalone builds, a CLI, VS Code, and other hosts.

## Lexer

File:

~~~text
src/language/lexer.ts
~~~

Responsibilities:

- scan source characters;
- recognize strings, numbers, identifiers, keywords, and punctuation;
- record line/column locations;
- reject unsupported symbols;
- produce an EOF token;
- provide LanguageError for user-facing language failures.

The lexer should not execute code or know about React.

## Parser

File:

~~~text
src/language/parser.ts
~~~

Responsibilities:

- consume lexer tokens;
- enforce syntax such as mandatory colons and periods;
- construct statement/expression AST nodes;
- implement operator precedence;
- parse block boundaries;
- report source-located syntax errors.

The parser produces language structure, not UI.

## AST

File:

~~~text
src/language/ast.ts
~~~

The AST represents expressions and statements including:

- declarations;
- enums;
- assignments;
- print;
- buttons;
- if/elif/else;
- while;
- for each;
- range loops;
- functions;
- return;
- calls;
- arrays/indexing;
- unary/binary expressions.

The existing AST stores line/column positions. The roadmap expands these into complete source spans with file identity for multi-file diagnostics and tooling.

## Program metadata

File:

~~~text
src/language/program.ts
~~~

This file contains serializable metadata used by the host UI, such as:

- input field definitions;
- button IDs/labels;
- input values;
- output snapshots;
- export/input overrides.

React components should consume metadata rather than interpreting source code themselves.

## Runtime / ProgramSession

File:

~~~text
src/language/runtime.ts
~~~

ProgramSession currently owns the live interpreter state.

It tracks:

- global variables;
- enums;
- functions;
- input definitions;
- buttons;
- output;
- operation budget.

A new ProgramSession means a new run.

Button presses share persistent globals while using fresh action-local scopes.

## Environments and scope

Runtime variables live in chained environments.

Conceptually:

~~~text
global environment
    ^
    |
function environment

global environment
    ^
    |
button local environment
    ^
    |
nested block environment
~~~

A read walks outward through parent environments.

An assignment updates the nearest existing binding.

A declaration creates a binding only in the current environment.

## Interpreter execution

The interpreter walks AST statements and evaluates AST expressions directly.

This is an AST interpreter, not a compiler or bytecode VM.

That is appropriate for the current stage because:

- semantics are still evolving;
- it is straightforward to inspect and test;
- interactive state is easy to model;
- a second execution backend would create semantic-parity work too early.

The roadmap keeps the interpreter as the reference implementation even if a JavaScript backend is introduced later.

## Operation limits

Each initialization/action has an execution budget.

Current limit:

~~~text
100000 operations
~~~

The budget catches many accidental infinite loops.

It is not a complete isolation mechanism because current execution is synchronous. The architectural roadmap moves RuntimeSession execution into a Web Worker with cancellation and hard worker termination.

## Inspector analysis caveat

Current main still contains inspectSource, which evaluates declaration initializers to build Inspector metadata.

That means an export initializer can currently cause expression/function evaluation during Inspector analysis.

The roadmap explicitly replaces that behavior with static analysis. Tooling/inspection must not execute arbitrary user program logic merely because source is being edited.

## Intended target boundaries

The long-term target separates five responsibilities:

~~~text
Workspace
Language services
Runtime
Application renderer
Build system
~~~

A useful mental model is:

~~~text
Project snapshot
      |
      v
language services
      |
      v
immutable Program
      |
      v
mutable RuntimeSession
      |
      v
serializable UI/output/events
      |
      v
host renderer
~~~

The important rules are:

- Program describes validated code; it should not own mutable run state.
- RuntimeSession owns a particular execution's mutable state.
- React should not know how statements execute.
- Language analysis should not depend on the browser UI.
- A standalone player should not need the IDE's Dexie database.
- Host-specific capabilities such as storage/network/graphics should be brokered explicitly rather than exposed as arbitrary JavaScript objects.

## Storage

The IDE currently uses Dexie/IndexedDB for local files and UI overrides.

IndexedDB is workspace persistence, not the definition of a .lang program.

The project roadmap introduces a portable project format so projects can exist outside the browser database.

## Build direction

Future builds should use the same program/runtime semantics as the IDE.

~~~text
project snapshot
    -> resolve + validate
    -> Program
    -> pinned player/runtime
    -> target packaging
~~~

Initial targets include source/project archives, standalone HTML/web apps, and PWAs. Native wrappers come later.

## Design principle

If a feature can only work because a React component knows secret details about the parser or interpreter, the boundary is probably wrong.

Language behavior belongs in language/runtime code. Rendering belongs in hosts. Persistence belongs in workspace/storage code.
