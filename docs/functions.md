# Functions and built-ins

## Declaring a function

Functions are named and their parameters are typed.

~~~text
function add(integer: first, integer: second).
    return first + second.
end function.
~~~

Parameter syntax follows the language-wide typed declaration convention:

~~~text
type: name
~~~

Multiple parameters are comma-separated.

~~~text
function describe(text: name, integer: health, boolean: alive).
    print(name, health, alive).
end function.
~~~

A function may have no parameters:

~~~text
function hello().
    print("Hello!").
end function.
~~~

For supported, portable source, define functions at the top level.

## Calling a function

~~~text
integer: result = add(10, 20).
print(result).
~~~

A call must supply exactly the declared number of arguments.

Arguments are evaluated in the caller's current environment and then validated against the parameter types.

## Return

Return with a value:

~~~text
function double(integer: value).
    return value * 2.
end function.
~~~

Return without a value:

~~~text
function stopEarly(boolean: stop).
    if stop, do.
        return.
    end if.

    print("Continued.").
end function.
~~~

Return is only valid while executing a function. Using return from a button or ordinary top-level control-flow block is a runtime error.

Function signatures do not currently declare return types.

If execution reaches the end of a function without a return value, the call produces the runtime's internal empty/null value.

## Function scope

Each call receives a fresh function-local environment whose parent is the program's persistent global environment.

That means a function can read globals:

~~~text
integer: score = 10.

function showScore().
    print(score).
end function.
~~~

A function can assign an existing global:

~~~text
integer: score = 0.

function addPoint().
    score = score + 1.
end function.
~~~

Parameters and declarations made inside the function are local to that call.

~~~text
function calculate(integer: amount).
    integer: doubled = amount * 2.
    return doubled.
end function.
~~~

They disappear when the function returns.

Functions do not use the caller's local scope as their parent. They use the global environment. Do not rely on dynamic-scope behavior.

## Recursion

Functions are collected before ordinary program execution, so named functions can call other top-level functions, including themselves.

Recursion still consumes the interpreter's operation budget and the JavaScript call stack. Deep or unbounded recursion is not a safe substitute for an iterative algorithm.

## Built-in: randomInteger

Current syntax:

~~~text
integer: roll = randomInteger(1, 6).
~~~

randomInteger takes exactly two arguments:

~~~text
randomInteger(minimum, maximum)
~~~

Rules:

- minimum must be an integer;
- maximum must be an integer;
- minimum must not be greater than maximum;
- both endpoints are inclusive;
- the result is an integer;
- the built-in name cannot be redefined by a user function.

Examples:

~~~text
integer: damage = randomInteger(8, 15).
integer: coin = randomInteger(0, 1).
integer: fixed = randomInteger(5, 5).
~~~

The current implementation uses the host's Math.random. It is:

- not seeded;
- not deterministic between runs;
- not suitable for cryptographic/security decisions.

A seeded random API is planned separately for deterministic games and procedural generation.

## print is syntax, not an ordinary user function

Although it looks call-like:

~~~text
print("Hello", name).
~~~

print is parsed as its own statement in the current language. It is not a normal function value and cannot be redefined or passed around.

## Function values and callbacks

Functions are currently callable by name only.

The language does not yet have:

- function values;
- lambdas;
- anonymous functions;
- closures as values;
- callbacks as first-class values;
- method/member calls.

These should not be simulated with invented syntax.
