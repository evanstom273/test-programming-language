# Syntax reference

This is the quick practical reference for writing valid .lang programs.

## Statements end with periods

Correct:

~~~text
integer: score = 0.
score = score + 1.
print(score).
~~~

Incorrect:

~~~text
integer: score = 0;
score = score + 1;
~~~

Language Lab does not use semicolons.

## Typed declarations

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
inventory = ["key"].
~~~

Assignment only changes an existing variable.

## Enums

~~~text
enum Direction [north, east, south, west].

Direction: direction = north.
direction = east.
~~~

## Printing

~~~text
print("Hello").
print("Health:", health).
print(playerName, "has", health, "HP").
~~~

## Arithmetic

Word and symbol forms may be mixed.

~~~text
integer: a = 10.
integer: b = 5.

print(a plus b).
print(a + b).

print(a minus b).
print(a - b).

print(a times b).
print(a * b).

print(a divided by b).
print(a / b).

print(a remainder b).
~~~

Unary minus is supported:

~~~text
integer: change = -5.
~~~

## Comparisons

~~~text
if score is 10, do.
    print("Exactly ten.").
end if.

if score is not 10, do.
    print("Not ten.").
end if.

if score is equal to 10, do.
    print("Exactly ten.").
end if.

if score is not equal to 10, do.
    print("Not ten.").
end if.

if score is less than 10, do.
    print("Below ten.").
end if.

if score is less than or equal to 10, do.
    print("Ten or below.").
end if.

if score is greater than 10, do.
    print("Above ten.").
end if.

if score is greater than or equal to 10, do.
    print("Ten or above.").
end if.
~~~

## Boolean logic

~~~text
if alive and hasWeapon, do.
    print("Fight.").
end if.

if hasKey or doorOpen, do.
    print("Enter.").
end if.

if not gameOver, do.
    print("Keep playing.").
end if.
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

Remember the block-header pattern:

~~~text
condition, do.
~~~

and the block terminator:

~~~text
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

## Range for

~~~text
for integer: i from 1 to 5, do.
    print(i).
end for.
~~~

The range is inclusive.

With a step:

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

Indexes start at zero.

## Functions

~~~text
function multiply(integer: first, integer: second).
    return first * second.
end function.

integer: result = multiply(4, 5).
print(result).
~~~

A function with no parameters:

~~~text
function greeting().
    print("Hello!").
end function.

greeting().
~~~

## Built-in random integer

~~~text
integer: damage = randomInteger(8, 15).
print("Damage:", damage).
~~~

The minimum and maximum are both inclusive.

## Inspector values with export

~~~text
export integer: startingHealth = 100.
export text: title = "Goblin Arena".
~~~

These appear in the IDE Inspector.

## Application inputs with input

~~~text
input text: heroName = "Lyra".
input integer: healAmount = 25.
input boolean: hardMode = false.

enum Difficulty [easy, normal, hard].
input Difficulty: difficulty = normal.
~~~

These appear as controls for the running program.

## Application buttons

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

The global count persists between button presses until the program is run again.

## Full small example

~~~text
enum Difficulty [easy, normal, hard].

export text: title = "Tiny Battle".
input text: heroName = "Lyra".
input Difficulty: difficulty = normal.

integer: heroHealth = 100.
integer: enemyHealth = 40.

function enemyDamage().
    if difficulty is easy, do.
        return randomInteger(3, 6).
    elif difficulty is hard, do.
        return randomInteger(8, 14).
    else, do.
        return randomInteger(5, 10).
    end if.
end function.

button "Attack", do.
    if enemyHealth is greater than 0, do.
        integer: damage = randomInteger(8, 15).
        enemyHealth = enemyHealth - damage.
        print(heroName, "deals", damage, "damage.").

        if enemyHealth is greater than 0, do.
            integer: retaliation = enemyDamage().
            heroHealth = heroHealth - retaliation.
            print("Enemy deals", retaliation, "damage.").
        else, do.
            enemyHealth = 0.
            print(heroName, "wins!").
        end if.

        print("Hero HP:", heroHealth).
        print("Enemy HP:", enemyHealth).
    end if.
end button.
~~~

## Syntax not yet supported

Do not write these yet:

~~~text
integer health = 100
integer: health = 100;
player_name = "Lyra".
if health < 10, do.
import "./other.lang".
~~~

The first is missing the mandatory colon, the second uses a semicolon, identifiers do not yet contain underscores, symbolic comparisons are not implemented, and imports are still under active development on the roadmap.
