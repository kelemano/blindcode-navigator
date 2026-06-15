import type Parser = require('tree-sitter');

/**
 * Reine AST-Traversal-Logik (Komponente "Navigator", siehe Kap. 4.1).
 *
 * Diese Funktionen kennen weder VS Code noch den Editor. Sie nehmen einen
 * tree-sitter-Knoten entgegen und liefern den Zielknoten der jeweiligen
 * Navigationsrichtung oder `null`, wenn es kein Ziel gibt (Edge Case).
 *
 * Die strikte Trennung von der UI (separation of concerns) macht diese Logik
 * ohne laufende VS-Code-Instanz unit-testbar (M2 Definition of Done).
 *
 * --- Block-Transparenz (Designentscheidung M0/Kap. 4.2) ---
 * Anonyme strukturelle "Klammer-Körper" (block, class_body, …) sind KEINE
 * Navigationsziele. Die Navigation operiert auf einem gedachten Baum, in dem
 * diese Knoten herausgeschnitten ("gespliced") sind: ihre Kinder rücken an ihre
 * Stelle. So landet man auf bedeutungstragenden Knoten (if_statement,
 * for_statement, method_declaration, …) statt auf "Block, Block, Block".
 *
 * Begründung (Cognitive Load Theory, Kap. 2.2): das Ansagen leerer Block-Knoten
 * zwischen jedem sinnvollen Knoten erzeugt genau die extrinsische Last, die das
 * Plugin reduzieren soll. Es hält das Werkzeug außerdem vergleichbar mit
 * StructJumper, das die logische Hierarchie navigiert, nicht die Syntax-Klammern.
 *
 * Wichtig: Die Skopusgrenze geht dadurch NICHT verloren — sie wird in der
 * Kontext-Sprachausgabe (M3) aus dem echten Baum rekonstruiert ("in Methode X").
 */

/** Knotentyp der tree-sitter-java-Wurzel. */
const ROOT_TYPE = 'program';

/**
 * Strukturelle "Körper"-Knoten, die bei der Navigation transparent sind
 * (Klammer-Container ohne eigene Bedeutung). Erweiterbar.
 */
const STRUCTURAL_BODY_TYPES = new Set<string>([
    'block',
    'class_body',
    'constructor_body',
]);

/** Ist `node` ein transparenter struktureller Körper-Knoten? */
export function isStructuralBody(node: Parser.SyntaxNode): boolean {
    return STRUCTURAL_BODY_TYPES.has(node.type);
}

/**
 * Benannte Kinder im block-transparenten Baum: Körper-Knoten werden ersetzt
 * durch ihre eigenen (rekursiv transparenten) Kinder.
 */
function effectiveChildren(node: Parser.SyntaxNode): Parser.SyntaxNode[] {
    const result: Parser.SyntaxNode[] = [];
    for (const child of node.namedChildren) {
        if (isStructuralBody(child)) {
            result.push(...effectiveChildren(child));
        } else {
            result.push(child);
        }
    }
    return result;
}

/** Nächster Vorfahr, der kein struktureller Körper-Knoten ist (oder null). */
function effectiveParent(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
    let parent = node.parent;
    while (parent && isStructuralBody(parent)) {
        parent = parent.parent;
    }
    return parent ?? null;
}

/** Index von `node` (per stabiler tree-sitter-id) in einer Knotenliste. */
function indexById(nodes: Parser.SyntaxNode[], node: Parser.SyntaxNode): number {
    return nodes.findIndex(n => n.id === node.id);
}

/**
 * Normalisiert die Cursorposition: liegt der Cursor auf einem strukturellen
 * Körper-Knoten, wird zum ersten bedeutungstragenden Kind abgestiegen (oder, falls
 * der Körper leer ist, zum nächsten bedeutungstragenden Vorfahren aufgestiegen).
 * Dadurch starten alle vier Navigationsfunktionen auf einem sinnvollen Knoten.
 */
export function toMeaningfulNode(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
    if (!isStructuralBody(node)) {
        return node;
    }
    const firstChild = effectiveChildren(node)[0];
    return firstChild ?? effectiveParent(node);
}

/**
 * Elternknoten ("hoch im Baum", Alt+Up).
 * Überspringt strukturelle Körper-Knoten. Liefert `null`, wenn der Knoten bereits
 * auf oberster Ebene liegt (kein Elternknoten oder Elternknoten = Programmwurzel).
 */
export function findParent(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
    const parent = effectiveParent(node);
    if (!parent || parent.type === ROOT_TYPE) {
        return null;
    }
    return parent;
}

/**
 * Erstes bedeutungstragendes Kind ("rein in den Block", Alt+Down).
 * Strukturelle Körper-Knoten werden durchquert. Liefert `null` bei einem Blatt
 * ohne (bedeutungstragende) Kinder.
 */
export function findFirstChild(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
    return effectiveChildren(node)[0] ?? null;
}

/**
 * Nächstes bedeutungstragendes Geschwister ("weiter auf gleicher Ebene", Alt+Right)
 * im block-transparenten Baum. Liefert `null`, wenn es kein weiteres gibt.
 */
export function findNextSibling(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
    const parent = effectiveParent(node);
    if (!parent) {
        return null;
    }
    const siblings = effectiveChildren(parent);
    const index = indexById(siblings, node);
    if (index === -1) {
        return null;
    }
    return siblings[index + 1] ?? null;
}

/**
 * Vorheriges bedeutungstragendes Geschwister ("zurück auf gleicher Ebene", Alt+Left)
 * im block-transparenten Baum. Liefert `null`, wenn es kein vorheriges gibt.
 */
export function findPrevSibling(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
    const parent = effectiveParent(node);
    if (!parent) {
        return null;
    }
    const siblings = effectiveChildren(parent);
    const index = indexById(siblings, node);
    if (index <= 0) {
        return null;
    }
    return siblings[index - 1] ?? null;
}
