# Modules and multi-file projects

## Current status

On the main branch at the time this document was written, .lang files execute independently and there is no supported import/module syntax yet.

Modules are part of the active project/runtime roadmap. This file records the intended constraints so documentation and implementation do not accidentally overload existing language concepts.

Do not assume the example syntax below works until the module implementation lands.

## Core design rule

A project, not an arbitrary collection of files, should become the unit of execution.

Illustrative project:

~~~text
calculator/
    langlab.json
    main.lang
    lib/
        maths.lang
    assets/
        icon.png
~~~

main.lang is the entry point unless project metadata explicitly chooses another entry file.

## Planned import direction

The current design direction is explicit relative, namespaced imports:

~~~text
import "./lib/maths.lang" as maths.
~~~

and explicit module visibility:

~~~text
public function double(integer: value).
    return value * 2.
end function.
~~~

then:

~~~text
print(maths.double(number)).
~~~

This syntax is a design target, not current-main syntax.

## Keep three meanings separate

This distinction is non-negotiable unless the language design is explicitly revised:

~~~text
export -> Inspector exposure
input  -> application/user control
public -> module visibility
~~~

Do not repurpose export to mean "export this symbol from the module". Export already has established runtime/IDE semantics.

## Initial module constraints

The first module system should stay deliberately small:

- explicit relative paths;
- explicit file extensions;
- namespaced imports;
- module-local globals;
- each reachable module initializes once per RuntimeSession;
- deterministic initialization order;
- useful diagnostics for missing imports;
- reject import cycles initially;
- no remote imports;
- no wildcard imports;
- no package registry;
- no implicit globals.

Unreferenced files must not execute merely because they happen to exist in the same project.

## Source identity

Multi-file diagnostics need more than line and column.

Every parsed location should eventually identify:

- project/document identity;
- file path or source ID;
- start line/column;
- end line/column or absolute span.

This enables:

- cross-file errors;
- go to definition;
- stack traces;
- safe refactors;
- future VS Code/LSP support.

## Project snapshots

Run/build should operate on an immutable snapshot of the project.

Conceptually:

~~~text
workspace editing state
      |
      v
ProjectSnapshot
      |
      v
resolve imports
      |
      v
validated Program/module graph
      |
      v
RuntimeSession
~~~

A running session should not discover half-saved source from another editor tab midway through an event.

## Stable identities

Files/projects need stable IDs independent of path.

Renaming:

~~~text
lib/maths.lang
~~~

to:

~~~text
lib/math.lang
~~~

must not accidentally destroy unrelated persisted settings merely because a pathname changed.

## Dot grammar issue

The module design wants member-like access:

~~~text
maths.double(number)
~~~

but a period already terminates statements and numeric literals may contain a decimal point.

The grammar must explicitly distinguish:

- statement-ending period;
- future member-access period;
- decimal point.

Do not bolt member access into the tokenizer/parser without resolving that interaction and adding conformance tests.

## Project portability

IndexedDB is the IDE's working store, not the portable project format.

A future project archive should contain ordinary source/assets plus versioned metadata such as:

~~~text
langlab.json
main.lang
lib/
assets/
~~~

A normal project export should not silently include private editor preferences or personal input overrides.

Workspace backup is a separate concept and may include IDE-specific state when the user explicitly chooses it.
