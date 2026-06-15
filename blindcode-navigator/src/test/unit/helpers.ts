import Parser = require('tree-sitter');
import type * as vscode from 'vscode';

const JavaLanguage = require('tree-sitter-java');

/** Parst Java-Quelltext direkt mit tree-sitter (ohne VS Code). */
export function parseJava(src: string): Parser.Tree {
    const parser = new Parser();
    parser.setLanguage(JavaLanguage);
    return parser.parse(src);
}

/** Minimaler Ersatz für vscode.Position — die Parser-Funktionen lesen nur line/character. */
export function pos(line: number, character: number): vscode.Position {
    return { line, character } as vscode.Position;
}

let docCounter = 0;

/**
 * Minimaler Ersatz für vscode.TextDocument. getAST() liest nur uri, version
 * und getText() — mehr braucht der Cache-Test nicht.
 */
export function fakeDocument(
    text: string,
    opts?: { version?: number; uri?: string }
): vscode.TextDocument {
    const uri = opts?.uri ?? `file:///fake/Doc${docCounter++}.java`;
    return {
        version: opts?.version ?? 1,
        uri: { toString: () => uri },
        getText: () => text,
    } as unknown as vscode.TextDocument;
}

/** Erster Knoten des gegebenen Typs in Tiefensuche (für gezielte Test-Fixtures). */
export function findFirstOfType(
    node: Parser.SyntaxNode,
    type: string
): Parser.SyntaxNode | null {
    if (node.type === type) {
        return node;
    }
    for (const child of node.namedChildren) {
        const found = findFirstOfType(child, type);
        if (found) {
            return found;
        }
    }
    return null;
}
