# Language conventions and style guide

These conventions keep human-written and agent-generated .lang code recognizably Language Lab.

## Naming

Prefer camelCase identifiers:

~~~text
playerName
startingHealth
enemyDamage
numberOne
~~~

Underscores are supported; camelCase remains preferred.

Enum type names should generally use PascalCase:

~~~text
enum Difficulty [easy, normal, hard].
~~~

## Mandatory typed colons

Always:

~~~text
integer: health = 100.
function heal(integer: amount).
for integer: i from 1 to 10, do.
~~~

Never omit the colon.

## Periods, never semicolons

~~~text
health = health - 10.
print(health).
~~~

Agents should explicitly scan generated .lang for stray semicolons.

## Explicit block endings

~~~text
if alive, do.
    attack().
else, do.
    retreat().
end if.
~~~

Use:

~~~text
end if.
end while.
end for.
end function.
end button.
~~~

Use explicit block endings. Braces are dictionary literals, not statement blocks.

Indent blocks with four spaces.

## Comparisons stay English-like

Use:

~~~text
health is greater than 0
health is less than or equal to 25
difficulty is hard
gameOver is false
~~~

Do not invent symbolic comparisons.

## Arithmetic may be words or symbols

Both are valid:

~~~text
health = health minus damage.
health = health - damage.
~~~

Use whichever is clearer in context.

## Counting loops

Prefer Python-style range when you want compact conventional counting:

~~~text
for x in range(10), do.
    print(x).
end for.
~~~

Remember that range stop is exclusive.

Use the explicit typed form when the inclusive endpoint reads more naturally or when you deliberately want the type visible:

~~~text
for integer: x from 1 to 10, do.
    print(x).
end for.
~~~

The two forms intentionally have different endpoint semantics. Do not silently translate one into the other without accounting for that.

## Suggested source order

For an interactive entry module:

1. imports;
2. enums;
3. exported configuration;
4. user inputs;
5. persistent state;
6. functions;
7. buttons/top-level actions.

Example:

~~~text
import "./lib/combat.lang" as combat.

enum Difficulty [easy, normal, hard].

export integer: startingHealth = 100.
input text: heroName = "Lyra".

integer: health = startingHealth.

button "Attack", do.
    integer: damage = combat.damage().
    print(heroName, "deals", damage, "damage.").
end button.
~~~

## export, input, public, and internal state

Use each for its actual purpose:

~~~text
export integer: startingHealth = 100.
input text: heroName = "Lyra".
integer: currentHealth = startingHealth.
public function damage().
    return randomInteger(8, 15).
end function.
~~~

Meanings:

- export: Inspector/configuration exposure;
- input: application/user control;
- public: module function visibility;
- ordinary declaration: internal program state.

Do not overload export as module export.

## Module imports

Prefer explicit relative namespaces:

~~~text
import "./lib/maths.lang" as maths.
~~~

Avoid copying module globals into the caller's namespace. Namespace qualification makes origin obvious.

## Functions

Prefer verb-like names where sensible:

~~~text
calculateDamage
showStatus
resetGame
enemyAttack
~~~

## Output is not storage

print is observable output, not a data store. Keep actual state in variables.

## Unsupported syntax stays unsupported

Do not invent syntax because another language has it.

Check support before using:

- comments;
- classes/inheritance;
- async/await;
- exception handling;
- break/continue;
- package/remote imports.

## Error messages

Prefer:

~~~text
Expected a variable name after integer:.
~~~

over parser-internal jargon.

Diagnostics should tell the programmer what was expected and show a valid form where useful.

## Preserve the language identity

Language Lab is not JavaScript or Python with renamed keywords.

A new syntax feature should improve readability, usability, interoperability, or remove ambiguity.

Borrowing a familiar construct is fine when it fits the language. Python-style range loops are an example: the range call is familiar, while , do. and end for. preserve Language Lab's block style.

## Examples should parse

When changing syntax:

1. update lexer/parser/analysis/runtime as needed;
2. add valid and invalid tests;
3. update the docs;
4. update examples/completions;
5. run conformance/build checks.
