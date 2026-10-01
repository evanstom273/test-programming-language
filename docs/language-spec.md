# Language Lab language specification

## Status

This is a living specification for the currently implemented language. It describes supported source behavior rather than future roadmap ideas.

Language Lab is an English-like, typed, executable-pseudocode language. The current implementation is parsed and executed by a TypeScript interpreter.

## 1. Source files

The conventional source extension is:

~~~text
.lang
~~~

A source file is a sequence of statements and declarations.

Whitespace between tokens is generally insignificant. Newlines improve readability but are not statement terminators.

A period terminates ordinary statements and declarations.

~~~text
integer: score = 10.
print(score).
~~~

Semicolons are not part of the language.

## 2. Character and token rules

Currently meaningful punctuation is:

~~~text
. , : ( ) [ ] " = + - * /
~~~

Other punctuation is rejected unless or until explicitly added to the lexer.

### 2.1 Identifiers

Identifiers:

- begin with an ASCII letter;
- may continue with ASCII letters or digits;
- do not currently contain underscores.

Valid examples:

~~~text
health
playerName
numberOne
enemy2
~~~

Invalid examples:

~~~text
_player
player_name
2player
~~~

Keywords are recognized case-insensitively. Identifiers preserve their spelling and runtime lookup is case-sensitive, so code should use consistent casing.

### 2.2 Strings

Strings use double quotes and must currently remain on one source line.

Supported escapes include:

~~~text
\n
\t
\"
\\
~~~

Example:

~~~text
text: message = "Hello\nworld".
~~~

### 2.3 Numbers

Numeric literals may contain digits and one decimal point when digits follow the point.

Examples:

~~~text
10
-5
2.5
~~~

The only public declared numeric primitive currently specified is integer. See types.md for the important distinction between numeric runtime values and declared integer variables.

## 3. Reserved words

Current keywords include:

~~~text
integer text array boolean
print export input button enum
function return
if elif else end do
while for each in from to step
plus minus times divided by remainder
is equal not less than greater or and
true false
~~~

Do not use keywords as variable, function, enum, or parameter names.

## 4. Declarations

Typed declarations always use a colon between the type and variable name.

~~~text
integer: health = 100.
text: name = "Lyra".
boolean: alive = true.
array: inventory = ["sword", "potion"].
~~~

The declaration initializer is evaluated immediately when execution reaches the declaration.

Variables may be reassigned:

~~~text
health = health - 10.
~~~

Assignment does not redeclare a variable and must preserve its declared type.

## 5. Enums

Enums define a named type with a fixed set of identifier values.

~~~text
enum Difficulty [easy, normal, hard].

Difficulty: difficulty = normal.
~~~

An enum requires at least one value. Duplicate values inside the same enum are rejected.

Enum values are currently referenced as bare identifiers:

~~~text
difficulty = hard.
~~~

Qualified enum values are not implemented yet. Until namespacing exists, avoid reusing the same value names across unrelated enums where ambiguity would be confusing.

## 6. Expressions

Expressions include:

- literals;
- variable references;
- enum values;
- arrays;
- array indexing;
- function calls;
- unary not;
- unary minus;
- arithmetic;
- comparisons;
- boolean and/or.

### 6.1 Precedence

From highest to lowest, the practical precedence is:

1. primary expressions, calls, and indexing;
2. unary not and unary minus;
3. multiplication, division, remainder;
4. addition and subtraction;
5. comparisons beginning with is;
6. and;
7. or.

Parentheses may be used to make grouping explicit.

~~~text
integer: result = (first + second) * multiplier.
~~~

### 6.2 Arithmetic

English and symbolic forms are equivalent:

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

If either operand of plus is text, plus performs text concatenation using the language's formatted representation.

~~~text
print("HP: " plus health).
~~~

Division by zero is a runtime error.

### 6.3 Comparisons

Supported comparison forms are:

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

There are no symbolic comparison operators such as <, >, ==, or != in the current language.

### 6.4 Boolean operators

~~~text
alive and hasWeapon
alive or hasPotion
not gameOver
~~~

Conditions require actual boolean values. Language Lab does not currently use JavaScript-style truthiness.

## 7. Arrays

Array literals use square brackets.

~~~text
array: items = ["sword", "potion", 3].
~~~

Arrays may currently contain mixed and nested language values.

Indexing is zero-based:

~~~text
print(items[0]).
~~~

Indexes must be integers and must be in range.

Element assignment such as items[0] = value is not currently part of the grammar. Replace the array variable as a whole when mutation is required.

## 8. Output

Use print with zero or more expressions.

~~~text
print("Hello").
print("Health:", health).
print(name, score, inventory).
~~~

Multiple print arguments are formatted and joined with a single space.

Each print call appends one entry to program output.

## 9. Conditional control flow

~~~text
if health is less than or equal to 0, do.
    print("Dead.").
elif health is less than 25, do.
    print("Low health.").
else, do.
    print("Still going.").
end if.
~~~

The comma and do are required. The header ends with a period. The complete block closes with end if.

## 10. While loops

~~~text
while health is greater than 0, do.
    health = health - 1.
end while.
~~~

The condition is re-evaluated each iteration and must produce a boolean.

Runtime operation limits prevent unbounded execution from running forever.

## 11. For-each loops

~~~text
for each item in inventory, do.
    print(item).
end for.
~~~

The iterable must evaluate to an array.

The loop variable is local to each iteration.

## 12. Range loops

~~~text
for integer: i from 1 to 10, do.
    print(i).
end for.
~~~

The end value is inclusive.

An explicit step may be supplied:

~~~text
for integer: i from 10 to 0 step -2, do.
    print(i).
end for.
~~~

Start, end, and step must be numeric. Step must not be zero. The declared loop-variable type is validated on each iteration.

For ordinary current code, use integer as the range variable type.

## 13. Functions

Functions have named, typed parameters.

~~~text
function add(integer: first, integer: second).
    return first + second.
end function.
~~~

Functions are called by name:

~~~text
print(add(10, 20)).
~~~

Parameter declarations require the same mandatory colon convention as ordinary declarations.

Return may include a value:

~~~text
return total.
~~~

or return no value:

~~~text
return.
~~~

Return outside a function is a runtime error.

The language does not currently declare return types in function signatures.

See functions.md for scope and built-ins.

## 14. Interactive declarations

Language Lab has three different concepts that must not be conflated.

### 14.1 export

~~~text
export integer: startingHealth = 100.
~~~

Export means the value is exposed as configuration to the IDE Inspector.

It does not currently mean module visibility.

### 14.2 input

~~~text
input text: heroName = "Lyra".
~~~

Input means the running program exposes a user-editable control in its application/output surface.

Input declarations are top-level constructs.

### 14.3 button

~~~text
button "Attack", do.
    print("Attack!").
end button.
~~~

Buttons expose an event/action in the running application surface.

Button labels must be non-empty quoted strings. Buttons are top-level constructs and retain access to the current program session state between presses.

See ui.md for the full state model.

## 15. Scope

A source-level declaration creates a binding in the current runtime environment.

Nested control-flow bodies use child scopes.

Assignments search outward through enclosing scopes, so a block may mutate an existing outer variable.

A declaration made inside a button or block is local to that execution scope.

Each button press starts with a fresh action-local scope whose parent is the persistent global environment.

Functions use a fresh function environment whose parent is the program global environment. Function parameters and function-local declarations are local to that call. Functions may read and assign globals.

For current portable source, define functions and enums at top level.

## 16. Errors

Language errors include source line and column information.

Examples include:

- unexpected symbols;
- missing periods;
- missing block terminators;
- invalid types;
- unknown variables or functions;
- invalid enum values;
- out-of-range array indexes;
- division by zero;
- excessive execution steps.

Error messages are intended to be human-readable and should prefer explaining the expected source form over exposing parser internals.

## 17. Execution budget

Program initialization and each interactive action are bounded by an operation limit.

The current interpreter limit is 100,000 operations per initialization/action.

This protects the browser from many accidental endless loops, though the architecture roadmap moves execution into workers so hard termination is also available.

## 18. Not currently part of the language

Do not generate or document these as working syntax until their implementation lands:

- comments;
- imports/modules on current main;
- public/private module modifiers;
- classes or objects;
- records/maps;
- a stable decimal/float declaration type;
- async/await;
- try/catch;
- break/continue;
- match/switch;
- member access with a dot;
- symbolic comparison operators;
- arbitrary DOM or browser access.
