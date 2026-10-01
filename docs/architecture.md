# Language Lab architecture

## The language is not the webpage

Language Lab ships with a browser IDE, but the language is separate from React and CodeMirror.

Current high-level flow:

~~~text
ProjectSnapshot
      |
      v
lexer + parser
      |
      v
AST with file-aware source spans
      |
      v
static analysis / module binding
      |
      v
immutable Program
      |
      v
RuntimeSession in a Web Worker
      |
      +--> output
      +--> input values
      +--> button events
      |
      v
React host renders serializable state
~~~

The browser IDE is one host for the language, not the definition of the language.

## Lexer

src/language/lexer.ts

Responsibilities:

- tokenize source;
- identify keywords, identifiers, strings, numbers, and punctuation;
- attach source spans/file identity;
- reject unsupported symbols.

It does not execute code or render UI.

## Parser

src/language/parser.ts

Responsibilities:

- enforce grammar;
- build AST nodes;
- parse explicit block boundaries;
- implement expression precedence;
- parse module syntax;
- preserve source spans for diagnostics/tooling.

## AST

src/language/ast.ts

The AST models declarations, enums, imports, functions, buttons, control flow, arrays, calls, assignments, and expressions.

Both counting-loop forms have distinct semantics:

~~~text
for integer: x from 1 to 10, do.   # inclusive end
for x in range(1, 10), do.         # exclusive stop
~~~

(The # text above is explanatory documentation, not .lang comment syntax.)

## Static analysis

src/language/analysis.ts

Static analysis:

- resolves reachable project modules;
- rejects import cycles;
- builds symbols and references;
- validates bindings/types where known;
- discovers Inspector metadata without running user functions;
- produces an immutable Program.

This boundary matters: editing source or opening the Inspector must not execute arbitrary program logic.

## Program and RuntimeSession

Program is validated program structure.

RuntimeSession is one mutable execution:

- module globals;
- function calls;
- input values;
- button/event actions;
- output;
- resource accounting.

A fresh Run creates a fresh RuntimeSession.

Buttons keep working against that session's persistent state until source/settings make it stale or the session is stopped/restarted.

## Worker boundary

src/runtime/client.ts, protocol.ts, worker.ts

The IDE executes programs inside a Web Worker.

The client attaches epochs/request IDs so stale responses from an old run cannot update a new one.

Stop/timeout may terminate the worker entirely. This matters because a worker stuck in synchronous code cannot process a polite cancellation message.

A worker improves responsiveness. It should not be treated as a universal security boundary for arbitrary future JavaScript execution.

## Modules

A project is the execution unit.

~~~text
main.lang
lib/maths.lang
~~~

Imports resolve through the project virtual filesystem.

~~~text
import "./lib/maths.lang" as maths.
~~~

Each reachable module gets its own RuntimeContext/global environment. Imported modules initialize once per session.

public functions are callable through namespace-qualified names.

## Workspace / VFS

src/workspace/*

Workspace state stores projects/files with stable IDs and canonical relative paths.

The virtual filesystem:

- validates project structure;
- limits project/file sizes;
- resolves relative .lang imports;
- prevents imports escaping the project;
- supports immutable project snapshots for analysis/run.

IndexedDB is workspace persistence, not the language itself.

## UI model

program.ts exposes serializable field/button/output metadata.

React should render that model and dispatch actions. It should not interpret source syntax or execute AST nodes.

That distinction lets the standalone HTML host reuse the same language core and leaves room for future VS Code, native wrapper and game hosts.

## Runtime resources

The interpreter enforces bounded execution, including operation/time/call-depth/output/value limits.

These limits exist to protect the IDE from accidental runaway programs and pathological values.

## Build direction

The intended build path is:

~~~text
ProjectSnapshot
    -> analyze/validate
    -> Program
    -> pinned runtime/player
    -> target packaging
~~~

Standalone builds should reuse the same semantics rather than reimplementing the language inside each host.

## Design rule

If a React component needs to know how a Language Lab statement executes, that logic is probably in the wrong layer.

Language behavior belongs in language/runtime services.
Workspace behavior belongs in workspace services.
Rendering belongs in the host.

## Typed data and events extension

See [GDScript-inspired features](gdscript-inspiration.md) for supported annotations, float/collection/record/resource controls, lifecycle events, signals, and worker scheduling. These extend the existing export/input/button model.

## Source runner hosts

`runner/sourceFile.ts` validates a device file and creates a one-file project snapshot. `runtime/host.ts` owns the transport-independent command handler shared by the browser worker and Node CLI worker. `runner/capabilities.ts` detects interactive requirements from a validated Program without executing it.

`Shell.tsx` lazily selects the IDE or runner, and receives dropped/OS-launched files. `runner/Runner.tsx` reuses the session and static-analysis hooks and presentation controls. Workspace storage is imported only when Save is chosen. `cli/main.ts` owns bounded file reading, a worker watchdog, diagnostics and terminal output; `cli/serve.ts` supplies the browser host and one chosen source on loopback. See [Running .lang files](running-lang-files.md) for the execution, persistence and platform contracts.

## Standalone HTML target

The standalone target packages a project snapshot with an application-only production host, inline worker and CSS. It shares `useProgramSession`, `RuntimeClient`, `RuntimeHost` and `ProgramOutput` with the existing hosts. The host dependency graph excludes the IDE and Dexie; the generated file requires no runtime downloads. Inspector overrides are author configuration, while saved app input overrides and mutable runtime state are excluded. See [standalone HTML](standalone-html.md).
