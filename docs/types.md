# Types and values

## Current declared types

Language Lab supports primitives, enums, typed collections, and structural records. See [GDScript-inspired features](gdscript-inspiration.md) for the full typed-data contract.

| Type | Example | Runtime value |
|---|---|---|
| integer | integer: health = 100. | finite whole number |
| float | float: speed = 2.5. | finite double |
| dictionary | dictionary: stats = {"hp": 100}. | text-keyed value map |
| vector2 / vector3 | vector2: p = Vector2(1, 2). | tagged finite vector |
| color | color: tint = Color(1, 0, 0). | hex colour text |
| resource | resource: data = Resource("data.json"). | stable project file reference |
| text | text: name = "Lyra". | string |
| boolean | boolean: alive = true. | true/false |
| array | array: items = [1, "two"]. | array of language values |
| enum | Difficulty: mode = normal. | one named enum value |

## integer

An integer value must be a JavaScript number whose value is an integer.

~~~text
integer: lives = 3.
integer: change = -2.
~~~

This is invalid:

~~~text
integer: speed = 2.5.
~~~

Arithmetic can produce a non-integer runtime number:

~~~text
print(5 / 2).
~~~

That can be printed, returned, or stored in a `float` declaration. There is no `number` or `decimal` declaration alias.

Integer inputs and Inspector fields only accept whole-number values.

## text

~~~text
text: name = "Lyra".
text: message = "Hello\nworld".
~~~

Text uses double-quoted, single-line literals.

Plus concatenates when either side is text:

~~~text
text: status = "HP: " + health.
~~~

The other arithmetic operations require numeric operands.

## boolean

~~~text
boolean: alive = true.
boolean: gameOver = false.
~~~

Conditions require boolean values.

~~~text
if alive, do.
    print("Still going.").
end if.
~~~

There is no implicit truthiness for text, numbers, arrays, or enum values.

## array

~~~text
array: inventory = ["sword", "potion"].
array: mixed = [1, "two", true, [3]].
~~~

Bare arrays are heterogeneous. `array<integer>` (and other nested element types) recursively validates every element.

Indexing is zero-based:

~~~text
print(inventory[0]).
~~~

Indexes must be integers and inside the array bounds.

Array equality currently compares the recursively serialized values. This means arrays with the same represented contents compare as equal even though they are separate runtime arrays.

~~~text
if [1, 2] is [1, 2], do.
    print("Equal.").
end if.
~~~

Indexed assignment is supported: `inventory[0] = "key".`. It copies and validates the root value before committing; constants cannot be mutated.

## Enums

~~~text
enum Difficulty [easy, normal, hard].

Difficulty: difficulty = normal.
~~~

Enums are named types. A variable declared as Difficulty may only contain one of that enum's declared values.

~~~text
difficulty = hard.
~~~

This is invalid:

~~~text
difficulty = impossible.
~~~

Enum type lookup is currently by exact enum name. Enum values are exposed as bare identifiers, so prefer unique, descriptive values until qualified enum access is introduced.

## null / nothing

The runtime internally has a null-like value. For example, a function that reaches its end without returning a value yields an empty result internally.

There is no source literal named null or nothing yet, and null is not a supported exported/input value.

Do not write:

~~~text
text: name = nothing.
~~~

## Value validation

Runtime language values are limited to:

- finite numbers;
- strings;
- booleans;
- arrays containing valid language values;
- dictionaries/records containing valid language values;
- the internal null value.

Plain own-data dictionaries are language values. Host class instances, cyclic objects, NaN, and Infinity are rejected.

## Type checking

Declarations are checked when initialized.

~~~text
integer: health = 100.
~~~

Assignments are checked against the existing variable's declared type.

~~~text
health = 80.
~~~

This fails:

~~~text
health = "full".
~~~

Function parameters are checked at call time.

~~~text
function heal(integer: amount).
    print(amount).
end function.

heal(10).
~~~

Calling heal("ten") is a type error.

## Inference inside for each

The runtime infers the temporary loop variable's value kind while iterating an array.

~~~text
for each item in ["one", "two"], do.
    print(item).
end for.
~~~

This inference is an implementation detail of loop execution, not a general source-level type inference feature. Ordinary declarations remain explicitly typed.

## Copying and persistence

Input and Inspector values are validated before entering runtime state.

Arrays passed from the host are cloned so caller-owned arrays cannot mutate the running language state behind the interpreter's back.

Session snapshots are cloned before being exposed to UI code.

Containers use value semantics across assignments, calls, and events; modifying a copy never mutates its original. Dictionary equality ignores key insertion order. See the linked typed-data contract for records, constants, and nested collections.
