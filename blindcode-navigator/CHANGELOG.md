# Änderungsprotokoll

Alle nennenswerten Änderungen an „BlindCode Navigator". Format angelehnt an
[Keep a Changelog](https://keepachangelog.com/de/1.1.0/).

## [Unveröffentlicht] — Barrierefreiheit, zweite Sonifikation, Werkzeuge für die Begleitung

### Behoben
- **Die erste Ansage einer Sitzung ging verloren.** Die Sprach-Webview bekam ihren Text,
  bevor ihr Skript geladen war; VS Code puffert solche Nachrichten nicht. Behoben durch
  einen `ready`-Handshake plus Zwischenpuffer. Betraf jeden Sitzungsbeginn im Standardmodus.
- **Alt+T war eine Sackgasse.** Die Taste öffnete die Baumansicht und zog den Tastaturfokus
  aus dem Editor — danach griff `editorTextFocus` nicht mehr und **alle** Alt-Tasten waren
  wirkungslos. Das Kürzel entfällt; der Befehl gibt den Fokus jetzt sofort zurück.
- **Die Statusanzeige nannte nur den Buchstaben der Bedingung.** Bei `C` mit stummem Ton
  stand dort trotzdem „Bedingung C" — die am schwersten zu bemerkende Fehlkonfiguration.
  Sie zeigt nun den effektiven Zustand samt Grund und warnt farblich.
- **Die Baumansicht zeigte eine andere Tiefe, als vertont wurde.** Einrückung folgte der
  Struktur-Tiefe, der Ton einer anderen Projektion. Beide sind jetzt sichtbar (`♪ n`).
- Die Baumansicht scrollt zum aktuellen Knoten; das Protokoll wächst nicht mehr bei jeder
  Cursorbewegung; der Debounce-Timer wird beim Deaktivieren abgeräumt.

### Neu — für blinde Nutzer:innen
- **Start-Earcon** (zwei Noten aufwärts, 440→660 Hz): meldet „das Werkzeug läuft".
  Sehende sahen das an der Statusleiste, blinde hatten dafür kein Signal.
  Einstellbar über `blindcode.startSignal` (`earcon` / `speech` / `off`).
- **Zähl-Earcon auf Alt+W**: Ankerton + ein Klick je Ebene — die **absolute** Tiefe.
  Zweite Sonifikations-Abbildung neben der Tonhöhe, weil beide verschiedene Fragen
  beantworten: beim Bewegen zählt die *Änderung*, auf Anfrage der *absolute Wert*.
  Tiefe 0 erklingt als Anker allein und ist nie stumm.
- **Alt+M** schaltet die Sprach-Ausführlichkeit durch, bis hin zu *stumm*. Stumm betrifft
  nur die automatischen Ansagen — **Alt+W und Alt+L antworten weiterhin**, deshalb kann
  man sich im stummen Modus nicht verlieren.

### Neu — für Tutor:innen und Versuchsleitung
- **Mitschrift der Sprachausgabe** mit Zeitstempeln im Panel (max. 200 Einträge).
  Nicht vom Screenreader gelesen, sonst käme jede Ansage doppelt.
- **Navigationsspur als CSV** exportierbar, inkl. Zurücksetzen zwischen Proband:innen.
  Zeitstempel, Bedingung, Position, Knotenart.
- **Markierung des aktuellen Knotens im Code** (`blindcode.highlightCurrentNode`).
  Reine Sehhilfe; in Bedingung A immer aus.
- **Demo-Dateien** in `resources/demo/` (Hund, Katze, KaputterHund) mit Vorführ-Skript.

### Geändert
- Bedingung **B** heißt jetzt korrekt „ohne **Struktur-Sonifikation**", nicht „ohne Ton":
  Das Start-Earcon ist ein Systemzustands-Signal und erklingt in B wie in C.
- Die Sonifikations-Schnittstelle kennt nun die **Bewegungsart** (`in`/`out`/`next`/`prev`/
  `jump`). Das Verhalten ist unverändert — die Trennung „was geschah" / „wie klingt es"
  ist zuerst nur als Schnittstelle eingezogen, damit alternative Abbildungen erprobbar sind.
- Extension-Icon ergänzt.

### Bekannte Einschränkung
- Bei **Alt+↓ / Alt+↑ ändert sich die Tonhöhe nie** — Geschwister liegen per Definition auf
  derselben Ebene. Die Tonhöhen-Abbildung stammt aus dem linearen Navigationsmodell; der
  Wechsel zum Ebenen-Modell hat ihre Voraussetzung entwertet. Siehe `known-issues.md`.

## [0.1.0] — Prototyp für die Studie

### Navigation
- Strukturorientierte Navigation über einen kanonischen **Outline-Baum** (tree-sitter-Java):
  Navigation und Sprachausgabe nutzen dieselbe Struktur („hören = navigieren").
- **Ebenen-Modell** („Überblick → Eintauchen"): `Alt+↑`/`Alt+↓` wechseln zwischen Geschwistern
  derselben Ebene, `Alt+→` taucht eine Ebene hinein und sagt den Inhalt der Ebene an,
  `Alt+←` geht heraus.
- `Alt+O` — Gliederungs-Liste aller Knoten, filterbar auch über englische Java-Schlüsselwörter
  (`else` findet den „Sonst-Zweig"), Enter springt.
- `Alt+W` — „Wo bin ich?": spricht den aktuellen Pfad erneut, ohne zu navigieren.
- `Alt+L` — liest die rohe Quelltextzeile des aktuellen Knotens vor.
- **Fehlertolerant**: `ERROR`- und `MISSING`-Knoten sind eigene Stopps („Syntaxfehler",
  „fehlendes Semikolon") — auch syntaktisch kaputter Code bleibt navigierbar.

### Sprachausgabe
- Deutsche Kontext-Ansage mit Skopus-Kette („Sonst-Zweig, in if-Anweisung, in Methode
  calculate, Klasse MathLogic"), Wichtigstes zuerst.
- Ausführlichkeit einstellbar: `blindcode.speech.verbosity` (`high`/`medium`/`low`).
- Zwei Ausgabemechanismen: aria-live-Webview (Standard) oder Benachrichtigung
  (`blindcode.speechMechanism`).

### Sonifikation
- Verschachtelungstiefe als Tonhöhe (pentatonisch, 220–880 Hz; Warnton ab Tiefe > 6),
  dissonanter Fehler-Earcon für kaputten Code.
- Tiefenabbildung konfigurierbar: `blindcode.sonification.depthMode`
  (`control`/`control-and-methods`/`full-scope`) plus `customDepthNodeTypes`.
- Töne werden im Extension-Host als WAV synthetisiert und über den System-Player `afplay`
  abgespielt — kein Webview, keine Autoplay-Sperre, kein Klick nötig.
  **Derzeit macOS-only**; auf anderen Plattformen bleibt die Sonifikation still.

### Studie
- Bedingungssteuerung `blindcode.studyCondition` — **A** (Extension inert, nur Screenreader),
  **B** (Navigation + Sprache), **C** (zusätzlich Sonifikation), inklusive Statusleisten-Anzeige
  und Befehl „Studienbedingung wählen".

### Werkzeuge
- Visuelle Baumansicht (`Alt+T`, unteres Panel) mit Richtungs-Legende — Debug-/Tutor-Hilfe,
  ausdrücklich kein Feature für blinde Nutzer:innen.
