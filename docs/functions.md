# Functions, modules, and built-ins

## Declaring functions

~~~text
function add(integer: first, integer: second).
    return first + second.
end function.
~~~

Parameters use the same mandatory type-colon convention as variables.

~~~text
function describe(text: name, integer: health, boolean: alive).
    print(name, health, alive).
end function.
~~~

Functions may take no arguments:

~~~text
function hello().
    print("Hello!").
end function.
~~~

## Calling functions

~~~text
integer: result = add(10, 20).
print(result).
~~~

A call must provide the declared number of arguments. Arguments are evaluated in the caller and checked against the parameter types.

## Return

~~~text
function double(integer: value).
    return value * 2.
end function.
~~~

Empty return is allowed:

~~~text
return.
~~~

return is only valid while executing a function.

Function signatures may declare return types: `function double(integer: value) returns integer.`. Typed functions validate the result, including implicit empty returns. Omitted annotations preserve existing behavior.

## Function scope

Every call receives fresh local scope whose parent is that function's module-global environment.

A function may read or update its module globals:

~~~text
integer: score = 0.

function addPoint().
    score = score + 1.
end function.
~~~

Parameters and function-local declarations disappear after the call.

Functions do not inherit a button's temporary local variables.

## Public module functions

Functions are module-local unless declared public.

lib/maths.lang:

~~~text
public function double(integer: value).
    return value * 2.
end function.
~~~

main.lang:

~~~text
import "./lib/maths.lang" as maths.

print(maths.double(10)).
~~~

public controls module visibility.

It is deliberately separate from export:

~~~text
export -> Inspector configuration
public -> module visibility
~~~

## Imported module state

Each reachable module initializes once in a RuntimeSession and owns its own globals.

A public function can mutate state in its defining module, and repeated calls observe that module's persistent state.

## Recursion

Named functions can call other functions and themselves.

Execution remains subject to operation, time, and call-depth limits. Deep/unbounded recursion is not safe.

## Built-in randomInteger

~~~text
integer: roll = randomInteger(1, 6).
~~~

Rules:

- exactly two arguments;
- both arguments are integers;
- minimum cannot exceed maximum;
- both endpoints are inclusive;
- result is an integer;
- the built-in name cannot be redefined.

The implementation uses host Math.random. It is not seeded, deterministic, or cryptographically secure.

## range is loop syntax

Python-style range is currently parsed as part of a for loop:

~~~text
for x in range(10), do.
    print(x).
end for.
~~~

It is not currently a first-class function that returns an array.

## print is statement syntax

Although it looks call-like:

~~~text
print("Hello", name).
~~~

print is parsed as its own statement, not as a re-definable function.

## Not yet supported

The language does not yet provide:

- function values;
- lambdas;
- anonymous functions;
- closures as values;
- callbacks as first-class values;
- generic method calls on arbitrary objects.

## Data and graphics built-ins

`Resource`, `loadResource`, `parseJSON`, `toJSON`, `Vector2`, `Vector3`, `Color`, `length`, `normalized`, and `dot` are documented in [GDScript-inspired features](gdscript-inspiration.md). These names are reserved and cannot be redefined.
