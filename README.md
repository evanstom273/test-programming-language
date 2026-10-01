# Language Lab

A browser-based IDE and interpreter for an English-like, executable-pseudocode programming language.

## Standalone applications

Choose **Files → Project actions → Download standalone HTML** (also available in the file runner). Share the resulting HTML file: it contains the app, interpreter, controls and assets and runs offline in a browser without Language Lab or the IDE.

See [Standalone HTML applications](docs/standalone-html.md) for configuration, state and mobile file-opening behavior.

## Running .lang files

```sh
npm ci
npm run lang:check -- examples/hello.lang
npm run lang:run -- examples/hello.lang
npm run build
npm run lang:open -- examples/interactive-calculator.lang
```

In the browser/PWA, choose **Open / Run .lang File** in Files/Explorer, or drop a
file on desktop. Files run temporarily; choose **Save as project** to keep a copy.
See [Running .lang files](docs/running-lang-files.md) for mobile instructions,
OS file-handler limitations, CLI exit codes, security boundaries and dependencies.

## Projects and worker runtime

Language Lab now runs projects with configurable entry points, namespaced imports,
static Inspector analysis and persistent worker-owned sessions. Use the existing
Explorer to manage projects/folders and import or export source and project ZIPs.
Run initializes a project; Stop terminates its worker. Editor-file selection does
not change the entry point.

See [Projects and runtime architecture](docs/projects-runtime.md) for module syntax,
source spans, migration guarantees, resource limits, archive format and deliberate
Phase 1–2 boundaries. A runnable multi-file example lives in
[examples/modules](examples/modules).

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

for i in range(10), do.
    print(i).
end for.
```

Python-style `range` loops use an exclusive stop value, matching Python: `range(10)` produces 0 through 9, and `range(1, 10, 2)` produces 1, 3, 5, 7, 9. The existing typed `from ... to ...` form remains inclusive.

## Functions

```text
function add(integer: first, integer: second).
    return first + second.
end function.

print(add(10, 20)).
```

## Calculator example

A `calculator.lang` example project is created in fresh workspaces:

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

## Interactive programs: inputs and buttons

`export` exposes a value in the **IDE Inspector**. `input` exposes a control in
**Output**, for the person using the program. They can coexist and use separate
override stores. Neither kind of UI edit rewrites the source.

All typed declarations still require a colon:

```text
input integer: numberOne = 10.
input text: playerName = "Lyra".
input boolean: enabled = true.
input array: items = ["one", "two"].

enum Difficulty [easy, normal, hard].
input Difficulty: difficulty = normal.

button "Show values", do.
    if enabled, do.
        print(playerName, numberOne, difficulty, items).
    end if.
end button.
```

Inputs render as whole-number fields, text fields, checkboxes, enum selects, or
JSON array editors. Labels come from variable names (`numberOne` → `Number One`).
Incomplete or invalid edits show an error and prevent button execution; only
valid edits enter runtime state and local storage.

Open **interactive-calculator.lang** in the Explorer, then press **Run**. Its
source is also in [examples/interactive-calculator.lang](examples/interactive-calculator.lang).
It combines an exported title, numeric and enum inputs, a function, and a
Calculate button. Change the title in the Inspector and press Run; then edit
inputs and press Calculate as often as needed. Existing `calculator.lang` files
are preserved.

### Session behavior

- **Run** statically compiles the project and initializes a fresh worker session. Declarations evaluate in source
  order: their code defaults are evaluated, then the matching Inspector or input
  override is applied. Later declarations see earlier effective values.
- Inputs and buttons are **top-level** constructs. A button label is a nonempty
  quoted string. Its body can use assignments, declarations, loops, conditionals,
  print, and function calls. `return` remains function-only. Nested input/button
  declarations are rejected with a source location.
- A button runs its parsed block against the current globals and inputs, with a
  fresh local scope per click. Functions see current global values. Button changes
  to input variables are reflected in the controls. Prints append to the console;
  Clear output leaves state intact.
- Each initialization/action has a 100,000-operation limit. If an action fails,
  completed state changes and prints are retained, and the error is displayed.
  A later action may recover; Run resets the whole session.
- Source or Inspector changes disable the old controls until Run. A failed Run
  discards the previous session, so stale buttons cannot execute.
- **Only user input edits** are persisted in each file's `inputOverrides` property
  in Dexie. Button-driven mutations are session-only. Run restores code defaults
  plus saved overrides; reload/PWA restart restores overrides but requires Run to
  activate a session. The Output toolbar's **Reset saved inputs and restart**
  action clears input overrides (including ones incompatible with changed types)
  without changing source or Inspector overrides.
- Programs without inputs/buttons retain their ordinary console behavior.

### Architecture and tests

`src/language/ast.ts` and `parser.ts` define the language; `analysis.ts` creates an
immutable Program. `RuntimeSession` in `runtime.ts` owns mutable module state,
input validation, action execution and output inside a Web Worker.
`program.ts` exposes serializable UI metadata. React's `useProgramSession` hook
handles session lifetime/staleness; `ProgramOutput` and `ValueControl` render
metadata and dispatch actions, without interpreting source.

```bash
npm ci
npm test                     # parser/runtime and Dexie persistence tests
npm run build                # full TypeScript check and production/PWA build
GITHUB_PAGES=true npm run build
npx playwright install chromium
npm run test:e2e             # desktop and mobile browser flows
```

For an existing system Chromium, set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chromium` when running `test:e2e`.

### PWA installation checks

`npm run build` validates all shipped PNG icons before bundling. This fully decodes
image data and checks PNG checksums: `file`, image dimensions, and even Chromium's
`Image.decode()` can accept files that stricter image decoders reject.

Run `npm run test:pwa` after installing Playwright Chromium (or setting
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`). It builds and serves the production GitHub
Pages subpath, checks manifest URLs and icon decoding, verifies Chromium's
installation eligibility and service-worker control, then restarts the browser
and opens the PWA start URL offline. CI runs this check too. It does not emulate
Android's WebAPK packaging service or guarantee installation on a physical phone.

On Android, a Chrome-branded home-screen shortcut is not proof of a full PWA
installation. If installation falls back to a shortcut, verify the deployed
manifest/icons as well as the phone's Chrome and installation capabilities.
Avoid clearing site data while troubleshooting: Language Lab files and overrides
are stored in IndexedDB. Development mode intentionally disables the PWA; use a
production build to test installation and offline behavior.
