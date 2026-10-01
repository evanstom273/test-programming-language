# Language Lab

A browser-based IDE and interpreter for an English-like, executable-pseudocode programming language.

## Syntax

The language intentionally keeps symbolic syntax small while allowing familiar symbols where they improve readability.

Allowed symbols currently include:

```text
. , : ( ) [ ] " = + - * /
```

Typed declarations always use a colon:

```text
integer: health = 100.
text: name = "Lyra".
array: inventory = ["sword", "potion"].
```

Arithmetic supports both words and symbols:

```text
health = health minus damage.
health = health - damage.

total = price plus tax.
total = price + tax.

area = width times height.
area = width * height.

average = total divided by count.
average = total / count.
```

## Enums and exports

```text
enum Operation [add, subtract, multiply, divide].

export integer: numberOne = 10.
export integer: numberTwo = 5.
export Operation: operation = add.
```

Exported values automatically appear in the IDE Inspector. Integer exports become number inputs, text exports become text fields, booleans become toggles, enums become dropdowns, and arrays have a basic JSON editor. Inspector overrides are stored locally in IndexedDB and applied when the program runs.

## Control flow

```text
if health is less than or equal to 0, do.
    print("Dead.").
elif health is less than 25, do.
    print("Low health.").
else, do.
    print("Still going.").
end if.

while health is greater than 0, do.
    health = health - 1.
end while.

for each item in inventory, do.
    print(item).
end for.

for integer: i from 1 to 10, do.
    print(i).
end for.
```

## Functions

```text
function add(integer: first, integer: second).
    return first + second.
end function.

print(add(10, 20)).
```

## Calculator example

A `calculator.lang` example is created automatically:

```text
enum Operation [add, subtract, multiply, divide].

export integer: numberOne = 10.
export integer: numberTwo = 5.
export Operation: operation = add.

function calculate().
    if operation is add, do.
        return numberOne plus numberTwo.
    elif operation is subtract, do.
        return numberOne - numberTwo.
    elif operation is multiply, do.
        return numberOne * numberTwo.
    elif operation is divide, do.
        return numberOne / numberTwo.
    else, do.
        return 0.
    end if.
end function.

print(calculate()).
```

Change the exported inputs in the Inspector, press Run, and the output uses those overrides.

## Stack

- Vite
- React
- TypeScript
- Tailwind CSS
- CodeMirror 6
- Dexie / IndexedDB
- vite-plugin-pwa
- TypeScript lexer, parser, and interpreter

Everything runs directly in the browser.

## Development

```bash
npm install
npm run dev
```

Build with:

```bash
npm run build
```

The PWA configuration follows the same GitHub Pages-aware pattern used by the working PWAs in this account: the production base path, manifest id, scope, and start URL all point explicitly at `/test-programming-language/`.
