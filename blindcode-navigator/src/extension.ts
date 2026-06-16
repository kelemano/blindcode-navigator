import * as vscode from 'vscode';
import { invalidateCache } from './parser';
import {
    navigateUp,
    navigateDown,
    navigateIn,
    navigateOut,
    outlineNodeAtCursor,
} from './editorNavigation';
import { SpeechController } from './speech';

const DEBOUNCE_MS = 300;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

export function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('BlindCode Navigator');
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBar.show();
    const speech = new SpeechController(statusBar);
    context.subscriptions.push(outputChannel, statusBar, speech);

    function updateNodeInfo(editor: vscode.TextEditor): void {
        if (editor.document.languageId !== 'java') {
            statusBar.text = '';
            return;
        }
        const node = outlineNodeAtCursor(editor);
        if (!node) { return; }
        // Statusleiste für die Versuchsleiterin; gesprochen wird nur bei Navigation.
        speech.showStatus(node);
        const pos = node.astNode.startPosition;
        outputChannel.appendLine(`${pos.row + 1}:${pos.column + 1}  ${node.kind} (${node.astNode.type})`);
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
            'blindcode-navigator.navigateIn',
            withJavaEditor(navigateIn)
        ),
        vscode.commands.registerCommand(
            'blindcode-navigator.navigateOut',
            withJavaEditor(navigateOut)
        ),
        vscode.commands.registerCommand('blindcode-navigator.helloWorld', () => {
            outputChannel.show();
            vscode.window.showInformationMessage('BlindCode Navigator active — open the Output panel for AST info.');
        }),
    );
}

export function deactivate() {}
