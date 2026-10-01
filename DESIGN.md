---
name: Language Lab
description: A dark, touch-ready programming workbench.
colors:
  workbench: "#10151d"
  panel: "#151c26"
  editor: "#0d1117"
  border: "#2a3442"
  text: "#e7edf5"
  muted: "#9aa9bc"
  accent: "#85b9ff"
  run: "#91bdff"
  run-text: "#101d32"
  run-hover: "#b0ceff"
  selected: "#283950"
  dialog: "#131c28"
typography:
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "14px"
  title:
    fontSize: "16px"
    fontWeight: 650
  label:
    fontSize: "13px"
  code:
    fontFamily: "JetBrains Mono, SFMono-Regular, Consolas, Liberation Mono, monospace"
    fontSize: "16px"
    lineHeight: 1.7
rounded:
  key: "4px"
  button: "6px"
  switch: "7px"
  dialog: "12px"
spacing:
  compact: "8px"
  standard: "16px"
  dialog: "20px"
components:
  button-run:
    backgroundColor: "{colors.run}"
    textColor: "{colors.run-text}"
    rounded: "{rounded.button}"
    padding: "0 17px"
  button-run-hover:
    backgroundColor: "{colors.run-hover}"
  view-selected:
    backgroundColor: "{colors.selected}"
    rounded: "{rounded.key}"
  dialog:
    backgroundColor: "{colors.dialog}"
    textColor: "{colors.text}"
    rounded: "{rounded.dialog}"
---

# Design System: Language Lab

## Overview

**Creative North Star: "The code-led workbench"**

The confirmed Operate direction preserves the established dark editor, system typography and blue accent. Dense, task-oriented chrome makes room for source and the running app. Touch controls remain explicit; the workbench has no decorative motion or marketing treatment.

**Key Characteristics:**

- Dark tonal surfaces with restrained blue selection and action cues.
- Visible Code, App and Side by side choices.
- Touch editing with hardware-keyboard access.

## Colors

Primary blue identifies Run, selected views, active file edges and keyboard focus. Neutral workbench, editor and dialog surfaces distinguish regions without competing with source. Muted text carries paths and status; full-strength text carries names and actions. Saved status uses green, saving uses amber, and errors use warm red surfaces. Color accompanies text, icons or selection semantics.

## Typography

The body uses the installed system-compatible Inter stack; code uses the monospace stack in frontmatter. These are CSS stacks, not promises of bundled font files. Dialog titles use the title role; tool labels use the label role. Paths and status use 11px, tabs use 12px. Code defaults to 16px and supports 14, 16, 18 and 20px. CodeMirror retains its One Dark syntax theme.

## Layout

The shell fills the viewport and keeps scrolling inside panes, tab strips and dialogs. It supports a 320px minimum width. Header, view toolbar and status frame the flexible document area. Code and App remain mounted while hidden, so changing layout does not recreate the runtime.

Side by side becomes available at 700px viewport width. Below that width a stored split preference displays Code; explicit App and Code choices remain available. The split divider is 9px wide and supports pointer dragging and arrow keys; the code share is constrained to 35–65%. At 1200px and above, an optional 240px Explorer sidebar is available. Below that, Files opens Explorer in a dialog. Below 900px, the bottom action dock replaces desktop tools. At heights of 500px or less, status/breadcrumb rows are hidden. On mobile widths of 899px or less, the bottom dock also becomes compact; wide, short desktop windows retain desktop controls without a duplicate dock.

Dialogs occupy the screen below 700px, including safe-area padding. Above that they are centered, normally capped at 520px (740px for wide dialogs), with scrollable bodies. Output padding is 20px, reduced to 16px below 700px. Mobile view/tab/status actions and touch keys have 44px minimum targets. The touch strip and file tabs scroll horizontally.

## Elevation & Depth

Chrome uses tonal layering and one-pixel borders. Selected views use an inset outline. Modal dialogs use the sole large structural shadow (`0 24px 100px #0008`) and a dark backdrop (`#02070cc2`). Layout changes are instant; no ornamental animation is introduced.

## Shapes

Small rectangular controls use gently rounded corners; file tabs retain straight edges. The segmented view switch encloses compact selected buttons. Dialogs use larger corners on wide screens and square, edge-to-edge frames on phones.

## Components

- **Run:** blue filled button with bold text, 44px minimum height and a lighter hover state. Stop uses a border.
- **Tools:** quiet icon or icon/text controls; hover adds a darker blue surface. Disabled buttons use 0.42 opacity and a not-allowed cursor.
- **View switch:** explicit labels and `aria-pressed` state. Side by side remains visible but disabled below its threshold with an explanatory title.
- **File tabs:** horizontally scrollable, with a blue active top edge and separately labelled close actions. Selection does not delete or reset a file.
- **Touch toolbar:** undo, redo, indentation, cursor movement, punctuation and snippet insertion. Button presses preserve editor focus.
- **Search and commands:** outlined input, 48px minimum input height, and 52px minimum result rows. Command selection has a blue inset edge.
- **Dialogs:** native `dialog`/`showModal` for Explorer, Inspector, search, Problems, settings, commands and export; close button, Escape and outside-backdrop dismissal. Focus stays within the modal.
- **Focus:** a visible 2px accent outline with -2px offset; search containers also use a focus-within outline.

## Do's and Don'ts

- **Do** keep source and running app as independent, persistent panes.
- **Do** retain explicit layout choice and labelled touch actions.
- **Do** preserve the dark code-editor identity and native dialog behavior.
- **Don't** reset runtime state when switching files or layouts.
- **Don't** add decorative motion or marketing presentation to workbench controls.
- **Don't** present a native build kit as a compiled executable.
