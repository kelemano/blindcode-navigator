# BlindCode Navigator

Strukturorientierte **Audio-Navigation und Sonifikation** für blinde Java-Anfänger:innen —
eine VS-Code-Erweiterung (Bachelorarbeit-Prototyp). Statt Zeile für Zeile erfasst man Code
**nach seiner Struktur**: per Tastatur durch den Syntaxbaum springen, per Sprache hören „wo
bin ich", und per Ton die Verschachtelungstiefe wahrnehmen.

## Funktionen
- **Navigation** durch die logische Code-Struktur (Klasse, Methode, if/else, Schleifen,
  Anweisungen) — technisches Rauschen (Klammern, Ausdrücke) wird übersprungen.
- **Kontext-Sprachausgabe**: bei jeder Bewegung wird der Ort vorgelesen, z. B.
  „Sonst-Zweig, in if-Anweisung, in Methode calculate, Klasse MathLogic".
- **Sonifikation**: tiefer verschachtelt = höherer Ton (pentatonisch; ab Tiefe > 6 Warnton).
- **Gliederungs-Liste** (Alt+O): alle Knoten auf einmal, durchsuchbar (auch per Java-Schlüsselwort
  wie `else`, `for`, `return`) → direkter Sprung.
- **Baumansicht** (Alt+T, unteres Panel): zeigt die Struktur grafisch und welche Taste wohin
  führt (Debug-/Tutor-Hilfe).
- **Fehlertoleranz**: Auch syntaktisch kaputter Code bleibt navigierbar — Syntaxfehler und
  fehlende Tokens (z. B. „fehlendes Semikolon") werden als eigene Stopps angesagt und mit
  einem dissonanten Fehler-Ton signalisiert (dank tree-sitter-Fehlertoleranz).

## Tastenkürzel (im Java-Editor)
| Taste | Aktion |
|-------|--------|
| Alt+↓ / Alt+↑ | nächster / vorheriger Knoten (Lesereihenfolge) |
| Alt+→ | nächstes Geschwister (Block überspringen) |
| Alt+← | eine Ebene heraus |
| Alt+O | Gliederungs-Liste (zu Knoten springen) |
| Alt+W | „Wo bin ich?" — aktuellen Pfad erneut vorlesen |
| Alt+S | Sonifikation an/aus |
| Alt+T | Baumansicht (Visualisierung/Debug) |

## Einstellungen
| Einstellung | Bedeutung |
|-------------|-----------|
| `blindcode.studyCondition` | Studienmodus **A** (aus) / **B** (Navigation+Sprache) / **C** (+Sonifikation) |
| `blindcode.sonification` | Sonifikation an/aus |
| `blindcode.sonification.depthMode` | Tiefenberechnung für die Tonhöhe (`control` / `control-and-methods` / `full-scope`) |
| `blindcode.sonification.customDepthNodeTypes` | (Profi) eigene Knotentypen für die Tiefe |
| `blindcode.speech.verbosity` | Ausführlichkeit der Ansage: `high` (volle Kette, Standard) / `medium` (nur Methode+Klasse) / `low` (nur der Knoten) |
| `blindcode.speechMechanism` | `ariaLive` (Standard) oder `notification` (garantiert vorgelesen) |

## Installation (VSIX)
```
code --install-extension blindcode-navigator-<version>.vsix
```
oder in VS Code: Extensions-Ansicht → „…" → **Install from VSIX…**

## Entwicklung
```
npm install
npm run compile           # TypeScript -> out/
npm run test:unit         # schnelle Unit-Tests (ohne VS Code)
npm run test:integration  # End-to-End im echten VS-Code-Host
npm run package           # VSIX bauen (@vscode/vsce)
```

## Hinweise
- Sprache: aktuell **Java**.
- Audio läuft in einem Webview (Web Audio API). Falls kein Ton: im Panel „BlindCode
  Sonifikation" einmal **Audio aktivieren** klicken (Autoplay-Sperre).
- Screenreader: auf VoiceOver/NVDA-Tastenkonflikte geprüft; bei Bedarf
  `blindcode.speechMechanism: "notification"`.
