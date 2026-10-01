# Modules and multi-file projects

## Status

Multi-file projects and namespaced imports are implemented.

A project, rather than whichever editor tab is selected, is the unit of analysis and execution.

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

The project has a configured entry file, normally main.lang.

## Import syntax

main.lang:

~~~text
import "./lib/maths.lang" as maths.

print(maths.double(10)).
~~~

lib/maths.lang:

~~~text
public function double(integer: value).
    return value * 2.
end function.
~~~

Imports are:

- explicit;
- relative;
- required to use .lang paths;
- namespaced.

## Visibility

Keep these meanings separate:

~~~text
export -> Inspector exposure
input  -> application/user control
public -> module function visibility
~~~

export is not a module-export keyword.

Currently public exposes functions. Imported non-public functions cannot be called from another module.

## Module state

Every reachable module receives its own global runtime environment.

A module initializes once per RuntimeSession.

Public functions execute in their defining module's context, so they can read and mutate that module's persistent globals.

## Import resolution

Imports resolve through the project virtual filesystem.

The resolver:

- requires relative paths;
- rejects paths that escape the project;
- requires explicit .lang extensions;
- rejects unsafe paths;
- reports missing modules;
- rejects circular imports.

Remote URLs, wildcard imports, and a package registry are not supported.

## Reachability

Only modules reachable from the configured entry point belong to the running Program.

An unrelated .lang file does not execute merely because it exists in the project.

## Source identity

Parsed nodes carry file-aware source spans.

That supports:

- cross-file diagnostics;
- references/symbols;
- stack/error locations;
- future go-to-definition/refactors;
- future VS Code/LSP integration.

## Project snapshots

Analysis and Run operate on an immutable project snapshot.

~~~text
workspace editing state
      |
      v
ProjectSnapshot
      |
      v
module resolution + static analysis
      |
      v
immutable Program
      |
      v
RuntimeSession
~~~

This prevents execution from observing half-updated workspace state.

## Stable identities

Files/projects have stable IDs independent of their paths.

Rename/move operations should preserve identity and persisted settings where appropriate.

## Member-dot grammar

Namespace-qualified calls use member-like syntax:

~~~text
maths.double(number)
~~~

The parser distinguishes member dots from statement-ending periods using adjacency rules. Numeric literals also use a decimal point.

Do not casually change dot tokenization: statement terminators, member access, and future numeric-type work all depend on well-tested grammar.

## Portability

IndexedDB stores the editable workspace.

Portable project archives use normal project files plus metadata, and import/export validates paths and size limits transactionally.

Ordinary project exports should not silently include unrelated private editor preferences or transient runtime state.
