import * as vscode from 'vscode';
import Parser = require('tree-sitter');
import { getAST, getNamedNodeAtCursor } from './parser';
import {
    findParent,
    findFirstChild,
    findNextSibling,
    findPrevSibling,
    toMeaningfulNode,
} from './navigator';
import type { SpeechController } from './speech';

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

/**
 * Knoten an der aktuellen Cursorposition, normalisiert: liegt der Cursor auf
 * einem strukturellen Körper-Knoten (block, …), wird auf einen
 * bedeutungstragenden Knoten umgesetzt (siehe navigator.toMeaningfulNode).
 */
function currentNode(editor: vscode.TextEditor): Parser.SyntaxNode | null {
    const tree = getAST(editor.document);
    return toMeaningfulNode(getNamedNodeAtCursor(tree, editor.selection.active));
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

/**
 * Führt einen Navigationsschritt aus: bewegt den Cursor und spricht den Kontext
 * des Zielknotens (Trigger onNavigate, M3) oder meldet das Edge-Case.
 */
function navigate(editor: vscode.TextEditor, step: NavStep, speech: SpeechController): void {
    const start = currentNode(editor);
    const target = start ? step.find(start) : null;
    if (!target) {
        vscode.window.showInformationMessage(step.edgeMessage);
        return;
    }
    moveToNode(editor, target);
    speech.announce(target);
}

export function navigateToParent(editor: vscode.TextEditor, speech: SpeechController): void {
    navigate(editor, STEPS.parent, speech);
}

export function navigateToFirstChild(editor: vscode.TextEditor, speech: SpeechController): void {
    navigate(editor, STEPS.firstChild, speech);
}

export function navigateToNextSibling(editor: vscode.TextEditor, speech: SpeechController): void {
    navigate(editor, STEPS.nextSibling, speech);
}

export function navigateToPrevSibling(editor: vscode.TextEditor, speech: SpeechController): void {
    navigate(editor, STEPS.prevSibling, speech);
}
