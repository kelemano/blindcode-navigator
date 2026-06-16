import * as vscode from 'vscode';
import { getAST, getNamedNodeAtCursor } from './parser';
import {
    buildOutline,
    outlineNodeFor,
    navDown,
    navUp,
    navIn,
    navOut,
    Outline,
    OutlineNode,
} from './navigator';
import type { SpeechController } from './speech';

/**
 * VS-Code-Adapter für die Outline-Navigation (Kap. 5.3). Baut pro Tastendruck den
 * Outline-Baum (klein, < 500 LOC → vernachlässigbar), findet den Knoten an der
 * Cursorposition, wendet die Richtung an, bewegt den Cursor und spricht den Kontext.
 *
 * Tastenbelegung (StructJumper-Gliederung):
 *   Alt+↓ navigateDown · Alt+↑ navigateUp · Alt+→ navigateIn · Alt+← navigateOut
 */

/** Outline-Knoten an der aktuellen Cursorposition (oder null). */
export function outlineNodeAtCursor(editor: vscode.TextEditor): OutlineNode | null {
    const tree = getAST(editor.document);
    const outline = buildOutline(tree.rootNode);
    const astNode = getNamedNodeAtCursor(tree, editor.selection.active);
    return outlineNodeFor(outline, astNode);
}

function locate(editor: vscode.TextEditor): { outline: Outline; node: OutlineNode } | null {
    const tree = getAST(editor.document);
    const outline = buildOutline(tree.rootNode);
    const astNode = getNamedNodeAtCursor(tree, editor.selection.active);
    const node = outlineNodeFor(outline, astNode);
    return node ? { outline, node } : null;
}

/** Setzt Cursor und Auswahl auf den Anfang des Zielknotens. */
function moveToNode(editor: vscode.TextEditor, node: OutlineNode): void {
    const start = node.astNode.startPosition;
    const pos = new vscode.Position(start.row, start.column);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(
        new vscode.Range(pos, pos),
        vscode.TextEditorRevealType.InCenterIfOutsideViewport
    );
}

function go(
    editor: vscode.TextEditor,
    speech: SpeechController,
    pick: (outline: Outline, node: OutlineNode) => OutlineNode | null,
    edgeMessage: string
): void {
    const located = locate(editor);
    if (!located) {
        vscode.window.showInformationMessage('Keine Code-Struktur an dieser Position');
        return;
    }
    const target = pick(located.outline, located.node);
    if (!target) {
        vscode.window.showInformationMessage(edgeMessage);
        return;
    }
    moveToNode(editor, target);
    speech.announce(target);
}

/** Alt+↓ — nächster Knoten in Lesereihenfolge. */
export function navigateDown(editor: vscode.TextEditor, speech: SpeechController): void {
    go(editor, speech, (outline, node) => navDown(outline, node), 'Ende des Codes erreicht');
}

/** Alt+↑ — vorheriger Knoten in Lesereihenfolge. */
export function navigateUp(editor: vscode.TextEditor, speech: SpeechController): void {
    go(editor, speech, (outline, node) => navUp(outline, node), 'Anfang des Codes erreicht');
}

/** Alt+→ — eine Ebene hinein (erstes Kind). */
export function navigateIn(editor: vscode.TextEditor, speech: SpeechController): void {
    go(editor, speech, (_outline, node) => navIn(node), 'Keine tiefere Ebene');
}

/** Alt+← — eine Ebene heraus (Elternknoten). */
export function navigateOut(editor: vscode.TextEditor, speech: SpeechController): void {
    go(editor, speech, (_outline, node) => navOut(node), 'Oberste Ebene erreicht');
}
