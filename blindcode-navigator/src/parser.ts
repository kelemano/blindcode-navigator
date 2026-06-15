import Parser = require('tree-sitter');
// Nur als Typ importiert: parser.ts hat dadurch keine Laufzeit-Abhängigkeit zu
// VS Code und ist in reinem Node (mocha) unit-testbar.
import type * as vscode from 'vscode';

// eslint-disable-next-line @typescript-eslint/no-require-imports
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
    const tree = parser.parse(text, cached?.tree);
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
