# Scene UI demo

This project demonstrates first-class Language Lab scenes and the richer app renderer.

It uses three scenes:

- `CharacterCreator`
- `Arena`
- `Victory`

Only the active scene's inputs and buttons are rendered. `go to SceneName.` changes the active scene while keeping the same RuntimeSession and module state.

The example also uses:

- `heading`
- `paragraph`
- `stat`
- `progress`
- `on enter`
- scene-local inputs/buttons

The Activity panel shows output produced in the current scene. Previous-scene log lines are intentionally hidden when navigation occurs so a game/application screen does not become one giant historical console.
