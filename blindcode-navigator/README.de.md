# BlindCode Navigator

Strukturorientierte **Audio-Navigation und Sonifikation** für blinde Java-Anfänger:innen —
eine VS-Code-Erweiterung (Bachelorarbeit-Prototyp). Statt Zeile für Zeile erfasst man Code
**nach seiner Struktur**: per Tastatur durch den Syntaxbaum springen, per Sprache hören „wo
bin ich", und per Ton die Verschachtelungstiefe wahrnehmen.

## Funktionen
- **Navigation nach Ebenen** („Überblick → Eintauchen"): hoch/runter wechselt zwischen den
  Geschwistern *einer* Ebene (z. B. Methode zu Methode); rechts taucht eine Ebene tiefer und
  sagt an, *was* die Ebene enthält; links geht wieder heraus. Technisches Rauschen (Klammern,
  Ausdrücke) wird übersprungen.
- **Kontext-Sprachausgabe**: bei jeder Bewegung wird der Ort vorgelesen, z. B.
  „Sonst-Zweig, in if-Anweisung, in Methode calculate, Klasse MathLogic".
  Mit **Alt+M** live kürzer stellbar — bis hin zu *stumm*: Dann navigiert man allein nach
  Gehör (schnell, ein Ton statt eines Satzes), und **Alt+W** bzw. **Alt+L** antworten
  weiterhin. Verstummen können also nur die automatischen Ansagen, nie eine Nachfrage —
  verlieren kann man sich dadurch nicht.
- **Sonifikation** *(derzeit macOS-only, siehe Hinweise)* — zwei Abbildungen für zwei Fragen:
  - *beim Navigieren* zählt die **Änderung**: tiefer verschachtelt = höherer Ton
    (pentatonisch; ab Tiefe > 6 Warnton). Konstante Dauer, damit schnelles Navigieren nicht
    auf den Ton warten muss.
  - *auf Anfrage* (Alt+W) zählt der **absolute Wert**: ein tiefer Ankerton, danach ein Klick
    je Ebene. Eindeutig ohne Referenzton und ohne musikalische Vorbildung; „nur Anker"
    bedeutet oberste Ebene (Klasse/Methode).
- **Gliederungs-Liste** (Alt+O): alle Knoten auf einmal, durchsuchbar (auch per Java-Schlüsselwort
  wie `else`, `for`, `return`) → direkter Sprung.
- **Baumansicht** (unteres Panel, über die Befehlspalette): zeigt die Struktur grafisch und
  welche Taste wohin führt — Werkzeug für sehende Tutor:innen und die Versuchsleitung,
  ausdrücklich kein Bestandteil des barrierefreien Nutzungspfads.
- **Status-Earcon beim Start**: Ein kurzes Zwei-Ton-Signal meldet „das Werkzeug läuft" —
  sehende Nutzer:innen sehen die Statusleiste, blinde hätten sonst kein Signal. Es ist
  *kein* Teil der Sonifikation (es bildet keine Struktur ab) und daher unabhängig von
  `blindcode.sonification.enabled`.
- **Fehlertoleranz**: Auch syntaktisch kaputter Code bleibt navigierbar — Syntaxfehler und
  fehlende Tokens (z. B. „fehlendes Semikolon") werden als eigene Stopps angesagt und mit
  einem dissonanten Fehler-Ton signalisiert (dank tree-sitter-Fehlertoleranz).

## Tastenkürzel (im Java-Editor)
| Taste | Aktion |
|-------|--------|
| Alt+↓ / Alt+↑ | nächstes / vorheriges Geschwister auf derselben Ebene |
| Alt+→ | eine Ebene hinein (Inhalt der Ebene wird angesagt) |
| Alt+← | eine Ebene heraus |
| Alt+L | aktuelle Code-Zeile vorlesen |
| Alt+O | Gliederungs-Liste (zu Knoten springen) |
| Alt+W | „Wo bin ich?" — aktuellen Pfad erneut vorlesen (mit Ton: Ankerton + ein Klick je Ebene, dann die Ansage) |
| Alt+M | Sprach-Ausführlichkeit durchschalten: volle Kette → Methode+Klasse → nur Element → **aus** |
| Alt+S | Sonifikation an/aus |

**Wenn nichts passiert:** Liegt der Tastaturfokus nicht im Editor, bleiben die Alt-Tasten
sonst folgenlos — und ein folgenloser Tastendruck ist von „kaputt" nicht zu unterscheiden.
Deshalb holt derselbe Tastendruck den Fokus zurück und meldet „Fokus zurück im Code";
ab dem nächsten Druck navigiert man normal weiter. (VS Codes eigenes **⌘1** tut dasselbe.)

Die **Baumansicht** hat bewusst *kein* Tastenkürzel: Sie ist ein Werkzeug der sehenden
Begleitung und wird über die Befehlspalette aufgerufen —
`BCNav: Baumansicht anzeigen (nur Tutor:in/Versuchsleitung)`.

## Einstellungen
| Einstellung | Bedeutung |
|-------------|-----------|
| `blindcode.studyCondition` | Studienmodus **A** (aus) / **B** (Navigation+Sprache) / **C** (+Sonifikation) |
| `blindcode.studyMode` | Sitzungsmodus (Standard aus). Sperrt Alt+S und Alt+M, damit eine Testperson die untersuchten Größen nicht selbst verstellen kann. Die Versuchsleitung ändert beides weiterhin über die Einstellungen |
| `blindcode.sonification.enabled` | Sonifikation an/aus |
| `blindcode.sonification.depthMode` | Tiefenberechnung für die Tonhöhe (`control` / `control-and-methods` / `full-scope`) |
| `blindcode.sonification.customDepthNodeTypes` | (Profi) eigene Knotentypen für die Tiefe |
| `blindcode.speech.verbosity` | Ausführlichkeit der Ansage: `high` (volle Kette, Standard) / `medium` (nur Methode+Klasse) / `low` (nur der Knoten) |
| `blindcode.speechMechanism` | `ariaLive` (Standard) oder `notification` (garantiert vorgelesen) |
| `blindcode.startSignal` | Hörbare Bestätigung beim Aktivieren: `earcon` (Standard, zwei Noten aufwärts) / `speech` (gesprochener Satz) / `off` |
| `blindcode.highlightCurrentNode` | Aktuellen Knoten im Code markieren (Standard an). Reine Sehhilfe für Begleitung und Vorführung; ohne Wirkung auf Sprache und Ton |

## Werkzeuge für sehende Begleitung

Tutor:innen und Versuchsleitung brauchen andere Hilfsmittel als die primäre Zielgruppe.
Diese sind **ausdrücklich kein Teil des barrierefreien Nutzungspfads** und liegen deshalb
alle in der Befehlspalette, nicht auf Tastenkürzeln:

| Befehl | Zweck |
|--------|-------|
| `BCNav: Baumansicht anzeigen` | Struktur grafisch, mit Richtungslegende und der Tiefe, die vertont wird (`♪ n`). Klick springt zum Knoten |
| `BCNav: Navigationsspur als CSV sichern` | Zeitstempel, Bedingung, Position, Knotenart — auswertbar in Excel |
| `BCNav: Navigationsspur zurücksetzen` | Zwischen zwei Proband:innen |
| `BCNav: Studienbedingung wählen` | A / B / C umschalten |

Dazu: die Statusleiste zeigt den **effektiven** Zustand (`BCNav: C · Sprache ✓ · Ton ✗`)
und warnt farblich, wenn Ton gewollt, aber auf dieser Plattform unmöglich ist. Das Panel
„BlindCode Sprachausgabe" führt eine Mitschrift aller Ansagen mit Zeitstempeln.

## Vorführung

`resources/demo/` enthält drei Beispielklassen samt Ablauf-Skript (`resources/demo/README.md`):
`Katze.java` (flach — Navigation auf einer Ebene), `Hund.java` (verschachtelt — Eintauchen,
else-Zweig, Herausgehen) und `KaputterHund.java` (compiliert **nicht** — zeigt, dass die
Struktur trotzdem begehbar bleibt und der Fehler benannt wird).

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
- **Sonifikation ist derzeit macOS-only.** Die Töne werden im Extension-Host als WAV
  synthetisiert und über den System-Player `afplay` abgespielt — kein Webview, keine
  Autoplay-Sperre, kein Klick nötig: Tastendruck → Ton. Auf Windows/Linux ist `afplay`
  nicht vorhanden, die Sonifikation bleibt dort still (Navigation und Sprachausgabe
  funktionieren normal weiter). **Für Studienbedingung C daher einen macOS-Rechner
  verwenden**, sonst entspricht C faktisch Bedingung B.
- Screenreader: auf VoiceOver/NVDA-Tastenkonflikte geprüft; bei Bedarf
  `blindcode.speechMechanism: "notification"`.
