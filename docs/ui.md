# Interactive UI model

Language Lab deliberately separates source configuration, application input, and runtime actions.

The key rule is:

~~~text
export -> Inspector
input  -> running application controls
button -> running application actions
~~~

These are language concepts. React is only the current renderer/host.

## export: Inspector configuration

~~~text
export text: title = "Calculator".
export integer: startingHealth = 100.
~~~

An exported declaration behaves like an ordinary typed variable while also exposing metadata to the IDE Inspector.

The source initializer remains the code default.

Changing an Inspector control does not rewrite source. The host stores a separate override and supplies it when the next program session starts.

Typical controls are:

| Language type | Inspector control |
|---|---|
| integer | numeric field |
| text | text field |
| boolean | toggle/checkbox |
| enum | select |
| array | simple array/JSON editor |

## input: application/user input

~~~text
input text: heroName = "Lyra".
input integer: amount = 1.
~~~

An input declaration appears in the running application's Output/App surface.

Input labels are derived from variable names:

~~~text
numberOne -> Number One
playerName -> Player Name
~~~

Like Inspector changes, user input overrides are separate from source text.

Inputs are top-level constructs.

## button: interactive event handler

~~~text
integer: count = 0.

button "Add", do.
    count = count + amount.
    print("Count:", count).
end button.
~~~

A button exposes a labelled action.

The body is ordinary language code and may contain declarations, assignments, conditionals, loops, function calls, and print statements.

Buttons are top-level constructs. A button label must be a non-empty quoted string.

## Runtime session lifecycle

Pressing Run creates a fresh program session.

The current lifecycle is:

1. take an immutable project snapshot;
2. resolve reachable modules and parse them with file-aware source spans;
3. statically analyze bindings/types and build an immutable Program;
4. send the project to the runtime Web Worker;
5. initialize each reachable module once in the new RuntimeSession;
6. evaluate declaration defaults in source order and apply matching Inspector/input overrides;
7. execute ordinary top-level statements;
8. expose serializable inputs, buttons, and output to the host UI.

After initialization, button presses execute against the current persistent globals.

Example:

~~~text
input integer: amount = 1.
integer: count = 0.

button "Add", do.
    count = count + amount.
    print("Count:", count).
end button.
~~~

Pressing Add repeatedly produces persistent state:

~~~text
Count: 1
Count: 2
Count: 3
~~~

It does not reinitialize count between presses.

## Button-local state

Each button press gets a fresh local action scope.

~~~text
button "Add", do.
    integer: temporary = 10.
    count = count + temporary.
end button.
~~~

temporary is recreated on each press.

count may persist because it is an outer/global variable.

## Functions and current inputs

Functions invoked by a button see the current global/input values, not just the values that existed when source was parsed.

~~~text
input integer: amount = 1.

function addAmount().
    count = count + amount.
end function.
~~~

If the user changes amount before pressing the button, addAmount sees the updated amount.

## Input values changed by program code

An input is still a language variable.

A button may assign it:

~~~text
input integer: health = 100.

button "Damage", do.
    health = health - 10.
end button.
~~~

The current session value changes, and the host's rendered control can reflect that value.

Button-driven mutations are runtime state. They do not rewrite the source default.

## State categories

Keep these separate:

| State | Meaning | Lifetime |
|---|---|---|
| source default | value written in .lang source | source/project |
| Inspector override | editor/user configuration for export | persisted workspace config |
| input override | user's application input | persisted UI config |
| runtime variable | live execution state | current run/session |
| application save data | explicit future program-controlled persistence | separate persistent storage |
| editor state | selection, panels, etc. | IDE preference |

Do not silently turn a runtime mutation into source code or save-game data.

## Output

print appends text output to the session console.

~~~text
print("Count:", count).
~~~

Clearing output does not reset runtime variables.

The roadmap separates the application surface and console more clearly as UI features grow.

## Stale source

The IDE treats source changes after Run as making the active session stale.

The intended user model is:

~~~text
edit source -> Run -> interact with that session
~~~

Do not let buttons misleadingly execute old source after the IDE knows the source has changed.

## Host independence

The language should not define an input as "a React input element" or a button as "an HTML button".

The language/runtime should expose a serializable UI model such as:

~~~text
input field -> name, type, current value, options
button      -> id, label, event handler
~~~

A host decides how that model is rendered.

That makes the same program model reusable by:

- the current browser IDE;
- a standalone HTML/web build;
- a future VS Code webview;
- a native shell;
- future game or UI hosts.

The appearance is host-specific. The semantics are language/runtime-specific.
