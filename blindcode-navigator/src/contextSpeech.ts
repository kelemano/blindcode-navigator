import type { OutlineNode, OutlineKind } from './navigator';

/**
 * Kontext-Sprachausgabe (Komponente "ContextSpeech", Kap. 4.3).
 *
 * Reine Logik ohne VS-Code-Abhängigkeit. Sie arbeitet auf demselben Outline-Baum
 * wie die Navigation (navigator.ts) — daher ist die angesagte Skopus-Kette genau die
 * Kette, die Alt+← (heraus) abläuft: „was man hört" = „was man navigiert".
 *
 * Format (Stefik 2011: Wichtigstes zuerst):
 *   "<Knoten>, <innerer Skopus>, …, in Methode X, Klasse Y"
 * z. B. "Sonst-Zweig, in if-Anweisung, in Methode calculate, Klasse MathLogic".
 */

/** Outline-Art → deutsche Selbst-Bezeichnung. */
const KIND_LABELS: Record<OutlineKind, string> = {
    class: 'Klasse',
    interface: 'Interface',
    enum: 'Enum',
    method: 'Methode',
    constructor: 'Konstruktor',
    field: 'Feld',
    if: 'if-Anweisung',
    'then-branch': 'Dann-Zweig',
    'else-branch': 'Sonst-Zweig',
    for: 'for-Schleife',
    foreach: 'for-each-Schleife',
    while: 'while-Schleife',
    do: 'do-while-Schleife',
    switch: 'switch-Anweisung',
    try: 'try-Block',
    catch: 'catch-Block',
    finally: 'finally-Block',
    sync: 'synchronized-Block',
    labeled: 'markierte Anweisung',
    return: 'return-Anweisung',
    break: 'break-Anweisung',
    continue: 'continue-Anweisung',
    throw: 'throw-Anweisung',
    yield: 'yield-Anweisung',
    assert: 'assert-Anweisung',
    variable: 'Variablendeklaration',
    statement: 'Anweisung',
    lambda: 'Lambda-Ausdruck',
    error: 'Syntaxfehler',
    missing: 'fehlender Code',
};

/** MISSING-Token → konkrete deutsche Beschreibung (z. B. „fehlendes Semikolon"). */
const MISSING_LABELS: Record<string, string> = {
    ';': 'fehlendes Semikolon',
    '}': 'fehlende schließende geschweifte Klammer',
    '{': 'fehlende öffnende geschweifte Klammer',
    ')': 'fehlende schließende Klammer',
    '(': 'fehlende öffnende Klammer',
    ']': 'fehlende schließende eckige Klammer',
    '[': 'fehlende öffnende eckige Klammer',
};

/**
 * Versteckte Such-Stichwörter je Outline-Art — vor allem die englischen Java-
 * Schlüsselwörter, damit die Gliederungs-Liste (Alt+O) auch mit den Wörtern aus
 * dem Quelltext filtert (z. B. „else" findet „Sonst-Zweig"). Die deutschen Labels
 * werden zusätzlich mitdurchsucht (siehe outlineMatches), daher hier nur die
 * Ergänzungen/Synonyme.
 */
const KIND_KEYWORDS: Record<OutlineKind, string> = {
    class: 'class',
    interface: 'interface',
    enum: 'enum',
    method: 'method',
    constructor: 'constructor',
    field: 'field',
    if: 'if',
    'then-branch': 'then dann if',
    'else-branch': 'else sonst',
    for: 'for',
    foreach: 'for foreach for-each',
    while: 'while',
    do: 'do',
    switch: 'switch',
    try: 'try',
    catch: 'catch',
    finally: 'finally',
    sync: 'synchronized',
    labeled: 'label',
    return: 'return',
    break: 'break',
    continue: 'continue',
    throw: 'throw',
    yield: 'yield',
    assert: 'assert',
    variable: 'variable var',
    statement: 'statement call aufruf',
    lambda: 'lambda',
    error: 'error fehler syntax syntaxfehler',
    missing: 'missing fehlt fehlend fehler semikolon klammer',
};

/** Outline-Arten mit Namen (über das 'name'-Feld). */
const NAMED_KINDS = new Set<OutlineKind>([
    'class', 'interface', 'enum', 'method', 'constructor',
]);

function nameOf(node: OutlineNode): string | null {
    return node.astNode.childForFieldName('name')?.text ?? null;
}

/** Selbst-Beschreibung eines Outline-Knotens, z. B. "Sonst-Zweig", "Methode calculate". */
export function describeOutlineNode(node: OutlineNode): string {
    // Fehlender Token konkret benennen (z. B. „fehlendes Semikolon").
    if (node.kind === 'missing') {
        return MISSING_LABELS[node.astNode.type] ?? `fehlender Token „${node.astNode.type}"`;
    }
    const label = KIND_LABELS[node.kind];
    if (NAMED_KINDS.has(node.kind)) {
        const name = nameOf(node);
        return name ? `${label} ${name}` : label;
    }
    return label;
}

/**
 * Skopus-Qualifizierer eines Eltern-Outline-Knotens ("in Methode X", "Klasse Y",
 * "im Dann-Zweig", "in for-Schleife", …) oder null, wenn der Knoten keinen Skopus
 * beiträgt (z. B. eine einfache Anweisung als Elternteil bei verschachtelten Stopps).
 */
function scopeQualifier(node: OutlineNode): string | null {
    switch (node.kind) {
        case 'class': {
            const name = nameOf(node);
            return name ? `Klasse ${name}` : 'in anonymer Klasse';
        }
        case 'interface': {
            const name = nameOf(node);
            return name ? `Interface ${name}` : 'in einem Interface';
        }
        case 'enum': {
            const name = nameOf(node);
            return name ? `Enum ${name}` : 'in einem Enum';
        }
        case 'method': {
            const name = nameOf(node);
            return name ? `in Methode ${name}` : 'in einer Methode';
        }
        case 'constructor':
            return 'im Konstruktor';
        case 'if':
            return 'in if-Anweisung';
        case 'then-branch':
            return 'im Dann-Zweig';
        case 'else-branch':
            return 'im Sonst-Zweig';
        case 'for':
            return 'in for-Schleife';
        case 'foreach':
            return 'in for-each-Schleife';
        case 'while':
            return 'in while-Schleife';
        case 'do':
            return 'in do-while-Schleife';
        case 'switch':
            return 'in switch-Anweisung';
        case 'try':
            return 'im try-Block';
        case 'catch':
            return 'im catch-Block';
        case 'finally':
            return 'im finally-Block';
        case 'sync':
            return 'im synchronized-Block';
        case 'lambda':
            return 'in Lambda-Ausdruck';
        default:
            return null;
    }
}

/**
 * Ausführlichkeit der Sprachausgabe:
 *  - high   = volle Skopus-Kette (Standard, Studienverhalten)
 *  - medium = nur die „Anker"-Skopusse (Methode/Konstruktor/Klasse/…), ohne
 *             Zwischen-Kontrollstrukturen → kürzer bei tiefer Verschachtelung
 *  - low    = nur die Selbst-Beschreibung
 */
export type SpeechVerbosity = 'high' | 'medium' | 'low';

/**
 * Sprach-Modus = Ausführlichkeit plus der Zustand `off`.
 *
 * `off` schaltet nur die AUTOMATISCHEN Ansagen (bei jeder Navigation) stumm; die
 * ausdrücklich angefragten (Alt+W „Wo bin ich?", Alt+L „Zeile vorlesen") sprechen
 * weiter. Dadurch ist der stumme Modus gefahrlos: Man navigiert schnell allein nach
 * Gehör und kann jederzeit nachfragen, ohne sich verlieren zu können.
 */
export type SpeechMode = SpeechVerbosity | 'off';

/** Reihenfolge, die Alt+M durchschaltet (schließt sich zum Ring). */
export const SPEECH_MODE_CYCLE: readonly SpeechMode[] = ['high', 'medium', 'low', 'off'];

/** Selbstansage je Modus — man hört immer, wo man gelandet ist. */
export const SPEECH_MODE_LABELS: Record<SpeechMode, string> = {
    high: 'Sprache: volle Kette',
    medium: 'Sprache: Methode und Klasse',
    low: 'Sprache: nur das Element',
    off: 'Sprache aus. Alt+W und Alt+L sprechen weiterhin.',
};

/** Nächster Modus im Ring (Alt+M). */
export function nextSpeechMode(current: SpeechMode): SpeechMode {
    const index = SPEECH_MODE_CYCLE.indexOf(current);
    return SPEECH_MODE_CYCLE[(index + 1) % SPEECH_MODE_CYCLE.length];
}

/** Ausführlichkeit für AUSDRÜCKLICH angeforderte Ansagen: `off` → volle Auskunft. */
export function explicitVerbosity(mode: SpeechMode): SpeechVerbosity {
    return mode === 'off' ? 'high' : mode;
}

/** „Anker"-Skopusse, die in medium erhalten bleiben (das namentliche „wo"). */
const ANCHOR_KINDS = new Set<OutlineKind>([
    'method', 'constructor', 'class', 'interface', 'enum',
]);

/** Skopus-Kette über die Outline-Eltern (innen → außen), gefiltert nach Ausführlichkeit. */
function scopeQualifiers(node: OutlineNode, verbosity: SpeechVerbosity): string[] {
    if (verbosity === 'low') {
        return [];
    }
    const out: string[] = [];
    let child = node;
    let current = node.parent;
    while (current) {
        // Ein if direkt über seinem Zweig nicht doppelt nennen: "im Sonst-Zweig"
        // impliziert bereits das if. (Beim Hineinnavigieren via Alt+← wird das if
        // weiterhin als eigener Knoten angesagt — Kohärenz bleibt erhalten.)
        const isIfBehindBranch =
            current.kind === 'if' &&
            child !== node && // nur wenn der Zweig als Qualifizierer auftritt, nicht als Selbst
            (child.kind === 'then-branch' || child.kind === 'else-branch');
        // medium: nur Anker-Skopusse (Methode/Klasse/…), keine Zwischenstrukturen.
        const includeByVerbosity = verbosity === 'high' || ANCHOR_KINDS.has(current.kind);
        if (!isIfBehindBranch && includeByVerbosity) {
            const qualifier = scopeQualifier(current);
            if (qualifier) {
                out.push(qualifier);
            }
        }
        child = current;
        current = current.parent;
    }
    return out;
}

/**
 * Vollständige Orientierungsbeschreibung: Selbst + Skopus-Kette, durch ", " verbunden.
 * `verbosity` steuert, wie viel Skopus genannt wird (Standard high = volle Kette).
 */
export function buildContextString(node: OutlineNode, verbosity: SpeechVerbosity = 'high'): string {
    return [describeOutlineNode(node), ...scopeQualifiers(node, verbosity)].join(', ');
}

/**
 * Kurzliste der Kinder eines Knotens (deren Selbst-Beschreibungen), z. B.
 * „if-Anweisung, return-Anweisung". Leer, wenn der Knoten keine tiefere Ebene hat.
 */
export function describeChildrenSummary(node: OutlineNode): string {
    return node.children.map(describeOutlineNode).join(', ');
}

/**
 * Ansage beim Eintauchen (Alt+→) in einen Knoten: benennt die betretene Ebene und
 * zählt ihren Inhalt auf — „Überblick zuerst". Beispiel:
 *   „Methode calculate betreten, 2 Elemente: if-Anweisung, return-Anweisung".
 * Ohne Kinder → „… hat keine tiefere Ebene".
 */
export function buildEntryAnnouncement(node: OutlineNode): string {
    const count = node.children.length;
    if (count === 0) {
        return `${describeOutlineNode(node)} hat keine tiefere Ebene`;
    }
    const noun = count === 1 ? 'Element' : 'Elemente';
    return `${describeOutlineNode(node)} betreten, ${count} ${noun}: ${describeChildrenSummary(node)}`;
}

/**
 * Durchsuchbarer Text eines Knotens für die Gliederungs-Liste (Alt+O): deutsches
 * Label PLUS englische Java-Schlüsselwörter. Damit findet sowohl „Sonst-Zweig" als
 * auch „else" denselben Knoten.
 */
export function outlineSearchText(node: OutlineNode): string {
    return `${describeOutlineNode(node)} ${KIND_KEYWORDS[node.kind]}`.toLowerCase();
}

/**
 * Filter-Treffer für die Gliederungs-Liste: jedes (durch Leerzeichen getrennte)
 * Such-Token muss im durchsuchbaren Text vorkommen (Teilstring, klein geschrieben).
 * Leere Eingabe = Treffer (alles anzeigen).
 */
export function outlineMatches(node: OutlineNode, query: string): boolean {
    const haystack = outlineSearchText(node);
    return query
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .every(token => haystack.includes(token));
}
