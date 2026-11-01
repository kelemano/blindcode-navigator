# BlindCode Navigator

Structure-oriented **audio navigation and sonification** of Java source code for blind
programming beginners — a Visual Studio Code extension.

Instead of hearing code line by line, you move through its **structure**: jump along the
syntax tree with the keyboard, hear *where you are* in speech, and perceive nesting
depth as pitch.

> Prototype built for a bachelor's thesis in computer science education at TU Darmstadt.
> The German thesis is the authoritative account of the design rationale.
> A German version of this file is in [`README.de.md`](README.de.md); the architecture
> is described in [`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## What it does

**Level-based navigation — "overview, then dive in".**
Up and down move between siblings on *one* level, for instance method to method. Right
descends one level and announces what that level contains. Left comes back out.
Technical noise — brackets, expressions, loop headers — is skipped.

**Context speech.**
Every movement is spoken, innermost first:
`Sonst-Zweig, in if-Anweisung, in Methode calculate, Klasse MathLogic`.
Four verbosity levels, switchable at runtime down to *silent* — and even then `Alt+W`
and `Alt+L` still answer, so muting can never leave you lost.

**Sonification** *(macOS only, see Limitations)* — two mappings for two questions:

- *while navigating*, what matters is the **change**: deeper nesting sounds higher, on a
  pentatonic scale, with a warning tone beyond depth 6. Constant duration, so fast
  navigation never waits for a tone.
- *on request* (`Alt+W`), what matters is the **absolute value**: a low anchor tone,
  then one click per level. Unambiguous without a reference tone and without musical
  training; anchor alone means top level.

**Error-tolerant.**
Syntax errors and missing tokens become navigable nodes of their own, announced by name
("missing semicolon") and marked by a dissonant earcon. Navigation keeps working in the
state beginners' code is in most of the time.

---

## Requirements

| | |
|---|---|
| Visual Studio Code | 1.118 or newer |
| Node.js | 20 or newer |
| Operating system | macOS for audio; speech and navigation work anywhere |
| Screen reader | verified with VoiceOver; NVDA and JAWS untested |

---

## Build and run

```bash
git clone <repository-url>
cd blindcode-navigator/blindcode-navigator
npm install
npm run compile
```

Then open this folder in VS Code and press <kbd>F5</kbd>. A second window
(*Extension Development Host*) opens with the extension loaded. Open any `.java` file —
the extension activates on the Java language and shows its state in the status bar:

```
BCNav: C · Sprache ✓ · Ton ✓
```

To build an installable package instead:

```bash
npm run package      # produces blindcode-navigator-<version>.vsix
```

---

## Key bindings

All shortcuts use <kbd>Alt</kbd> (<kbd>⌥</kbd> on macOS) and are active only while a
Java editor has focus.

| Key | Action |
|---|---|
| <kbd>Alt</kbd>+<kbd>↓</kbd> | next sibling on the same level |
| <kbd>Alt</kbd>+<kbd>↑</kbd> | previous sibling |
| <kbd>Alt</kbd>+<kbd>→</kbd> | one level in, announcing the contents |
| <kbd>Alt</kbd>+<kbd>←</kbd> | one level out |
| <kbd>Alt</kbd>+<kbd>O</kbd> | outline list — type to filter, Enter to jump |
| <kbd>Alt</kbd>+<kbd>W</kbd> | "where am I?" — repeat the path without moving |
| <kbd>Alt</kbd>+<kbd>L</kbd> | read the raw source line |
| <kbd>Alt</kbd>+<kbd>S</kbd> | toggle sonification |
| <kbd>Alt</kbd>+<kbd>M</kbd> | cycle speech verbosity |

**If a key appears to do nothing**, keyboard focus is outside the editor. Press the same
key again — it brings focus back and says so; the next press navigates normally.

The outline list filters on both the German label and the English Java keyword, because
in a learner's head the else branch is usually just `else`.

---

## Settings

| Setting | Default | Meaning |
|---|---|---|
| `blindcode.studyCondition` | `C` | A, B or C — which channels are active |
| `blindcode.studyMode` | `false` | locks `Alt+S` and `Alt+M` during a session |
| `blindcode.speech.verbosity` | `high` | `high` · `medium` · `low` · `off` |
| `blindcode.speechMechanism` | `ariaLive` | `ariaLive` or `notification` |
| `blindcode.startSignal` | `earcon` | `earcon` · `speech` · `off` |
| `blindcode.sonification.enabled` | `true` | depth-to-pitch mapping |
| `blindcode.sonification.depthMode` | `control` | which node kinds count as a level |
| `blindcode.highlightCurrentNode` | `true` | sighted aid — highlight the current node |

---

## Tools for sighted companions

Not part of the accessible path; they support supervision and analysis.

| Command (⇧⌘P) | Purpose |
|---|---|
| `BCNav: Baumansicht anzeigen` | tree view with the current node, its four neighbours, and the depth the tone encodes |
| `BCNav: Studienbedingung wählen` | switch between conditions A, B and C |
| `BCNav: Navigationsspur als CSV sichern` | export the navigation trace |
| `BCNav: Navigationsspur zurücksetzen` | reset it between participants |

The tree view deliberately shows **two** depths: indentation follows structural depth,
while a `♪ n` badge shows the depth the tone actually encodes. They differ, and a
companion who sees one while the participant hears the other is misled.

---

## Development

```bash
npm run compile          # TypeScript → out/
npm run lint             # ESLint
npm run test:unit        # 104 unit tests, no editor needed, <0.1 s
npm run test:integration # 11 tests in a real editor instance (needs a display)
```

Domain logic lives in modules that never import `vscode` at runtime, which is what makes
the fast tier possible. See [`ARCHITECTURE.md`](ARCHITECTURE.md).

> **Note on comment language.** Public documentation is English; in-source comments are
> German, because they cite sections of the German thesis and use its domain vocabulary
> (`Dann-Zweig`, `Gliederungsbaum`). The extension's own speech output is German.

---

## Limitations

- **Audio is macOS-only.** `play()` is a no-op elsewhere and the status bar states why.
  Synthesis is portable; only the player call would need replacing.
- **Verified with VoiceOver** on macOS. NVDA and JAWS under Windows are untested.
- **Speech labels are German** and not localisable without rethinking word order.
- **Grammatical errors only.** Undeclared variables or type conflicts are outside the
  parser's reach and would require a language server.
- **Pitch is silent where siblings are concerned.** Siblings sit at the same depth by
  definition, so `Alt+↑` and `Alt+↓` never change the tone. Measured over the three
  study files: 36 of 111 possible moves change pitch, and none of the 30 within-level
  moves do. Sonifying *position within the level* instead would address this; the
  movement kind is already passed to the player to make that possible.

---

## License

See [`LICENSE`](../LICENSE).
