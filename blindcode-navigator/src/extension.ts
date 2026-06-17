import * as vscode from 'vscode';
import { invalidateCache } from './parser';
import {
    navigateUp,
    navigateDown,
    navigateNextSibling,
    navigateOut,
    showOutline,
    outlineAndCurrent,
    NavServices,
} from './editorNavigation';
import { SpeechController } from './speech';
import { TreeViewProvider } from './treePanel';
import { SonificationController } from './sonificationPlayer';
import { ConditionManager, StudyCondition } from './conditionManager';

function sonificationSettingFromConfig(): boolean {
    return vscode.workspace.getConfiguration('blindcode').get<boolean>('sonification', true);
}

function studyConditionFromConfig(): StudyCondition {
    const value = vscode.workspace.getConfiguration('blindcode').get<string>('studyCondition', 'C');
    return value === 'A' || value === 'B' || value === 'C' ? value : 'C';
}

const DEBOUNCE_MS = 300;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

export function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('BlindCode Navigator');
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBar.show();
    const speech = new SpeechController(statusBar);
    // Visuelle Baumansicht (Debug/Tutor-Hilfe) im UNTEREN Panel-Bereich (neben Terminal/Output).
    // Klick auf einen Knoten → Cursor dorthin.
    const treeProvider = new TreeViewProvider((row, column) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
        const pos = new vscode.Position(row, column);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    });
    const treeRegistration = vscode.window.registerWebviewViewProvider(
        TreeViewProvider.viewId,
        treeProvider,
        { webviewOptions: { retainContextWhenHidden: true } }
    );
    // Sonifikation (Tiefe → Tonhöhe) via Web-Audio-Webview. An-/abschaltbar (M5: A/B/C).
    const sonification = new SonificationController(false);
    const services: NavServices = { speech, sonification };

    // Studienbedingung A/B/C: schaltet die Funktionen je Bedingung.
    const conditionManager = new ConditionManager(studyConditionFromConfig());
    const conditionStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    conditionStatusBar.show();

    /** Wendet die aktuelle Bedingung an: Statusanzeige + effektive Sonifikation. */
    function applyCondition(): void {
        conditionManager.setCondition(studyConditionFromConfig());
        const condition = conditionManager.current;
        conditionStatusBar.text = `BCNav: Bedingung ${condition}`;
        conditionStatusBar.tooltip =
            'Studienbedingung — A: aus (nur Screenreader) · B: Navigation + Sprache · C: + Sonifikation';
        // Sonifikation nur, wenn die Bedingung sie erlaubt UND die Einstellung an ist.
        sonification.setEnabled(
            conditionManager.isEnabled('sonification') && sonificationSettingFromConfig()
        );
    }

    context.subscriptions.push(
        outputChannel, statusBar, conditionStatusBar, speech, treeRegistration, sonification
    );
    applyCondition();

    function updateNodeInfo(editor: vscode.TextEditor): void {
        if (editor.document.languageId !== 'java') {
            statusBar.text = '';
            return;
        }
        const { outline, current } = outlineAndCurrent(editor);
        // Baumansicht live aktualisieren (nur wenn die View geladen ist).
        treeProvider.update(outline, current);
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

    // Navigation (und die Gliederungs-Liste) sind in Bedingung A deaktiviert → Alt-Tasten
    // tun dann nichts, es gibt keine Sprach-/Audioausgabe.
    function withJavaEditor(
        fn: (editor: vscode.TextEditor, services: NavServices) => void
    ): () => void {
        return () => {
            if (!conditionManager.isEnabled('navigation')) { return; }
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === 'java') { fn(editor, services); }
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
        vscode.workspace.onDidChangeConfiguration(event => {
            if (
                event.affectsConfiguration('blindcode.studyCondition') ||
                event.affectsConfiguration('blindcode.sonification')
            ) {
                applyCondition();
                sonification.refreshConfig();
            }
        }),
        vscode.commands.registerCommand('blindcode-navigator.toggleSonification', () => {
            const on = !sonificationSettingFromConfig();
            void vscode.workspace.getConfiguration('blindcode')
                .update('sonification', on, vscode.ConfigurationTarget.Global)
                .then(() => {
                    applyCondition();
                    if (on && !conditionManager.isEnabled('sonification')) {
                        vscode.window.showInformationMessage(
                            `Sonifikation aktiviert, aber in Bedingung ${conditionManager.current} inaktiv.`
                        );
                    } else {
                        vscode.window.showInformationMessage(`Sonifikation ${on ? 'an' : 'aus'}`);
                    }
                });
        }),
        vscode.commands.registerCommand('blindcode-navigator.setStudyCondition', async () => {
            const pick = await vscode.window.showQuickPick(
                [
                    { label: 'A', description: 'Kontrolle — Extension aus (nur Screenreader)' },
                    { label: 'B', description: 'Navigation + Sprachausgabe (kein Audio)' },
                    { label: 'C', description: 'Navigation + Sprache + Sonifikation' },
                ],
                { placeHolder: 'Studienbedingung wählen' }
            );
            if (pick) {
                await vscode.workspace.getConfiguration('blindcode')
                    .update('studyCondition', pick.label, vscode.ConfigurationTarget.Global);
                applyCondition();
                vscode.window.showInformationMessage(`Studienbedingung ${pick.label} aktiv`);
            }
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
            // Öffnet/fokussiert die View im unteren Panel-Bereich.
            void vscode.commands.executeCommand(`${TreeViewProvider.viewId}.focus`);
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === 'java') {
                const { outline, current } = outlineAndCurrent(editor);
                treeProvider.update(outline, current);
            }
        }),
        vscode.commands.registerCommand('blindcode-navigator.whereAmI', () => {
            // „Wo bin ich?" — spricht den aktuellen Pfad erneut, ohne zu navigieren.
            // Sprach-Feature → in Bedingung A aus.
            if (!conditionManager.isEnabled('speech')) { return; }
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'java') { return; }
            const { current } = outlineAndCurrent(editor);
            if (current) {
                speech.announce(current);
            } else {
                vscode.window.showInformationMessage('Keine Code-Struktur an dieser Position');
            }
        }),
        vscode.commands.registerCommand('blindcode-navigator.helloWorld', () => {
            outputChannel.show();
            vscode.window.showInformationMessage('BlindCode Navigator active — open the Output panel for AST info.');
        }),
    );
}

export function deactivate() {}
