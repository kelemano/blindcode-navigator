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

/** Skopus-Kette über die Outline-Eltern (innen → außen). */
function scopeQualifiers(node: OutlineNode): string[] {
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
        if (!isIfBehindBranch) {
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

/** Vollständige Orientierungsbeschreibung: Selbst + Skopus-Kette, durch ", " verbunden. */
export function buildContextString(node: OutlineNode): string {
    return [describeOutlineNode(node), ...scopeQualifiers(node)].join(', ');
}
