import * as vscode from 'vscode';
import { getAST, getNamedNodeAtCursor } from './parser';
import Parser = require('tree-sitter');

function moveToNode(editor: vscode.TextEditor, node: Parser.SyntaxNode): void {
    const pos = new vscode.Position(
        node.startPosition.row,
        node.startPosition.column
    );
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(
        new vscode.Range(pos, pos),
        vscode.TextEditorRevealType.InCenterIfOutsideViewport
    );
}

function currentNode(editor: vscode.TextEditor): Parser.SyntaxNode {
    const tree = getAST(editor.document);
    return getNamedNodeAtCursor(tree, editor.selection.active);
}

export function navigateToParent(editor: vscode.TextEditor): void {
    const node = currentNode(editor);
    const parent = node.parent;
    if (!parent || parent.type === 'program') {
        vscode.window.showInformationMessage('Oberste Ebene erreicht');
        return;
    }
    moveToNode(editor, parent);
}

export function navigateToFirstChild(editor: vscode.TextEditor): void {
    const node = currentNode(editor);
    const child = node.firstNamedChild;
    if (!child) {
        vscode.window.showInformationMessage('Kein untergeordneter Block');
        return;
    }
    moveToNode(editor, child);
}

export function navigateToNextSibling(editor: vscode.TextEditor): void {
    const node = currentNode(editor);
    const sibling = node.nextNamedSibling;
    if (!sibling) {
        vscode.window.showInformationMessage('Kein weiterer Block auf dieser Ebene');
        return;
    }
    moveToNode(editor, sibling);
}

export function navigateToPrevSibling(editor: vscode.TextEditor): void {
    const node = currentNode(editor);
    const sibling = node.previousNamedSibling;
    if (!sibling) {
        vscode.window.showInformationMessage('Kein weiterer Block auf dieser Ebene');
        return;
    }
    moveToNode(editor, sibling);
}
