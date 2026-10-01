# Language Lab language specification

## Status

This is the living reference for syntax and behavior implemented by Language Lab. It describes supported source behavior, not speculative roadmap syntax.

Language Lab is an English-like, typed, executable-pseudocode language. The current reference implementation is a TypeScript parser, static analyzer, and AST interpreter.

## Source files

Language source uses the .lang extension.

A source file is a sequence of declarations and statements. Whitespace and newlines improve readability but do not terminate statements. Ordinary statements and declarations end with a period.

~~~text
integer: score = 10.
print(score).
~~~

Semicolons are not part of the language.

## Identifiers

Identifiers begin with an ASCII letter or underscore and may continue with ASCII letters, digits, or underscores.

Preferred:

~~~text
health
playerName
numberOne
enemy2
~~~

CamelCase remains the recommended convention.

Keywords are recognized case-insensitively. Identifiers preserve their spelling and should use consistent casing.

## Strings

Strings use double quotes and currently stay on one source line.

Supported escapes include newline, tab, quote, and backslash:

~~~text
text: message = "Hello\nworld".
~~~

## Numbers

Numeric literals may contain digits and one decimal point when digits follow the point.

~~~text
10
-5
2.5
~~~

Numeric declaration types are `integer` (finite whole number) and `float` (finite double, including whole values).

## Current keywords

~~~text
import as public
integer float text array dictionary boolean vector2 vector3 color resource
constant record signal emit on returns
print export input button enum
function return
if elif else end do
while for each in from to step range
plus minus times divided by remainder
is equal not less than greater or and
true false
~~~

## Typed declarations

Typed declarations always use a colon:

~~~text
integer: health = 100.
text: name = "Lyra".
boolean: alive = true.
array: inventory = ["sword", "potion"].
~~~

Assignment changes an existing variable while preserving its declared type:

~~~text
health = health - 10.
~~~

## Enums

~~~text
enum Difficulty [easy, normal, hard].

Difficulty: difficulty = normal.
difficulty = hard.
~~~

An enum requires at least one value. Duplicate values inside one enum are rejected.

Enum values are currently bare identifiers.

## Expressions and precedence

Expressions include literals, identifiers, enum values, arrays, indexing, function calls, unary operators, arithmetic, comparisons, and boolean logic.

Practical precedence, highest to lowest:

1. literals, identifiers, calls, member-qualified calls, and indexing;
2. unary not and unary minus;
3. multiplication, division, remainder;
4. addition and subtraction;
5. comparisons beginning with is;
6. and;
7. or.

Parentheses may make grouping explicit.

## Arithmetic

Word and symbolic forms are equivalent:

~~~text
a plus b
a + b

a minus b
a - b

a times b
a * b

a divided by b
a / b
~~~

Remainder currently uses the word form:

~~~text
value remainder 2
~~~

If either operand of plus is text, plus concatenates their formatted values.

Division by zero is an error.

## Comparisons

Supported forms:

~~~text
a is b
a is equal to b

a is not b
a is not equal to b

a is less than b
a is less than or equal to b

a is greater than b
a is greater than or equal to b
~~~

Symbolic comparisons such as ==, !=, <, <=, >, >= are not current syntax.

## Boolean logic

~~~text
alive and hasWeapon
hasKey or doorOpen
not gameOver
~~~

Conditions require boolean values. There is no JavaScript-style truthiness.

## Arrays

~~~text
array: items = ["sword", "potion", [1, 2]].
print(items[0]).
~~~

Indexes are zero-based, must be integers, and must be in range.

Arrays may currently contain mixed language values.

Indexed assignment such as `items[0] = value.` is supported with bounds/type checks and value-copy semantics.

## Output

~~~text
print("Hello").
print("Health:", health).
print(name, score, inventory).
~~~

Multiple arguments are formatted and joined with a single space. Each print call appends one output entry.

## If / elif / else

~~~text
if health is less than or equal to 0, do.
    print("Dead.").
elif health is less than 25, do.
    print("Low health.").
else, do.
    print("Still going.").
end if.
~~~

Block headers use comma + do + period.

## While

~~~text
while health is greater than 0, do.
    health = health - 1.
end while.
~~~

The condition is reevaluated each iteration and must be boolean.

## For each

~~~text
for each item in inventory, do.
    print(item).
end for.
~~~

The iterable must be an array.

## Python-style range loops

Language Lab supports compact Python-style counting loops while keeping Language Lab block syntax:

~~~text
for x in range(10), do.
    print(x).
end for.
~~~

range follows Python stop semantics:

~~~text
range(10)          -> 0 through 9
range(2, 5)        -> 2, 3, 4
range(1, 10, 2)    -> 1, 3, 5, 7, 9
range(10, 0, -2)   -> 10, 8, 6, 4, 2
~~~

Forms:

~~~text
range(stop)
range(start, stop)
range(start, stop, step)
~~~

Rules:

- arguments must be integers;
- stop is exclusive;
- step defaults to 1;
- step cannot be zero;
- the loop variable is inferred as integer.

range is currently loop syntax, not a general-purpose function value.

## Typed range loops

The original explicit typed range form remains supported:

~~~text
for integer: i from 1 to 10, do.
    print(i).
end for.
~~~

Unlike range(...), the from/to form has an inclusive end value.

It may use a step:

~~~text
for integer: i from 10 to 0 step -2, do.
    print(i).
end for.
~~~

## Functions

~~~text
function add(integer: first, integer: second).
    return first + second.
end function.
~~~

Call by name:

~~~text
print(add(10, 20)).
~~~

Parameters use mandatory typed colons.

Return may contain a value or be empty:

~~~text
return total.
return.
~~~

Return outside a function is an error.

Optional return annotations follow parameters: `function double(integer: value) returns integer.`. All return paths, including implicit empty returns, are runtime-validated.

## Built-in random integer

~~~text
integer: damage = randomInteger(8, 15).
~~~

Both bounds are inclusive. Arguments must be integers and minimum must not exceed maximum.

The current implementation uses host randomness and is not seeded or cryptographically secure.

## Modules

Projects may contain multiple .lang modules.

Import explicitly with a relative .lang path and namespace:

~~~text
import "./lib/maths.lang" as maths.
~~~

A module exposes callable functions with public:

~~~text
public function double(integer: value).
    return value * 2.
end function.
~~~

Call through the namespace:

~~~text
print(maths.double(10)).
~~~

Module rules currently include:

- explicit relative .lang imports;
- namespaced access;
- module-local globals;
- each reachable module initializes once per RuntimeSession;
- deterministic project resolution;
- import cycles rejected;
- imported functions must be public;
- no remote imports, wildcard imports, or package registry.

export does not mean module visibility. export remains Inspector exposure.

## export, input, and button

These three concepts are intentionally distinct.

### export

~~~text
export integer: startingHealth = 100.
~~~

Exposes configuration metadata to the IDE Inspector.

### input

~~~text
input text: heroName = "Lyra".
~~~

Exposes a user-editable control in the running App/Output surface.

### button

~~~text
button "Attack", do.
    print("Attack!").
end button.
~~~

Exposes an interactive action. Buttons execute against the current persistent RuntimeSession state.

input and button are top-level constructs.

## Scope

Runtime variables live in nested environments.

- declarations bind in the current environment;
- reads search outward;
- assignment updates the nearest existing binding;
- nested control-flow gets child scope;
- every button press gets fresh action-local scope over persistent module globals;
- each function call gets fresh function-local scope over its module globals.

Imported modules keep their own global state.

## Errors and diagnostics

Language diagnostics carry source identity and source spans, enabling file-aware errors and future editor tooling.

Errors include invalid syntax, unknown bindings, type mismatches, invalid module imports, array bounds failures, division by zero, resource-limit failures, and invalid range arguments.

Messages should describe the expected source form rather than exposing parser internals.

## Runtime limits

Execution is bounded by operation, time, call-depth, output, and value-size limits.

The IDE runs program execution in a Web Worker. Stop/timeout can hard-terminate the worker when synchronous user code cannot cooperatively yield.

## Not currently part of the language

Do not generate these as working syntax until implementation lands:

- comments;
- classes, inheritance, or scene trees;
- async/await;
- try/catch;
- break/continue;
- match/switch;
- function values/lambdas;
- arbitrary DOM/browser access;
- remote/package imports.

## Annotations, data, resources, and events

[GDScript-inspired features](gdscript-inspiration.md) is part of this language contract. It specifies declaration hints, constants, typed collections, records, return types, dot disambiguation, resource identity, lifecycle/signal ordering, value semantics, and graphics primitives.

## Comments, loop control and standard helpers

See [General coding improvements](coding-improvements.md) for supported `#`/`/* */` comments, `break.`, `continue.`, typed return-path checks, and text/math built-ins.
