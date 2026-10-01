# General coding improvements

These features keep mandatory typed colons, period terminators, explicit block endings and the distinction between `export`, `input` and `public`.

## Comments

GDScript-style line comments use `#`. C-style block comments use `/* ... */` and do not nest. Comment markers inside strings are ordinary text. Unterminated block comments report the opening source location. `/` remains division; `//` is not a comment delimiter.

```text
# Comments do not require a period.
integer: health = 100. # Player state
/* Explanation spanning
   multiple lines. */
print(health / 2).
```

## Loop control

`break.` exits the innermost loop. `continue.` skips to that loop's next iteration (including range advancement). Both work in while, for each, Python-style range and typed inclusive range loops. They can appear in nested conditionals, functions or event/button handlers **only inside a loop in that function/handler**. They never jump into a caller's loop. Resource/step limits still apply, including loops that only continue.

```text
for i in range(10), do.
    if i is 2, do.
        continue.
    end if.
    if i is 5, do.
        break.
    end if.
    print(i).
end for.
```

## Typed returns

Functions with `returns SomeType` must return on every statically evident path. An `if` proves this only if every branch and an explicit `else` return. Loops conservatively do not prove return coverage: put a fallback return after a search loop. Return-type checks now propagate through all loop forms and check known primitive variable types. Runtime checks remain for dynamic values. `return` outside a function is now reported during analysis, before an event/button executes.

```text
function firstPositive(array<integer>: values) returns integer.
    for each value in values, do.
        if value is greater than 0, do.
            return value.
        end if.
    end for.
    return 0.
end function.
```

This does not add optional values, exceptions or full type inference. An explicit result/optional-value design remains preferable to extending sentinel conventions into future APIs.

## Math and text library

All functions validate argument count and runtime types; known incompatible primitive arguments are rejected statically. Results remain subject to existing language value/resource limits. Functions below do not mutate their arguments.

| Function | Contract |
|---|---|
| `abs(number)` | Absolute value; numeric return type `float` |
| `floor(number)`, `ceil(number)` | Round toward negative/positive infinity; return `integer` |
| `round(number)` | Nearest integer; halfway ties toward positive infinity |
| `min(a, b)`, `max(a, b)` | Smaller/larger of exactly two finite numbers; return `float` |
| `clamp(value, minimum, maximum)` | Inclusive clamp; rejects reversed bounds; returns `float` |
| `lerp(start, end, weight)` | `start + (end - start) * weight`; weight is not clamped; returns `float` |
| `trim(text)` | Remove leading/trailing whitespace |
| `lower(text)`, `upper(text)` | Unicode case conversion using the host's standard ECMAScript Unicode rules; not locale-specific |
| `contains(text, search)` | Case-sensitive literal substring search; returns boolean |
| `split(text, separator)` | Literal split into `array<text>`; empty separator splits Unicode code points |
| `join(parts, separator)` | Join `array<text>` with text separator |
| `size(value)` | Count array elements, dictionary entries or text Unicode code points; returns integer |

`size` counts code points, not visual grapheme clusters. `length(vector)` retains its existing vector-magnitude meaning. `randomInteger(minimum, maximum)` and both existing loop endpoint conventions are unchanged.

```text
text: name = trim("  Lyra  ").
array<text>: tags = split("fighter,elf", ",").
float: health = clamp(125, 0, 100).
print(upper(name), join(tags, " / "), size(tags), health).
```

## Compatibility

- `break` and `continue` are newly reserved keywords.
- The fifteen new built-in names above are now reserved function names, like existing `randomInteger` and `Vector2`; rename a user function that previously used one of these names.
- Typed functions with missing return paths now fail analysis instead of failing only when the missing-return path is executed. Return statements outside functions also fail earlier.
- Existing valid type syntax, imports, exports/inputs, annotations, runtime state, standalone apps and browser persistence remain unchanged.

Scenes/navigation, async scheduling, optional/result types, public shared-state APIs, application saves, a debugger and graphics are separate next stages. This release establishes desktop tooling and common coding primitives without starting those larger semantic changes.
