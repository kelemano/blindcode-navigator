# Demo-Dateien (Vorführung / Präsentation)

Diese Dateien sind **nicht** Teil der Studie. Die Studien-Dateien liegen in
`resources/study/` und sind strukturell isomorph — dort darf nichts hinzukommen,
sonst bricht die Vergleichbarkeit.

Hier geht es nur darum, das Werkzeug vorzuführen: vertraute Domäne (Tiere), damit
das Publikum sich nicht auf den Code konzentrieren muss, sondern auf die Navigation.

## Vorschlag für den Ablauf (ca. 3 Minuten)

### 1. `Katze.java` — „auf einer Ebene bleiben"
Fünf gleich aufgebaute Methoden, keine Verschachtelung.

- Cursor auf die Klasse, **Alt+→**
  → *„Klasse Katze betreten, 5 Elemente: Methode schlafen, Methode fressen,
  Methode schnurren, Methode kratzen, Methode jagen"*
- **Alt+↓** mehrfach: man hört nur die Methodennamen, springt Methode zu Methode.
- **Alt+↓** am Ende → *„Letzter Knoten auf dieser Ebene"*.

**Kernaussage:** Man hört das Inhaltsverzeichnis, nicht den Text.

### 2. `Hund.java` — „eintauchen und wieder heraus"
Feld, vier Methoden, ein if/else und eine Schleife.

- **Alt+→** auf der Klasse → Inhaltsansage mit 5 Elementen.
- **Alt+↓** bis *„Methode schlafen"*, dann **Alt+→**
  → *„Methode schlafen betreten, 1 Element: if-Anweisung"*.
- **Alt+→** auf dem if
  → *„if-Anweisung betreten, 2 Elemente: Dann-Zweig, Sonst-Zweig"*.
- **Alt+↓** → *„Sonst-Zweig"*. Genau der Sprung, der beim zeilenweisen Lesen teuer ist.
- **Alt+←** mehrfach: Ebene für Ebene zurück nach oben.
- **Alt+W**: der Ort wird wiederholt; mit Ton zuerst Ankerton + ein Klick je Ebene.
- **Alt+L**: die rohe Code-Zeile, wenn man den konkreten Text braucht.

**Kernaussage:** Überblick zuerst, Details auf Abruf.

### 3. `KaputterHund.java` — der stärkste Punkt
In Zeile 4 fehlt ein Semikolon; die Datei **compiliert nicht**.

- Trotzdem: **Alt+→ / Alt+↓** navigieren normal weiter.
- In `bellen` erreicht man einen eigenen Knoten: *„fehlendes Semikolon"* —
  mit dissonantem Fehler-Earcon statt des Tiefen-Tons.

**Kernaussage:** Werkzeuge, die einen gültigen Syntaxbaum brauchen, versagen genau
dann, wenn Anfänger:innen sie am nötigsten hätten — denn Anfänger-Code ist die meiste
Zeit kaputt. Hier bleibt die Struktur begehbar und der Fehler wird benannt.

## Für die Vorführung nützlich

- **Alt+M** schaltet die Ausführlichkeit durch (volle Kette → Methode+Klasse →
  nur Element → aus). Für ein Publikum ist *„nur Element"* oft angenehmer, weil die
  volle Skopus-Kette bei jedem Schritt lang wird.
- **Alt+S** schaltet den Ton an/aus.
- Die **Baumansicht** (Befehlspalette → „BCNav: Baumansicht anzeigen") zeigt dem
  sehenden Publikum dieselbe Struktur mit farbiger Richtungslegende — sehr hilfreich
  auf dem Beamer, während man die Tastenfolge vorführt.
