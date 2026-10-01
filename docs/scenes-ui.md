# Scenes and rich application UI

Scenes let a Language Lab project behave like a multi-screen application or game without restarting the RuntimeSession.

## Basic scene

~~~text
scene CharacterCreator.
    heading "Create Character".
    paragraph "Roll your stats, then continue.".

    input text: name = "Lyra".

    button "Continue", do.
        go to Arena.
    end button.
end scene.
~~~

A project with scenes starts on the first scene declared by the entry module. If the entry module declares none, the first reachable scene is used.

Only the active scene's scene-local inputs and buttons are exposed to the host UI.

Top-level inputs/buttons remain global and are visible regardless of the active scene.

## Scene transitions

~~~text
go to Arena.
~~~

A transition keeps the same RuntimeSession. Persistent module variables are not reinitialized.

The old scene's `on leave` handler runs before the active scene changes. The new scene's `on enter` handler then runs.

~~~text
scene Arena.
    on enter, do.
        print("A goblin appears!").
    end on.

    on leave, do.
        print("Leaving the arena.").
    end on.
end scene.
~~~

Scene names must be unique across all reachable project modules.

A scene may live in an imported .lang file. Cross-module game state still follows normal module boundaries; use public module APIs when scenes in different modules need to coordinate state.

## Scene display primitives

Scenes support presentation-only display statements.

### Heading

~~~text
heading "Goblin Arena".
~~~

### Paragraph

~~~text
paragraph "Defeat the goblin to continue.".
~~~

### Stat

~~~text
stat "Victories", victories.
stat "Strength", player.strength.
~~~

Stats are evaluated from current runtime state whenever the host receives a snapshot.

### Progress

~~~text
progress "Health", currentHealth, maxHealth.
~~~

The host renders a labelled progress bar plus the current/max values.

Progress expressions must evaluate to numbers.

Scene display expressions are read-only. They may use values, member/index access, arithmetic, comparisons and boolean operators, but they may not call functions. Rendering UI must never execute arbitrary user functions.

## Inputs and buttons

Inputs and buttons may be declared directly inside scenes.

~~~text
scene Settings.
    @range(0, 100, 5)
    input integer: volume = 50.

    button "Done", do.
        go to MainMenu.
    end button.
end scene.
~~~

Scene-local inputs are initialized once when the RuntimeSession starts. Their values persist while navigating away and back.

Persistent internal state should remain at module top level. A scene may declare input controls, not arbitrary private variables.

## Host lifecycle events inside scenes

Besides `enter` and `leave`, an active scene may handle host events such as update, keyDown, keyUp and pointerDown.

Only the active scene receives its scene-local host handlers. Top-level host handlers remain global.

## Output behavior

When a scene transition happens, the visible Activity log starts fresh for the new scene. The runtime itself remains alive; only previous-scene printed lines are hidden from the scene view.

This keeps a game UI from growing into one enormous historical console.

## Legacy compatibility

Programs without scenes behave as before:

- all top-level inputs render;
- all top-level buttons render;
- full output remains visible;
- no active-scene metadata is produced.

Scenes are an opt-in application structure.
