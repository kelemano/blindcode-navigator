import * as vscode from 'vscode';
import Parser = require('tree-sitter');
import { getAST, getNamedNodeAtCursor } from './parser';
import {
    findParent,
    findFirstChild,
    findNextSibling,
    findPrevSibling,
} from './navigator';

/**
 * Dünne Adapter-Schicht zwischen der reinen Navigator-Logik (navigator.ts) und
 * der VS-Code-UI. Hier — und nur hier — wird der Cursor bewegt und werden
 * Edge-Case-Meldungen ausgegeben. Dadurch bleibt navigator.ts frei von
 * VS-Code-Abhängigkeiten und unit-testbar (Kap. 4.1, separation of concerns).
 */

/** Reine Navigationsfunktion + die Meldung, falls sie kein Ziel findet. */
type NavStep = {
    find: (node: Parser.SyntaxNode) => Parser.SyntaxNode | null;
    edgeMessage: string;
};

const STEPS = {
    parent: {
        find: findParent,
        edgeMessage: 'Oberste Ebene erreicht',
    },
    firstChild: {
        find: findFirstChild,
        edgeMessage: 'Kein untergeordneter Block',
    },
    nextSibling: {
        find: findNextSibling,
        edgeMessage: 'Kein weiterer Block auf dieser Ebene',
    },
    prevSibling: {
        find: findPrevSibling,
        edgeMessage: 'Kein weiterer Block auf dieser Ebene',
    },
} satisfies Record<string, NavStep>;

/** Knoten an der aktuellen Cursorposition. */
function currentNode(editor: vscode.TextEditor): Parser.SyntaxNode {
    const tree = getAST(editor.document);
    return getNamedNodeAtCursor(tree, editor.selection.active);
}

/** Setzt Cursor und Auswahl auf den Anfang des Zielknotens. */
function moveToNode(editor: vscode.TextEditor, node: Parser.SyntaxNode): void {
    const pos = new vscode.Position(node.startPosition.row, node.startPosition.column);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(
        new vscode.Range(pos, pos),
        vscode.TextEditorRevealType.InCenterIfOutsideViewport
    );
}

/** Führt einen Navigationsschritt aus: bewegt den Cursor oder meldet das Edge-Case. */
function navigate(editor: vscode.TextEditor, step: NavStep): void {
    const target = step.find(currentNode(editor));
    if (!target) {
        vscode.window.showInformationMessage(step.edgeMessage);
        return;
    }
    moveToNode(editor, target);
}

export function navigateToParent(editor: vscode.TextEditor): void {
    navigate(editor, STEPS.parent);
}

export function navigateToFirstChild(editor: vscode.TextEditor): void {
    navigate(editor, STEPS.firstChild);
}

export function navigateToNextSibling(editor: vscode.TextEditor): void {
    navigate(editor, STEPS.nextSibling);
}

export function navigateToPrevSibling(editor: vscode.TextEditor): void {
    navigate(editor, STEPS.prevSibling);
}
