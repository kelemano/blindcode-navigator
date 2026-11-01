<div align="center">

# BlindCode Navigator

**Hear the structure of Java code instead of counting brackets.**

A Visual Studio Code extension that turns the syntax tree of a Java file into
a navigable outline, announces every step in speech, and maps nesting depth to
pitch — so a blind beginner can explore a program by its structure rather than
line by line.

[![CI](https://github.com/kelemano/blindcode-navigator/actions/workflows/ci.yml/badge.svg)](https://github.com/kelemano/blindcode-navigator/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%E2%89%A5%201.118-007ACC?logo=visualstudiocode&logoColor=white)](https://code.visualstudio.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![tree-sitter](https://img.shields.io/badge/parser-tree--sitter-brightgreen)](https://tree-sitter.github.io/tree-sitter/)
[![Tests](https://img.shields.io/badge/tests-104%20unit%20%2B%2011%20integration-success)](#testing)

</div>

---

## Contents

- [The problem](#the-problem)
- [What the extension does](#what-the-extension-does)
- [Key bindings](#key-bindings)
- [How it works](#how-it-works)
- [Installation](#installation)
- [Settings](#settings)
- [Study instrumentation](#study-instrumentation)
- [Project structure](#project-structure)
- [Testing](#testing)
- [Known limitations](#known-limitations)
- [Research context](#research-context)
- [License](#license)

---

## The problem

A screen reader turns source code into a sequence of characters. Indentation is
read out as `space space space`, braces are read as `left curly bracket`, and
the information that actually matters — *which statement belongs to which
block* — has to be reconstructed in working memory while the reader is also
trying to understand the program.

For an experienced developer that is friction. For a beginner it competes with
the very thing they are trying to learn. In the study accompanying this project,
all three participants described the same bottleneck before they had seen the
tool at all:

> *"Without the tool it is just an endless flat text. I could barely build the
> nesting in my head, because I was so busy with the arithmetic."*

---

## What the extension does

**Structure instead of lines.** The syntax tree is reduced to the elements worth
stopping at. A 20-line file with 133 syntax nodes becomes 11 navigation targets.

**Speech with meaning, not characters.** Instead of `left curly bracket`, each
step is announced as what it is and where it sits:

```
Statement, in for loop, in then branch, in method count, in class Counter
```

**Pitch as depth.** Every move plays a short tone whose pitch rises with nesting
depth, so the level is heard before the sentence ends. In the study, all three
participants inferred this mapping without being told.

**Works on broken code.** Beginners' code does not compile most of the time.
Error-tolerant parsing keeps the outline available, and error nodes stay
navigable targets rather than collapsing the tree.

---

## Key bindings

All shortcuts apply when the editor has focus and the file is recognised as Java.
Each one additionally returns focus to the source first, so a key press is never
silently without effect.

| Shortcut | Command | Effect |
|---|---|---|
| <kbd>Alt</kbd>+<kbd>→</kbd> | `navigateIn` | one level in; announces the level entered and lists its contents |
| <kbd>Alt</kbd>+<kbd>←</kbd> | `navigateOut` | one level out, to the enclosing element |
| <kbd>Alt</kbd>+<kbd>↓</kbd> | `navigateNextSibling` | next neighbour on the same level; skips everything nested inside |
| <kbd>Alt</kbd>+<kbd>↑</kbd> | `navigatePrevSibling` | previous neighbour on the same level |
| <kbd>Alt</kbd>+<kbd>W</kbd> | `whereAmI` | repeats the current path without moving |
| <kbd>Alt</kbd>+<kbd>L</kbd> | `readLine` | reads the raw source line of the current node |
| <kbd>Alt</kbd>+<kbd>O</kbd> | `showOutline` | filterable list of all nodes; Enter jumps to one |
| <kbd>Alt</kbd>+<kbd>S</kbd> | `toggleSonification` | sound on or off |
| <kbd>Alt</kbd>+<kbd>M</kbd> | `cycleSpeechMode` | cycles speech verbosity down to silent |

> On Apple keyboards <kbd>Alt</kbd> is the option key, labelled *alt* and marked
> with the option symbol.

The difference between *in* and *down* is the whole model: **down stays on the
level and skips what is inside**. To get from the `if` branch to the `else`
branch you go *in* first, then *down*.

---

## How it works

### From syntax tree to outline

The parser produces a full syntax tree in which every identifier and operator is
a node. The outline keeps only the elements worth stopping at — classes,
methods, control structures, branches, statements — and drops everything that
only exists to satisfy the grammar.

```java
public class Dog {
  private String name;

  public void sleep(int hours) {
    if (hours > 8) {
      System.out.println("too long");
    } else {
      System.out.println("rested");
    }
  }
}
```

becomes

```
class Dog
    field                  (2)
    method sleep           (4)
        if statement       (5)
            then branch    (5)
                statement  (6)
            else branch    (7)
                statement  (8)
```

Both branches of the `if` become siblings on the same level, so they are heard
as alternatives rather than one hanging below the other. Loop headers and
conditions produce no stop of their own: `hours > 8` is part of the `if`, not a
place to stand.

### Speech output without an API

The extension API offers no way to hand text to a screen reader. Output goes
through a hidden webview holding an `aria-live` region, so text is spoken
without moving keyboard focus out of the editor.

That path has a trap. The webview loads its script asynchronously, so the first
announcement of a session was posted before the receiver existed — and was lost
without any sign. The fix is a readiness acknowledgement plus a single-slot
buffer:

```ts
announce(text: string): void {
    const panel = this.ensurePanel();
    if (this.ready) {
        panel.webview.postMessage({ text });
    } else {
        this.pending = text;   // only the most recent one matters
    }
}

private ensurePanel(): WebviewPanel {
    // Register the receiver *before* loading the HTML, or the
    // acknowledgement itself is lost.
    panel.webview.onDidReceiveMessage(message => {
        if (message?.type !== 'ready') { return; }
        this.ready = true;
        if (this.pending !== undefined) {
            const text = this.pending;
            this.pending = undefined;
            panel.webview.postMessage({ text });
        }
    });
    panel.webview.html = this.html();
    return panel;
}
```

Only the newest pending announcement is kept: describing a position the user has
already left would mislead more than silence.

### Sound without a user gesture

Sonification originally used a Web Audio context inside a webview. Browser
autoplay policies require a user gesture in that panel — unreachable by keyboard
for the target group — so the first tone of every session was dropped. Tones are
now synthesised as WAV buffers in the extension host and played through the
system player. The trade-off is a binding to macOS for audio; speech and
navigation stay platform independent.

---

## Installation

Requires **Visual Studio Code ≥ 1.118** and **Node.js**. The extension uses
`tree-sitter` and `tree-sitter-java` as native modules, which are built during
installation.

```bash
git clone https://github.com/kelemano/blindcode-navigator.git
cd blindcode-navigator/blindcode-navigator
npm install
npm run compile
```

Press <kbd>F5</kbd> to launch a second VS Code window with the extension loaded,
or build an installable package:

```bash
npm run package      # produces blindcode-navigator-<version>.vsix
```

Open any `.java` file. The extension announces itself with the configured start
signal; the shortcuts above are then active.

---

## Settings

All settings live under `blindcode.*`.

| Key | Values | Default | Meaning |
|---|---|---|---|
| `studyCondition` | `A`, `B`, `C` | `C` | condition; `C` is the full feature set |
| `studyMode` | on, off | off | locks <kbd>Alt</kbd>+<kbd>S</kbd> and <kbd>Alt</kbd>+<kbd>M</kbd>, shows a lock in the status bar |
| `speech.verbosity` | `high`, `medium`, `low`, `off` | `high` | length of the scope chain; `off` affects automatic announcements only |
| `speechMechanism` | `ariaLive`, `notification` | `ariaLive` | output path to the screen reader |
| `startSignal` | `earcon`, `speech`, `off` | `earcon` | feedback when the extension activates |
| `highlightCurrentNode` | on, off | on | visual marker for a sighted observer |
| `sonification.enabled` | on, off | on | sound output |
| `sonification.depthMode` | `control`, `control-and-methods`, `full` | `control` | which node kinds count towards depth |
| `sonification.customDepthNodeTypes` | list | empty | additional syntax node types for depth counting |

---

## Study instrumentation

The extension was built to be evaluated, and parts of it exist only for that.

**Three conditions** are selectable at runtime: screen reader only, speech
without tone, speech with tone. The status bar names the *effective* state
rather than the letter, because a condition that silently fails to apply would
invalidate a session without anyone noticing.

**Navigation trace.** Every change of outline node is recorded with timestamp,
elapsed time, active condition, position and node kind, and exported as
semicolon-separated CSV with a byte order mark, so German spreadsheet software
opens it without rework (field names and markers are German, matching the
in-source language):

```csv
zeit_iso;ms_seit_start;bedingung;art;zeile;spalte;knotenart;ast_typ;notiz
2026-10-24T22:23:35.108Z;1;C;marke;;;;;Bedingung C · Sprache an · Ton an
2026-10-24T22:23:41.882Z;6775;C;knoten;2;3;method;method_declaration;
```

**Session mode** locks the two shortcuts that would let a participant switch off
the very variable under study with one key press.

---

## Project structure

```
blindcode-navigator/
├── src/
│   ├── parser.ts              # syntax tree via tree-sitter, cached per document
│   ├── navigator.ts           # outline tree; the four navigation operations
│   ├── contextSpeech.ts       # wording, scope chain, verbosity levels
│   ├── sonification.ts        # depth → pitch mapping
│   ├── wavSynth.ts            # tone rendering
│   ├── treeData.ts            # view model for the observer panel
│   ├── conditionManager.ts    # which channels are active per condition
│   │
│   ├── extension.ts           # activation, commands, status bar, trace
│   ├── editorNavigation.ts    # binds operations to cursor and output
│   ├── speech.ts              # live region, handshake, fallback
│   ├── sonificationPlayer.ts  # playback through the system player
│   └── treePanel.ts           # observer panel
│
├── resources/study/           # task files used in the evaluation
├── resources/demo/            # development samples, incl. a broken one
└── src/test/                  # unit and integration tests
```

The first seven modules never touch the editor API at run time. That split is
not decoration: it is why the core can be tested in 41 ms without starting an
editor, while the adapter layer is covered by integration tests in a real
instance.

---

## Testing

```bash
npm run test:unit          # 104 tests, no editor needed
npm run test:integration   # 11 tests in a real VS Code instance
npm test                   # both
```

One property is checked over *all* nodes of a file rather than on examples:
opposite keys cancel each other. It holds for all four navigation keys and —
since a late addition — for files containing syntax errors as well.

---

## Known limitations

- **Audio is macOS only.** Playback uses the system player. Speech and
  navigation work everywhere.
- **Pitch never changes on <kbd>Alt</kbd>+<kbd>↑</kbd> / <kbd>Alt</kbd>+<kbd>↓</kbd>.**
  Siblings are on the same level by definition. The pitch mapping was designed
  for a linear navigation model; moving to the level model removed its premise.
- **Depths 0 and 1 share a pitch.** Shallow structures are therefore not
  distinguishable by sound.
- **State is not accessible.** The outline makes *structure* available, not the
  *values* a program holds while being traced. Every feature request from the
  study participants concerned exactly this gap.
- **Java only.** The parser is language specific, though tree-sitter grammars
  exist for others.

---

## Research context

This extension is the practical part of a bachelor's thesis at TU Darmstadt,
*Structure-oriented audio navigation for blind programming beginners*
(Department of Computer Science, Computing Education Research).

It was evaluated in a within-subject study with three blind first-year students
comparing the three conditions above. Two findings shaped the code rather than
the other way round:

1. Participants described the tone as **confirmation of their own key press**,
   not as an indication of absolute depth — which is the opposite of what the
   design assumed.
2. Five messages reporting a key press without effect were shown only as editor
   notifications and never spoken. One participant got stuck on exactly that
   while learning the level model. In a purely auditory setting silence is the
   one response that cannot be interpreted: it is indistinguishable from a key
   that did not arrive, a crashed tool and a screen reader that stopped
   speaking. Fixed in `0.2.0`.

Source comments are in German because they reference sections of the thesis.
See [`ARCHITECTURE.md`](blindcode-navigator/ARCHITECTURE.md) for the design and
[`CHANGELOG.md`](blindcode-navigator/CHANGELOG.md) for the history.

---

## License

[MIT](LICENSE) © Olha Keleman
