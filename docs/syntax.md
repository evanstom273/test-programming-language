# Syntax reference

A compact reference for writing current .lang source.

## Statements use periods

~~~text
integer: score = 0.
score = score + 1.
print(score).
~~~

Do not use semicolons.

## Declarations

~~~text
integer: health = 100.
text: playerName = "Lyra".
boolean: gameOver = false.
array: inventory = ["sword", "potion"].
~~~

The colon is mandatory.

## Assignment

~~~text
health = 75.
playerName = "Mira".
gameOver = true.
~~~

## Enums

~~~text
enum Direction [north, east, south, west].

Direction: direction = north.
direction = east.
~~~

## Print

~~~text
print("Hello").
print("Health:", health).
print(playerName, "has", health, "HP").
~~~

## Arithmetic

~~~text
a plus b
a + b

a minus b
a - b

a times b
a * b

a divided by b
a / b

a remainder b
~~~

Unary minus:

~~~text
integer: change = -5.
~~~

## Comparisons

~~~text
score is 10
score is equal to 10
score is not 10
score is not equal to 10
score is less than 10
score is less than or equal to 10
score is greater than 10
score is greater than or equal to 10
~~~

## Boolean logic

~~~text
alive and hasWeapon
hasKey or doorOpen
not gameOver
~~~

## If / elif / else

~~~text
if health is greater than 50, do.
    print("Healthy.").
elif health is greater than 0, do.
    print("Hurt.").
else, do.
    print("Dead.").
end if.
~~~

## While

~~~text
while count is less than 5, do.
    count = count + 1.
end while.
~~~

## For each

~~~text
array: names = ["Amy", "Jake", "Rosa"].

for each name in names, do.
    print(name).
end for.
~~~

## Python-style range

Recommended compact counting form:

~~~text
for x in range(10), do.
    print(x).
end for.
~~~

Python semantics:

~~~text
range(5)          -> 0, 1, 2, 3, 4
range(2, 5)       -> 2, 3, 4
range(1, 10, 2)   -> 1, 3, 5, 7, 9
range(10, 0, -2)  -> 10, 8, 6, 4, 2
~~~

The stop value is exclusive and the loop variable is inferred as integer.

## Typed range

The explicit Language Lab form is still supported and remains inclusive:

~~~text
for integer: i from 1 to 5, do.
    print(i).
end for.
~~~

With step:

~~~text
for integer: i from 10 to 0 step -2, do.
    print(i).
end for.
~~~

## Arrays

~~~text
array: items = ["sword", "shield", ["nested", "array"]].

print(items[0]).
print(items[2][1]).
~~~

## Functions

~~~text
function multiply(integer: first, integer: second).
    return first * second.
end function.

integer: result = multiply(4, 5).
print(result).
~~~

## Random integers

~~~text
integer: damage = randomInteger(8, 15).
print("Damage:", damage).
~~~

Both bounds are inclusive.

## Modules

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

Imported functions must be public.

## Inspector configuration

~~~text
export integer: startingHealth = 100.
export text: title = "Goblin Arena".
~~~

## Application inputs

~~~text
input text: heroName = "Lyra".
input integer: healAmount = 25.
input boolean: hardMode = false.

enum Difficulty [easy, normal, hard].
input Difficulty: difficulty = normal.
~~~

## Buttons

~~~text
integer: count = 0.

button "Add", do.
    count = count + 1.
    print("Count:", count).
end button.

button "Reset", do.
    count = 0.
    print("Reset.").
end button.
~~~

Global state persists between button presses until Run starts a fresh session.

## Small random game fragment

~~~text
integer: total = 0.

for roll in range(5), do.
    integer: result = randomInteger(1, 6).
    total = total + result.
    print("Roll", roll + 1, ":", result).
end for.

print("Total:", total).
~~~

## Common invalid syntax

Do not write:

~~~text
integer health = 100
integer: health = 100;
player_name = "Lyra".
if health < 10, do.
for x in range(10):
~~~

Reasons:

- typed declarations need a colon;
- statements end in periods, not semicolons;
- underscores are not current identifier syntax;
- comparisons use supported English forms;
- Python-style range keeps Language Lab's , do. and end for. block syntax.

## Typed data and events extension

See [GDScript-inspired features](gdscript-inspiration.md) for supported annotations, float/collection/record/resource controls, lifecycle events, signals, and worker scheduling. These extend the existing export/input/button model.
