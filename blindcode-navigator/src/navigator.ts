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
 */

/** Knotentyp der tree-sitter-java-Wurzel. */
const ROOT_TYPE = 'program';

/**
 * Elternknoten ("hoch im Baum", Alt+Up).
 * Liefert `null`, wenn der Knoten bereits auf oberster Ebene liegt, d. h. wenn
 * es keinen Elternknoten gibt oder der Elternknoten die Programmwurzel ist.
 */
export function findParent(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
    const parent = node.parent;
    if (!parent || parent.type === ROOT_TYPE) {
        return null;
    }
    return parent;
}

/**
 * Erster benannter Kindknoten ("rein in den Block", Alt+Down).
 * Liefert `null` bei einem Blattknoten ohne benannte Kinder.
 */
export function findFirstChild(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
    return node.firstNamedChild ?? null;
}

/**
 * Nächster benannter Geschwisterknoten ("weiter auf gleicher Ebene", Alt+Right).
 * Liefert `null`, wenn es kein weiteres Geschwister gibt.
 */
export function findNextSibling(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
    return node.nextNamedSibling ?? null;
}

/**
 * Vorheriger benannter Geschwisterknoten ("zurück auf gleicher Ebene", Alt+Left).
 * Liefert `null`, wenn es kein vorheriges Geschwister gibt.
 */
export function findPrevSibling(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
    return node.previousNamedSibling ?? null;
}
