import * as vscode from 'vscode';
import { getAST, getNamedNodeAtCursor } from './parser';
import {
    buildOutline,
    outlineNodeFor,
    outlineDepth,
    navDown,
    navUp,
    navNextSibling,
    navOut,
    Outline,
    OutlineNode,
} from './navigator';
import { describeOutlineNode, outlineMatches } from './contextSpeech';
import type { SpeechController } from './speech';

/**
 * VS-Code-Adapter für die Outline-Navigation (Kap. 5.3). Baut pro Aktion den
 * Outline-Baum (klein, < 500 LOC → vernachlässigbar), findet den Knoten an der
 * Cursorposition, wendet die Richtung an, bewegt den Cursor und spricht den Kontext.
 *
 * Tastenmodell (Variante 3):
 *   Alt+↓ navigateDown · Alt+↑ navigateUp  (Lesereihenfolge)
 *   Alt+→ navigateNextSibling (Block überspringen) · Alt+← navigateOut (heraus)
 *   Alt+O showOutline (Gliederungs-Liste → frei zu jedem Knoten springen)
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

/** Alt+→ — nächstes Geschwister (Block überspringen). */
export function navigateNextSibling(editor: vscode.TextEditor, speech: SpeechController): void {
    go(editor, speech, (outline, node) => navNextSibling(outline, node), 'Kein weiterer Knoten auf dieser Ebene');
}

/** Alt+← — eine Ebene heraus (Elternknoten). */
export function navigateOut(editor: vscode.TextEditor, speech: SpeechController): void {
    go(editor, speech, (_outline, node) => navOut(node), 'Oberste Ebene erreicht');
}

interface OutlineQuickPickItem extends vscode.QuickPickItem {
    node: OutlineNode;
}

/**
 * Alt+O — Gliederungs-Liste (StructJumper-Analog). Zeigt alle Outline-Knoten in
 * Lesereihenfolge als barrierefreie QuickPick. Das sichtbare Label ist deutsch;
 * gefiltert wird über `outlineMatches` (deutsches Label UND englische Java-
 * Schlüsselwörter), sodass z. B. „else" den „Sonst-Zweig" findet. `alwaysShow`
 * schaltet die eingebaute (nur Label-)Filterung von VS Code ab, damit unser
 * eigener Filter maßgeblich ist. Enter springt zum Knoten und spricht den Kontext.
 */
export function showOutline(editor: vscode.TextEditor, speech: SpeechController): void {
    const tree = getAST(editor.document);
    const outline = buildOutline(tree.rootNode);
    if (outline.linear.length === 0) {
        vscode.window.showInformationMessage('Keine Code-Struktur in dieser Datei');
        return;
    }
    const allItems: OutlineQuickPickItem[] = outline.linear.map(node => ({
        label: `${'    '.repeat(outlineDepth(node))}${describeOutlineNode(node)}`,
        description: `Zeile ${node.astNode.startPosition.row + 1}`,
        alwaysShow: true,
        node,
    }));

    const quickPick = vscode.window.createQuickPick<OutlineQuickPickItem>();
    quickPick.placeholder = 'Filtern (z. B. else, if, for, while, return) – Enter springt zum Knoten';
    quickPick.items = allItems;
    quickPick.onDidChangeValue(value => {
        const query = value.trim();
        quickPick.items = query
            ? allItems.filter(item => outlineMatches(item.node, query))
            : allItems;
    });
    quickPick.onDidAccept(() => {
        const selected = quickPick.selectedItems[0];
        if (selected) {
            moveToNode(editor, selected.node);
            speech.announce(selected.node);
        }
        quickPick.hide();
    });
    quickPick.onDidHide(() => quickPick.dispose());
    quickPick.show();
}
