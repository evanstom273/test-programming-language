# Language conventions and style guide

These are source-style conventions, not all hard grammar rules. They exist so human-written and agent-generated Language Lab code looks like the same language.

## 1. Prefer camelCase identifiers

Preferred:

~~~text
playerName
startingHealth
enemyDamage
numberOne
~~~

Avoid attempting underscore names because underscores are not currently legal identifier characters.

~~~text
player_name
starting_health
~~~

## 2. Types use the mandatory colon

Always:

~~~text
integer: health = 100.
function heal(integer: amount).
for integer: i from 1 to 10, do.
~~~

Never:

~~~text
integer health = 100.
function heal(integer amount).
for integer i from 1 to 10, do.
~~~

The colon is part of the language's identity.

## 3. Periods, never semicolons

Correct:

~~~text
health = health - 10.
print(health).
~~~

Wrong:

~~~text
health = health - 10;
print(health);
~~~

This is the easiest habit to accidentally import from JavaScript/C-like languages. Agents should specifically check generated .lang source for stray semicolons.

## 4. Use explicit block endings

Preferred layout:

~~~text
if alive, do.
    attack().
else, do.
    retreat().
end if.
~~~

Likewise:

~~~text
end while.
end for.
end function.
end button.
~~~

Do not invent braces.

## 5. Indent blocks with four spaces

Preferred:

~~~text
button "Attack", do.
    if enemyHealth is greater than 0, do.
        enemyHealth = enemyHealth - damage.
        print("Enemy HP:", enemyHealth).
    end if.
end button.
~~~

Indentation is for readability; explicit end markers define the block.

## 6. Prefer English comparisons

Use:

~~~text
health is greater than 0
health is less than or equal to 25
difficulty is hard
gameOver is false
~~~

Do not invent:

~~~text
health > 0
health <= 25
difficulty == hard
~~~

## 7. Arithmetic may use words or symbols

Both are valid:

~~~text
health = health minus damage.
health = health - damage.
~~~

Recommended style:

- use symbols for compact mathematical expressions;
- use word forms when they read especially naturally;
- do not force one form throughout the language.

Examples:

~~~text
integer: area = width * height.
integer: remaining = health minus damage.
~~~

## 8. Keep declarations close to their purpose

Top-level persistent state should be easy to find.

A useful order for interactive programs is:

1. enums;
2. exported configuration;
3. user inputs;
4. persistent program state;
5. functions;
6. buttons.

Example:

~~~text
enum Difficulty [easy, normal, hard].

export text: title = "Arena".
export integer: startingHealth = 100.

input text: heroName = "Lyra".
input Difficulty: difficulty = normal.

integer: health = startingHealth.
integer: enemyHealth = 50.

function enemyDamage().
    return randomInteger(5, 10).
end function.

button "Attack", do.
    enemyHealth = enemyHealth - randomInteger(8, 15).
end button.
~~~

## 9. Keep export, input, and ordinary state distinct

Use export for author/configuration controls:

~~~text
export integer: startingHealth = 100.
~~~

Use input for the person running the program:

~~~text
input text: heroName = "Lyra".
~~~

Use an ordinary declaration for internal state:

~~~text
integer: currentHealth = startingHealth.
~~~

Do not expose every internal variable just because the IDE can render a control for it.

## 10. Functions should have verb-like names where sensible

Examples:

~~~text
calculateDamage
showStatus
resetGame
enemyAttack
~~~

Enums should generally use PascalCase type names:

~~~text
enum Difficulty [easy, normal, hard].
enum Direction [north, east, south, west].
~~~

Enum values should use lower camel/simple lowercase names.

## 11. Use print for observable output, not hidden state

Good:

~~~text
print("Enemy HP:", enemyHealth).
~~~

Do not rely on output text as a data store. Keep real values in typed variables.

## 12. Avoid accidental enum collisions

Until qualified enum members exist, enum values are bare identifiers.

Prefer:

~~~text
enum Difficulty [easy, normal, hard].
enum Direction [north, east, south, west].
~~~

Be cautious with several enums all containing generic values such as on, off, normal, default if that makes source ambiguous to a reader.

## 13. Treat current unsupported syntax as unsupported

Do not invent a feature because it would look familiar from another language.

Before generating .lang code, confirm support for:

- imports;
- comments;
- methods/member access;
- custom records/classes;
- decimal declaration types;
- async;
- exception handling;
- break/continue.

If the parser does not support it, do not silently pretend it does.

## 14. Write user-facing errors in plain language

When extending the implementation, prefer:

~~~text
Expected a variable name after integer:.
~~~

over:

~~~text
Unexpected token at parser state 17.
~~~

Diagnostics should tell the programmer what was expected and, when useful, show a valid form.

## 15. Preserve the language's identity

Language Lab is not JavaScript with words renamed.

New syntax should answer at least one of these:

- Is it easier to read?
- Is it easier to write?
- Does it remove ambiguity?
- Does it fit the executable-pseudocode style?
- Is conventional syntax so familiar that using words would be worse?

Avoid novelty for novelty's sake.

## 16. Examples should actually parse

Documentation and agent-generated examples should be treated as executable artifacts.

When changing syntax:

1. update parser/runtime tests;
2. update the language docs;
3. update representative .lang examples;
4. check for old syntax in docs;
5. prefer conformance tests over prose-only promises.
