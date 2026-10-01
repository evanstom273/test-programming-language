# Projects and runtime architecture (Phases 1–2)

This change retains the AST interpreter and existing IDE layout. It does not add
Phase 3 panels, tabs, a command palette, semantic completions, formatting, a VM,
a debugger, an async language, or a compiler backend.

## Boundaries

- `workspace/model.ts`, `vfs.ts`: versioned projects, stable file IDs, canonical
  paths and isolated project snapshots. A Run includes the current editor drafts.
- `language/lexer.ts`, `parser.ts`, `diagnostics.ts`: file-aware UTF-16 source
  offsets and exclusive end positions, plus line/column positions. Statements,
  expressions and parameters carry complete spans. Diagnostics include a stable
  code, category, severity and span.
- `language/analysis.ts`: reachable module resolution, cycle detection, lexical
  scopes, declaration/parameter symbols and bound read/call references. Validates
  names, known declaration types, duplicate definitions and call arities.
  Function return inference and a full type checker are future work; runtime
  validation remains authoritative for dynamic values.
- `Program`: recursively frozen module definitions, dependency order, imports,
  symbols/references, ASTs and Inspector metadata. It contains no mutable globals.
  It can be reused by independent RuntimeSessions.
- `RuntimeSession`: module instances, mutable globals, call depth, budgets,
  input/button state and shared console output. The old ProgramSession(source)
  API remains as a compatibility facade for tests and single-source callers.
- `runtime/protocol.ts`, `worker.ts`, `client.ts`: typed commands/results, request
  IDs, epochs, watchdog, worker failure handling and hard termination. Analysis
  uses its own disposable worker; it cannot replace a running session.
- React hooks own document selection, persistence and lifecycle. Components render
  serializable metadata and send actions; they do not evaluate language code.

## Static Inspector

Analysis never invokes a user function, runs a loop, samples randomInteger, or
imports the runtime evaluator. Literal values, enum variants, simple unary
expressions and literal arrays can supply static defaults. Other initializers
are marked **Computed on Run**. The placeholder control value is explicitly
labelled as an override editor, not the evaluated default. Calls are evaluated
only when the program runs. Inspector entries identify their owning module.

The Inspector includes exports from reachable modules only. An unrelated file,
even one with syntax errors or top-level side effects, does not execute or block
Run. Syntax diagnostics for unrelated files are not provided in this phase.

## Modules and grammar

```text
import "./lib/maths.lang" as maths.
input integer: number = 10.
button "Double", do.
    print(maths.double(number)).
end button.
```

```text
export integer: factor = 2.
public function double(integer: value).
    return value * factor.
end function.
```

- `export` remains Inspector configuration; `input` remains application input.
- `public function` exposes a function through an imported namespace. It does not
  expose module variables or types. Bare exports do not grant module visibility.
- Imports/public functions are top-level. Imports require explicit `./` or `../`
  relative paths and `.lang` extensions. Escapes, remote paths and cycles fail with
  module diagnostics. No wildcard imports, package registry or remote loading.
- Resolution is case-sensitive; workspace paths cannot collide case-insensitively
  so projects remain portable to common desktop filesystems.
- Modules initialize once, dependencies before dependants, following import
  declaration order. Their functions use their own module globals. All modules
  share session resource budgets and printed output.
- Inputs/buttons in reachable modules also work. Their UI and runtime identities
  are qualified by stable file ID; input labels remain prettified variable names.
- Typed declarations and parameters still require colons.
- A member dot must be adjacent to the identifiers on both sides: `maths.double`.
  `maths . double` is invalid. A dot not forming such a member remains the existing
  statement terminator. A terminator followed by an identifier should have a
  space or newline: `value = other. next = 1.`
- The lexer already accepted fractional numeric literals before this change.
  That behavior is retained: a dot followed by a digit while scanning a number
  belongs to the literal. No `decimal` type or new numeric syntax is introduced.
- `randomInteger(minimum, maximum)` from main remains a built-in, with inclusive
  bounds, integer checks, reserved-name protection and its existing completion.

## Run, Stop and state

Run captures a consistent project snapshot, compiles it and initializes a fresh
worker-owned session. Declaration defaults are evaluated in module/source order,
then the matching Inspector or input override is applied. Later declarations see
earlier effective values. Defaults involving user functions are not cached by
analysis. Existing runtime validation of saved overrides remains in place.

Buttons run ordinary statement blocks in fresh local scopes sharing current
module globals. Completed mutations and prints survive a handler error. Inputs
use the same runtime type validation; accepted edits are persisted separately
from source. Button-driven mutations are session-only.

Switching editor files within one project does not reset the session. A source,
path, entry-point or Inspector change marks it stale and disables old controls.
Currently this is conservative: a change to an unrelated file also marks it
stale. Switching projects discards the old live session. Run restores defaults
and saved overrides. Stop does not save runtime globals; Run starts afresh.

Worker commands are processed serially. Request IDs and epochs reject late
messages, and stale React continuations cannot update a replacement session.
Input controls provide immediate visual feedback; the worker validates changes.
A worker error reverts the optimistic control value to its authoritative snapshot.

### Resource limits

- 100,000 operations per initialization or button action, shared across modules.
- Two-second execution deadline and 128 nested function calls.
- Five-second worker watchdog, including compilation; 64 queued requests maximum.
- 1,000 console lines plus a truncation notice, 256,000 retained characters and
  8,192 characters per line. Clear resets the logging budget without resetting
  globals.
- Bounded value depth (64), array length (10,000), string length (65,536), visited
  value nodes (20,000) and aggregate value size estimate (1 MB).

The engine checks cancellation at operation boundaries. Because synchronous JS
cannot receive a stop message while executing, browser Stop terminates the
worker immediately. The next Run creates a new worker. The watchdog does the
same for code or parsing that cannot cooperate. Workers are a responsiveness
boundary, not a sandbox for future arbitrary JavaScript providers.

## Workspace and migration

Dexie schema v2 adds projects, stable project/file membership, unique project/path
indexes, raw legacy backups, and separate reserved stores for application save
data and editor preferences. No application save-data language API is added.

The v1 upgrade runs atomically. Each legacy file becomes an independent project
whose entry is that file, preserving the previous independent-run behavior. It
keeps the file ID, exact source bytes/string, display name, timestamps, Inspector
and input overrides. A raw pre-migration copy is kept in `legacyBackup`. Unsafe
legacy filenames receive a safe execution path without changing their display
name, ID or source. Nothing is executed during migration.

The old automatic regex colon conversion is removed: source is never silently
rewritten on startup. Missing-colon source now receives a diagnostic instead of
being modified. Example projects are seeded only once on a fresh workspace;
deleted examples are not resurrected. Existing workspaces do not get unsolicited
new sample files.

Inspector and input values remain distinct per-file properties keyed by stable
file ID and variable name. Renaming/moving a file or project keeps them. Renaming
a variable does not migrate its override automatically. Runtime globals are not
persisted as overrides. Personal configuration is excluded from portable ZIPs.

Source writes use independent per-document queues, not one shared debounce timer.
Run/export include current in-memory drafts. Save failures remain visible and a
pending/failed save warns before closing the page. This is not a full revision
history, crash-recovery journal or collaborative editing system.

## Project operations and archives

The existing Explorer now has project selection, creation/rename/duplicate/delete,
an entry selector, file/folder creation, rename/move/duplicate/delete, file import
and download, and project ZIP import/export. Project actions are serialized against
pending source saves. The entry file cannot be deleted until another is chosen.
Moving an entry file/folder updates project metadata atomically.

**Imports are not rewritten on move.** Their source paths remain explicit and
broken imports receive diagnostics. Automatic import refactoring belongs with
later semantic editor tooling. Folder moves preserve all descendant identities.

`langlab.json` is managed metadata, serialized at the archive root. It contains
`schemaVersion: 1`, `name`, `entry`, and optional file kind/encoding records. Source
and binary assets live at their canonical relative paths. Empty folders survive
export/import. Projects imported from ZIP receive fresh IDs and never overwrite
an existing project. Duplicating a local project also uses fresh IDs but preserves
its local configuration; portable ZIPs intentionally omit personal overrides.

Limits: 200 file/folder records, 1 MB per file, 10 MB expanded project data,
240-character paths, and 10.2 MB archive input. Imports reject traversal, absolute
paths, backslashes, control characters, drive prefixes, duplicate/case-colliding
paths, file/directory conflicts, corrupt checksums, inconsistent ZIP headers,
symlinks, encryption, ZIP64 and multi-disk archives. Inflation is incremental and
checks actual expanded lengths; declared lengths alone are not trusted.

The entire archive and manifest are validated before database writes. Insertion
uses a Dexie transaction with `add`, not overwrite operations; any failure rolls
back the new project and all its files. Raw source imports also refuse collisions.

To try the module example, ZIP the **contents** of `examples/modules/` so that
`langlab.json` is at the archive root, then use Import ZIP.

## Intentional compatibility changes and limits

- Unknown symbols, duplicate declarations, obvious declaration type mismatches,
  unknown types and invalid calls can fail during static compilation even if the
  affected branch would not execute. Runtime checks still cover dynamic values.
- Nested functions/enums previously parsed but were never properly registered at
  runtime. They now produce explicit top-level-only diagnostics.
- `import`, `as`, and `public` are now reserved keywords.
- New resource caps stop programs that would previously monopolize memory/output.
- Function-call Inspector defaults are deferred until Run, never executed while
  editing. The scope of static constant evaluation is intentionally conservative.
- No public variables/types, import cycles, automatic import-path rewriting,
  arbitrary package loading, or full return-type inference in this initial module
  system. No Phase 3+ features were started.

## Verification

`npm test` covers conformance, static analysis, spans, modules, runtime budgets,
worker lifecycle/epochs, migrations, snapshots, identity-preserving operations,
archive safety and atomic rollback. `npm run test:e2e` covers real browser workers,
existing interactive behavior, desktop/mobile projects, module overrides, entry
selection, persistence, Stop/restart and downloads. `npm run test:pwa` checks the
production GitHub Pages build and offline restart. `npm run build` includes the
full TypeScript check and strict PNG validation. CI runs all of these checks.
