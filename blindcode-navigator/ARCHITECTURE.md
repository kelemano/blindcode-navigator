# Architecture

BlindCode Navigator is a Visual Studio Code extension that makes Java source code
navigable by structure rather than by line, for developers who read code through a
screen reader. It is the prototype built for a bachelor's thesis in computer science
education; the German thesis text is the authoritative description of *why* each
decision was made, and in-source comments reference its sections.

This document describes *how* the code is organised.

---

## Design constraint that shapes everything

Three output channels — keyboard navigation, spoken context, and non-speech sound —
must describe **the same structure at all times**. If the tree you move through and the
tree you hear ever diverged, the user would build a mental model of something that does
not exist.

That single requirement produces the layering below: one canonical structure model,
computed once, consumed by every channel.

A second constraint follows from it: the domain logic must be testable **without a
running editor**, so that design questions can be answered by experiment rather than
decided up front.

---

## Layers

```
┌──────────────────────────────────────────────────────────┐
│  Visual Studio Code                                      │
│  keyboard · editor · screen reader                       │
└───────────────────────────┬──────────────────────────────┘
                            │  commands, cursor, webviews
┌───────────────────────────┴──────────────────────────────┐
│  ADAPTER LAYER            imports `vscode` at runtime    │
│                                                          │
│  extension.ts           activation, 17 key bindings,     │
│                         condition gating, status bar,    │
│                         navigation trace (CSV)           │
│  editorNavigation.ts    key command → tree operation,    │
│                         cursor sync, edge messages       │
│  speech.ts              hands text to the screen reader  │
│                         through a hidden aria-live region│
│  sonificationPlayer.ts  renders WAV once, plays via      │
│                         `afplay` (macOS)                 │
│  treePanel.ts           webview for sighted companions   │
└───────────────────────────┬──────────────────────────────┘
                            │  calls only downward
┌───────────────────────────┴──────────────────────────────┐
│  CORE                     no runtime `vscode` dependency │
│                                                          │
│  navigator.ts           outline tree + the four moves    │
│  contextSpeech.ts       node → German sentence           │
│  sonification.ts        node → tone parameters           │
│  wavSynth.ts            tone parameters → PCM bytes      │
│  treeData.ts            outline → rows for the panel     │
│  conditionManager.ts    study condition → feature set    │
│  parser.ts              tree-sitter + per-document cache │
└───────────────────────────┬──────────────────────────────┘
                            │
                  tree-sitter + tree-sitter-java
```

**The dependency graph has no edge from core to adapter.** Seven of twelve modules carry
no runtime import of `vscode`; `parser.ts` needs only its *types* and uses a type-only
import, which disappears at compile time.

The payoff is measurable: 104 unit tests cover the structure model, speech assembly,
depth mapping and tone synthesis and run in under a tenth of a second, while only
eleven integration tests need a real editor instance.

---

## The outline tree

`navigator.ts` is the heart. `buildOutline(root)` reduces a tree-sitter syntax tree to
the places a learner would *name*:

```ts
interface OutlineNode {
  astNode:  Parser.SyntaxNode;   // the underlying tree-sitter node
  kind:     OutlineKind;         // 'class' | 'method' | 'if' | 'then-branch' | …
  parent:   OutlineNode | null;
  children: OutlineNode[];
  index:    number;              // position in reading order
}

interface Outline {
  linear: OutlineNode[];               // pre-order, i.e. reading order
  byAstId: Map<number, OutlineNode>;   // syntax node → outline node
}
```

For a 28-line example file, 199 syntax nodes collapse to 17 navigation targets.

Two rules produce that reduction:

1. **What counts as a stop.** Classes, interfaces, enums, methods, constructors, fields,
   every control structure, and the single statement. Identifiers, modifiers, parameter
   lists and expressions are traversed but never become a stop.

2. **Where "inward" leads.** Always into the *body* of a construct, never into its head:
   into a method's body, into a loop's body. A bare block is transparent and hands its
   statements to the level above. Placing the cursor inside a head — the counter of a
   `for` loop, say — resolves to the enclosing construct.

`if` statements get special treatment: both branches become children of the `if`, and
the else branch only when it exists. Then-branch and else-branch therefore sit at the
same level and are audible as alternatives rather than one nested below the other.

### Error tolerance

tree-sitter's `ERROR` and `MISSING` nodes are first-class outline stops
(`kind: 'error' | 'missing'`). A missing semicolon becomes a navigable node under the
statement it belongs to, reachable with the same keys as anything else. There is no
separate error mode and no separate error list — which is why navigation keeps working
in the state beginners' code is in most of the time.

### Movement

Four operations, four keys:

| Function | Key | Moves to |
|---|---|---|
| `navNextSibling` | `Alt+↓` | next sibling on the same level |
| `navPrevSibling` | `Alt+↑` | previous sibling |
| `navIn` | `Alt+→` | first child |
| `navOut` | `Alt+←` | parent |

`navDown` and `navUp` walk reading order instead. They are **bound to no key** — they
survive from an earlier linear model and are kept as tree operations for tests.

Two guarantees hold over every node of the test fixtures, including broken source:
opposing keys are true inverses, and every element is reachable from the class using
only `Alt+→` and `Alt+↓`.

---

## Depth is a projection, not a second tree

The spoken path and the sonified depth come from the *same* outline tree, but count
levels differently:

- `outlineDepth(node)` — structural depth, used for indentation in the tree panel.
- `sonificationDepth(node, config)` — the depth that becomes pitch. In the default
  `control` mode, classes, methods and branch wrappers do **not** count, so the tone
  answers "how deep am I in the control flow", not "how deep am I in the tree".

Keeping these apart matters in practice: the tree panel shows both, because a companion
who sees one depth while the participant hears another is misled at exactly the moment
they are trying to help. A unit test asserts that the panel's tone-depth badge equals
`sonificationDepth` for every node.

---

## Audio

Tone parameters are pure data (`ToneCommand`), produced by `sonification.ts` and
rendered to 16-bit PCM by `wavSynth.ts` — both free of any platform dependency.

`sonificationPlayer.ts` writes eighteen WAV files once into the extension's global
storage (six depth steps, a warning tone, an error earcon, a start signal and nine
counting earcons) and plays them through the macOS system player `afplay`.

The first implementation used the Web Audio API inside a webview. It was functionally
correct and unusable: browser autoplay policy keeps audio silent until the user clicks
inside the panel, and that panel had no keyboard route and could not be found without
looking at the screen. The tool built to eliminate silent failures produced the most
severe one of all. Moving synthesis out of the webview is what guarantees that a key
press produces a sound.

The cost is a macOS binding: `play()` is a no-op on other platforms, and the status bar
states the reason in plain words. Synthesis itself is portable — only the player call
would need replacing.

---

## Speech

The extension API offers no way to hand text to a screen reader. The prototype keeps a
minimal webview open containing an `aria-live` region; text inserted there is spoken
without the keyboard focus leaving the editor. A notification-based fallback exists
behind a setting.

The webview loads its script asynchronously, so the first announcement of a session was
reliably discarded — invisible to a sighted observer, but for a blind user the first
announcement after opening a file is the only statement of where they are. A ready
handshake now holds back exactly one announcement until the webview reports in; if a
newer one arrives while waiting it replaces the older, because a late description of a
position already left is worse than none.

Speech is triggered **by navigation only**. Moving the cursor with plain arrow keys or
the mouse updates the internal position, the highlight and the tree panel, but says
nothing — otherwise the extension would talk over the screen reader during editing.

---

## Study instrumentation

Two requirements serve measurement rather than the tool, and would be removed for
production use:

- **Navigation trace.** Every position change is recorded with a timestamp, elapsed
  session time, active condition, line, column, node kind and syntax type, exportable
  as semicolon-separated CSV with a byte-order mark. Logged only on an actual node
  change, so repeated presses at a level boundary do not inflate it.

- **Session mode.** `blindcode.studyMode` locks the shortcuts that would let a
  participant change the manipulated variables (`Alt+S`, `Alt+M`). Without it, one key
  press would silently turn a condition-C session into condition B while the protocol
  still claims C. Deliberately a separate setting rather than tied to the condition,
  because the default condition `C` also means "the full product outside the study".

`conditionManager.ts` maps the study condition (A, B, C) onto the active feature set,
statelessly, so that the mapping itself is unit-testable.

---

## Testing

Two tiers, both run by CI on every push:

| Tier | Location | Needs an editor | Count |
|---|---|---|---|
| Unit | `src/test/unit/**` | no | 104 |
| Integration | `src/test/integration/**` | yes (xvfb in CI) | 11 |

Two properties are asserted over *all* nodes rather than examples: that opposing keys
cancel out, and that the panel's displayed tone depth equals the computed one.

The three task files used in the study are structurally identical — verified by running
the outline builder over all three and comparing the resulting sequence of node kind and
depth, not by eye.

---

## Known limitations

- Audio playback is macOS-only.
- Verified with VoiceOver on macOS; NVDA and JAWS under Windows are untested.
- Integration tests need a display and therefore run only in CI.
- All speech labels are German and not localisable without rethinking word order.
- The parser sees grammatical errors only; undeclared variables or type conflicts would
  require a language server.
