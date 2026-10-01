# GDScript-inspired features

Language Lab borrows declaration hints, explicit typed data, resources, and signals from GDScript while retaining mandatory typed colons, period terminators, and explicit block endings. This is not a GDScript compatibility layer.

## Declaration annotations

```text
@group("Player")
@label("Movement speed")
@help("Distance travelled per second.")
@range(0, 10, 0.5)
input float: moveSpeed = 2.5.

@range(1, 10, 1)
export integer: difficulty = 3.
```

Annotations attach to the next `export` or `input` declaration. They have no trailing period. Arguments are numeric or quoted text literals; expressions and function calls are rejected. Annotation names are case-sensitive.

| Annotation | Meaning | Valid types |
|---|---|---|
| `@range(minimum, maximum, step)` | Numeric field plus slider; step is optional (integer: 1, float: 0.01) | integer, float |
| `@label("Label")` | Exact display label; default is prettified variable name | all |
| `@help("Description")` | Accessible help text | all |
| `@group("Group")` | Group related controls within their module | all |
| `@multiline` | Multiline text editor | text |
| `@placeholder("Hint")` | Empty text-field hint | text |
| `@file("*.png,*.jpg")` | Project-file picker; comma-separated globs | text, resource |
| `@color` | Hex colour field plus colour picker | text, color |

`color` and `resource` automatically get their appropriate picker. `@multiline`, `@file`, and `@color` cannot be combined. Duplicate and unknown annotations produce diagnostics. Range bounds must be finite and ordered; step must be positive (whole values for integer ranges).

Hints guide editing, not the language type system. `@range(1, 10)` does **not** clamp assignments, code defaults, or saved values. The numeric field displays the actual value even when outside the slider range. Use program logic when bounds are business rules. `@color` on text likewise does not change the variable into a color type.

`export` still configures the Inspector. `input` still configures application controls. `public` still controls module function visibility. There is no `export_range` special declaration syntax: use `@range` with either exposure keyword.

## Typed data

```text
constant integer: maximumHealth = 100.
float: speed = 2.5.
array<integer>: scores = [10, 20].
dictionary<text,integer>: counters = {"wins": 2}.
record Player [text: name, integer: health, array<text>: inventory].
Player: player = {"name": "Lyra", "health": 100, "inventory": ["key"]}.
player.health = 90.
player.inventory[0] = "potion".
counters["wins"] = counters["wins"] + 1.

function double(float: value) returns float.
    return value * 2.
end function.
```

`float` is a finite JavaScript double; whole numbers are valid float values. `integer` remains a finite whole number. Neither is arbitrary precision. Typed arrays and text-key dictionaries can nest. Bare `array`/`dictionary` allow heterogeneous language values. Dictionary literals require quoted, unique keys. Arrays require existing integer indices; dictionary assignment may introduce keys. Property reads only access own data, never host prototypes.

Records are structural, module-local data schemas with exactly their declared fields. Nested values are recursively validated. Records do not have constructors, methods, inheritance, optional fields, or public type exports yet. Use a dictionary literal or validated JSON resource to construct one.

Containers have **value semantics**: declaration, assignment, parameters, event arguments, host overrides, and snapshots copy data. Nested writes update and revalidate the entire root variable atomically. A constant cannot be reassigned or mutated through an index/member. Editing a copy does not mutate its original. Array equality is ordered; dictionary/record equality compares keys and values independent of insertion order.

Return annotations are optional; annotated functions validate all returned values, including an implicit empty return (which fails a nonempty return type). Obvious literal errors are diagnosed statically; dynamic values are checked at runtime.

## Dots and type brackets

- A numeric literal consumes `.` only when a digit follows it: `2.5`.
- Member-access dots must directly touch both sides: `player.health`, `maths.double(2)`, `items[0].name`.
- Other periods terminate statements. Write whitespace/newlines between statements.
- `<...>` is only collection type syntax; it does not introduce symbolic comparisons.
- Reserved words used as dictionary keys can be accessed with `data["color"]`.

Identifiers now also allow underscores. Existing camelCase remains the recommended style. Constructors such as `Vector2`, `Color`, and `Resource` are case-sensitive built-in names.

## Project resources

```text
@file("*.json")
export resource: playerData = Resource("assets/player.json").
Player: player = loadResource(playerData).
```

`Resource(path)` resolves a project file into a serializable reference containing its stable file ID and display path. Saved references resolve by ID, so selected assets can be renamed or moved without redirecting to another file. A deleted reference fails explicitly. Source path literals themselves are not rewritten; update a literal if its target moves. The default expression is still evaluated on Run before overrides, as for every declaration.

`loadResource` accepts a resource reference or a text path and loads a JSON value from the immutable Run snapshot. An unprefixed path is project-root-relative; `./` and `../` resolve relative to the executing module. Absolute paths, URLs, project escapes, missing files, binary/non-JSON files, invalid JSON, oversized values, and type mismatches fail. No network or host filesystem access is granted. Each load returns independent value data. Binary assets can be referenced/picked but are not rendered or decoded by this API.

`parseJSON(text)` and `toJSON(value)` provide bounded value conversion. Resource IDs are workspace identities, not portable identifiers for arbitrary external JSON. ZIP exports continue to contain source/assets only; imports receive fresh IDs and resolve source references afresh.

## Signals and lifecycle

```text
signal damaged(integer: amount).

on damaged(integer: amount), do.
    health = health - amount.
end on.

on start, do.
    print("Ready").
end on.

on update(float: deltaTime), do.
    position = position + velocity * deltaTime.
end on.

button "Hit", do.
    emit damaged(5).
end button.
```

Signals and handlers are top-level, module-local declarations. Multiple handlers run in declaration order. Typed parameters must match the signal signature. `emit` queues an event; handlers run after the current action finishes, in FIFO order. A handler emitting another signal adds it to the queue. Event arguments are copied at emission time.

Run initializes all reachable modules in dependency order, queues `start` once per module, then drains queued events. Consequently all module globals exist before startup handlers run. Signals emitted during initialization are queued ahead of startup events. Unreferenced files do not run. Buttons, functions, handlers, and input edits share the current RuntimeSession.

Host events are:

| Handler | Meaning |
|---|---|
| `on start, do.` | Once after module initialization per Run |
| `on update(float: deltaTime), do.` | Elapsed seconds since the preceding host update |
| `on keyDown(text: key), do.` | Key pressed while the program event surface has focus; repeats ignored |
| `on keyUp(text: key), do.` | Key released on that surface |
| `on pointerDown(float: x, float: y), do.` | Pointer/touch coordinates in CSS pixels relative to the surface |

Every handler ends with `end on.`. The IDE sends at most one awaited update at a time, targeting about 30 updates/second. Delta is capped at 0.25 seconds; background throttling does not trigger catch-up loops. This is an interactive lifecycle, not a deterministic physics clock. Updates pause during actions/input acknowledgement and after an execution error; Stop, source changes, and a new Run terminate the old worker/epoch. Each handler gets fresh locals over module globals. Keyboard events never globally intercept the editor. Pointer events use a labelled, focusable surface with touch-sized dimensions.

An action and all signals it triggers share operation/time limits and a 1,024-event budget, plus a four-million-character cap on the serialized payloads currently queued. Event loops cannot reset their own budget. Failed actions preserve completed writes, discard pending events, and report a diagnostic; a later explicit action can recover. Output/value limits, the worker watchdog, and hard Stop remain active.

## Graphics vocabulary

```text
vector2: direction = normalized(Vector2(3, 4)).
vector3: position = Vector3(1, 2, 3).
color: tint = Color(1, 0.5, 0).
print(length(direction), dot(direction, Vector2(1, 0))).
```

Vectors are finite, serializable tagged values with `x`, `y`, and optionally `z`. Matching vectors support addition/subtraction; scalar multiplication works on either side, and vector/scalar division rejects zero. `length`, `normalized` (zero stays zero), and `dot` are built-ins. Colour channels are in 0–1 and construct six/eight-digit hex strings; alpha is optional. These values can be translated by future rendering adapters without exposing a renderer's objects inside the interpreter.

Classes, inheritance, scene trees, Three.js/Godot renderer integration, physics, live editor scripts, a VM/compiler, and async syntax remain deferred. This change supplies the typed data/events foundation; it does not turn Language Lab into a game engine.

## Architecture and compatibility

- Parser/AST own annotations, typed data, member access, signal declarations, and handlers.
- Static analysis validates hints, schemas, symbols, handler signatures, and known types without executing user code.
- `types.ts`, `annotations.ts`, and `primitives.ts` isolate reusable validation/metadata/math from evaluation.
- Immutable Programs carry snapshot resources. RuntimeSession owns mutable values and the bounded event queue.
- Typed worker commands carry host events under the existing epoch/watchdog protocol. React only renders metadata and schedules host ticks.
- `FieldGroups`/`ValueControl` render hints consistently in Inspector and Output. Display labels do not become persistence keys.

No IndexedDB schema migration or source rewriting is needed. New override values use existing structured-clone storage. Existing files/projects and `randomInteger`, both range-loop forms, PWA configuration, and module rules remain intact. The intentional compatibility changes are new reserved keywords/built-ins, underscore identifiers, objects becoming valid language values (including in arrays), and explicit copy semantics for containers. Existing code using a newly reserved name must rename that identifier; parsing will report the location. Non-finite intermediate arithmetic results now fail explicitly instead of leaking Infinity/NaN into output; this fixes the finite-value contract.

See `examples/gdscript-inspired/` for a runnable project and separate lifecycle entry file.
