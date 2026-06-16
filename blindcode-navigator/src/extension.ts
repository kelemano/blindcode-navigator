import * as vscode from 'vscode';
import { invalidateCache } from './parser';
import {
    navigateUp,
    navigateDown,
    navigateNextSibling,
    navigateOut,
    showOutline,
    outlineAndCurrent,
} from './editorNavigation';
import { SpeechController } from './speech';
import { TreePanel } from './treePanel';

const DEBOUNCE_MS = 300;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

export function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('BlindCode Navigator');
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBar.show();
    const speech = new SpeechController(statusBar);
    // Visuelle Baumansicht (Debug/Tutor-Hilfe). Klick auf einen Knoten → Cursor dorthin.
    const treePanel = new TreePanel((row, column) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
        const pos = new vscode.Position(row, column);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    });
    context.subscriptions.push(outputChannel, statusBar, speech, treePanel);

    function updateNodeInfo(editor: vscode.TextEditor): void {
        if (editor.document.languageId !== 'java') {
            statusBar.text = '';
            return;
        }
        const { outline, current } = outlineAndCurrent(editor);
        // Baumansicht live aktualisieren (nur wenn offen).
        treePanel.update(outline, current);
        if (!current) { return; }
        // Statusleiste für die Versuchsleiterin; gesprochen wird nur bei Navigation.
        speech.showStatus(current);
        const pos = current.astNode.startPosition;
        outputChannel.appendLine(`${pos.row + 1}:${pos.column + 1}  ${current.kind} (${current.astNode.type})`);
    }

    function onDocumentChange(event: vscode.TextDocumentChangeEvent): void {
        if (event.document.languageId !== 'java') { return; }
        if (debounceTimer) { clearTimeout(debounceTimer); }
        debounceTimer = setTimeout(() => {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document === event.document) {
                updateNodeInfo(editor);
            }
        }, DEBOUNCE_MS);
    }

    const initialEditor = vscode.window.activeTextEditor;
    if (initialEditor?.document.languageId === 'java') {
        updateNodeInfo(initialEditor);
    }

    function withJavaEditor(
        fn: (editor: vscode.TextEditor, speech: SpeechController) => void
    ): () => void {
        return () => {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === 'java') { fn(editor, speech); }
        };
    }

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) { updateNodeInfo(editor); }
        }),
        vscode.window.onDidChangeTextEditorSelection(event => {
            updateNodeInfo(event.textEditor);
        }),
        vscode.workspace.onDidChangeTextDocument(onDocumentChange),
        vscode.workspace.onDidCloseTextDocument(doc => {
            invalidateCache(doc.uri.toString());
        }),
        vscode.commands.registerCommand(
            'blindcode-navigator.navigateDown',
            withJavaEditor(navigateDown)
        ),
        vscode.commands.registerCommand(
            'blindcode-navigator.navigateUp',
            withJavaEditor(navigateUp)
        ),
        vscode.commands.registerCommand(
            'blindcode-navigator.navigateNextSibling',
            withJavaEditor(navigateNextSibling)
        ),
        vscode.commands.registerCommand(
            'blindcode-navigator.navigateOut',
            withJavaEditor(navigateOut)
        ),
        vscode.commands.registerCommand(
            'blindcode-navigator.showOutline',
            withJavaEditor(showOutline)
        ),
        vscode.commands.registerCommand('blindcode-navigator.showTree', () => {
            treePanel.reveal();
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === 'java') {
                const { outline, current } = outlineAndCurrent(editor);
                treePanel.update(outline, current);
            }
        }),
        vscode.commands.registerCommand('blindcode-navigator.helloWorld', () => {
            outputChannel.show();
            vscode.window.showInformationMessage('BlindCode Navigator active — open the Output panel for AST info.');
        }),
    );
}

export function deactivate() {}
