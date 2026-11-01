import Parser = require('tree-sitter');
// Nur als Typ importiert: parser.ts hat dadurch keine Laufzeit-Abhängigkeit zu
// VS Code und ist in reinem Node (mocha) unit-testbar.
import type * as vscode from 'vscode';

const JavaLanguage = require('tree-sitter-java');

const parser = new Parser();
parser.setLanguage(JavaLanguage);

interface CacheEntry {
    tree: Parser.Tree;
    version: number;
}

const treeCache = new Map<string, CacheEntry>();

export function getAST(document: vscode.TextDocument): Parser.Tree {
    const uri = document.uri.toString();
    const cached = treeCache.get(uri);
    if (cached && cached.version === document.version) {
        return cached.tree;
    }
    const text = document.getText();
    // Vollständiges Neu-Parsen (kein inkrementelles Wiederverwenden des alten Baums):
    // tree-sitter setzt für inkrementelles Parsen voraus, dass auf dem alten Baum
    // vorher tree.edit(...) für jede Änderung aufgerufen wurde. Da wir das nicht
    // verfolgen, würde ein übergebener alter Baum nach Edits einen TEILWEISE FALSCHEN
    // Baum liefern. Die Java-Dateien sind klein → ein voller Parse ist vernachlässigbar
    // und immer korrekt. Der versionsbasierte Cache oben verhindert unnötiges Neu-Parsen.
    const tree = parser.parse(text);
    treeCache.set(uri, { tree, version: document.version });
    return tree;
}

export function getNodeAtCursor(
    tree: Parser.Tree,
    position: vscode.Position
): Parser.SyntaxNode {
    return tree.rootNode.descendantForPosition({
        row: position.line,
        column: position.character,
    });
}

export function getNamedNodeAtCursor(
    tree: Parser.Tree,
    position: vscode.Position
): Parser.SyntaxNode {
    return tree.rootNode.namedDescendantForPosition({
        row: position.line,
        column: position.character,
    });
}

export function invalidateCache(uri: string): void {
    treeCache.delete(uri);
}
