# Emberfall — The Last Beacon

A complete, replayable, four-encounter dungeon expedition written in Language Lab. No game logic is implemented in JavaScript or React.

## Play now

Open **Emberfall.html** in a current browser. It is the whole game, works offline, and needs no IDE. On phones whose file previewer blocks active HTML, open the file in a browser or host it on any static website.

Choose **Begin expedition**, name your hero and select a calling:

- **Warden:** 48 health, 2 armor, 7 power. A forgiving first run.
- **Duelist:** 38 health, 1 armor, 10 power. Faster kills.
- **Arcanist:** 34 health, 1 armor, 8 power. Extra potion and +5 Burst damage.

Pick a route before each encounter. The **Moonlit Road** pays 8 gold; the **Sunken Vault** has tougher enemies and pays 14. Defeat the Bellkeeper in encounter four to relight the beacon.

### Combat

Read **Enemy intent** before every action:

1. **Quick strike** — ordinary incoming damage.
2. **Heavy blow** — double incoming damage; Guard is useful.
3. **Gathering embers** — no enemy attack; a good time to heal.

**Strike** deals damage and generates focus. **Guard** generates focus and quarters incoming damage. **Burst** spends two focus for a large hit. **Drink potion** heals 45% of maximum health, rounded up, but spends your turn. Unavailable Burst/potion actions spend nothing. Killing an enemy prevents its attack.

Camps offer one free 12-health rest, permanent blade upgrades (8 gold) and potions (5 gold). Rest before leaving! Health, equipment, gold and potions survive scene transitions. New battles reset focus; new expeditions reset the character. Victory score rewards remaining health/gold and fewer turns.

There is no application save/load yet: closing, reloading or restarting discards the current expedition. Another expedition/Try again keeps your character-creation preferences, but resets gameplay state when you light the lantern.

## Edit in VS Code or Language Lab

Extract **Emberfall-project.zip**, open its folder in VS Code with the updated Language Lab extension, open `main.lang`, and press **Ctrl/Cmd+Enter**. Use **Language Lab: Export Standalone HTML** to distribute your version.

Alternatively import the ZIP into the browser IDE as a project. This is a multi-file project: importing only `main.lang` into the single-file runner cannot resolve `lib/rules.lang`.

Inspector configuration is author-facing: `danger` (1–3), `startingPotions` and `beaconName`. Player-facing `input` controls select name, calling, tactical hints and route. The default build uses danger 1. Increased danger is intentionally much harder.

## Language feature tour

| Feature | Where to look |
|---|---|
| Seven scenes, `go to`, active-only controls | Title → CreateHero → Crossroads → Battle → Camp → Dawn/Ashes |
| `on start`, `on enter`, `on leave` | Initial navigation, battle introduction, equipment summary |
| `heading`, `paragraph`, `stat`, `progress` | Scene declarations and live health/focus displays |
| `export` vs `input`, annotations | Author rules vs character/route controls, groups, ranges, labels, help |
| Enum, record, constant, typed arrays | Calling, Path, Hero, finalFloor, enemy/intent catalogs |
| Modules, public functions, typed returns | `lib/rules.lang`, called through `rules.*` |
| Persistent state, buttons, conditions | Turn resolution, shops, rest and replay |
| Custom signals and events | `battleWon(reward)` queues rewards and navigation |
| Comments, loops, `break`, `continue` | `rules.heroName` filters empty words and limits names to three words |
| Text helpers | `trim`, `split`, `size`, `join`, `upper` |
| Math helpers and random rolls | `clamp`, `floor`, `ceil`, `max`, `randomInteger` |

Persistent game state intentionally stays in the entry module; pure reusable rules live in their own module. Scene displays only read values, so computed labels are prepared in functions/handlers. This is a cohesive example of the recent features, not an exhaustive standard-library reference.

## Build the distributable from this repository

```sh
npm ci
npm run example:emberfall
```

This uses the existing standalone renderer/runtime and produces `dist/emberfall/Emberfall.html` and `dist/emberfall/Emberfall-project.zip`. The PR CI artifact **emberfall-game** contains both. Generated files are not checked into source control.

Tests cover all three callings reaching victory, defeat/retry, configuration, name normalization, unavailable actions, route rewards, shop costs, one-time rest, and an actual standalone browser playthrough on desktop/mobile.
