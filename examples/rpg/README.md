# Goblin Arena RPG

A small turn-based RPG written entirely in Language Lab.

The example combines the original Goblin Arena combat prototype with the character creator built while testing Language Lab's interactive controls.

## What it demonstrates

- enum-backed inputs;
- grouped/labelled/ranged application inputs;
- records and member access;
- constants;
- typed function return values;
- persistent RuntimeSession state;
- `randomInteger`;
- buttons and user-facing actions;
- `on start` lifecycle handling;
- nested conditionals;
- stat-driven combat.

## Character stats

Each stat has a real gameplay effect:

| Stat | Effect |
|---|---|
| Strength | Adds to melee damage and heavily scales Power Attack |
| Dexterity | Chance to dodge the goblin's attack |
| Constitution | Raises maximum health |
| Wisdom | Improves potion healing |
| Intelligence | Improves Firebolt damage |
| Charisma | Chance to intimidate the goblin and make it lose its turn |

## Playing

1. Import this directory as a Language Lab project (or ZIP its contents with `langlab.json` at the root and use **Import project**).
2. Run `main.lang`.
3. Enter your name/gender and press **Roll Stats** as often as you like.
4. Press **Create Character** to lock the chosen stats into the runtime character.
5. Fight the goblin using **Attack**, **Power Attack**, **Cast Firebolt**, **Drink Potion**, or **Intimidate**.
6. After a victory, press **Fight New Goblin**. Each new goblin gains health and strength.

The input controls remain editable after character creation because dynamic UI visibility/disabled state is not yet a Language Lab feature. The game deliberately copies the chosen values into a `Stats` record when **Create Character** is pressed, so later input edits do not alter the finished character.

Potions persist across victories. Spell uses refresh for each new goblin. A new goblin also starts you at full health.

## Damage model

Normal melee damage:

```text
d6 + Strength
```

Power Attack:

```text
d6 + d6 + Strength * 2
```

Firebolt:

```text
d8 + Intelligence
```

Goblin attack:

```text
d6 + Goblin Strength
```

This is intentionally a compact example rather than a balanced RPG ruleset. Its main job is to be fun while exercising a broad slice of the language.
