import * as vscode from 'vscode';
import { invalidateCache } from './parser';
import {
    navigateNextSibling,
    navigatePrevSibling,
    navigateIn,
    navigateOut,
    readCurrentLine,
    showOutline,
    outlineAndCurrent,
    NavServices,
} from './editorNavigation';
import { SpeechController } from './speech';
import { TreeViewProvider } from './treePanel';
import { SonificationController, depthConfigFromSettings } from './sonificationPlayer';
import { ConditionManager, StudyCondition } from './conditionManager';
import type { OutlineNode } from './navigator';

function sonificationSettingFromConfig(): boolean {
    // Der Schlüssel liegt IM Namensraum 'blindcode.sonification' (…enabled), nicht
    // daneben: Ein Name kann in VS Code nicht gleichzeitig Wert und Elternknoten von
    // depthMode/customDepthNodeTypes sein — beides zusammen kollidiert im Einstellungs-
    // baum, und welcher Eintrag gewinnt, hängt an der Reihenfolge in der settings.json.
    return vscode.workspace
        .getConfiguration('blindcode.sonification')
        .get<boolean>('enabled', true);
}

function studyConditionFromConfig(): StudyCondition {
    const value = vscode.workspace.getConfiguration('blindcode').get<string>('studyCondition', 'C');
    return value === 'A' || value === 'B' || value === 'C' ? value : 'C';
}

/** Rückmeldung beim Aktivieren: nichts / Status-Earcon / gesprochener Satz. */
type StartSignal = 'off' | 'earcon' | 'speech';

function startSignalFromConfig(): StartSignal {
    const value = vscode.workspace.getConfiguration('blindcode').get<string>('startSignal', 'earcon');
    return value === 'off' || value === 'earcon' || value === 'speech' ? value : 'earcon';
}

/**
 * Läuft gerade eine Studiensitzung?
 *
 * Sperrt die Tasten, mit denen sich die untersuchten Größen selbst verstellen ließen
 * (Alt+S = Ton, Alt+M = Sprache). Ein:e Proband:in, die/der versehentlich Alt+S drückt,
 * säße sonst faktisch in Bedingung B, während das Protokoll C behauptet — und das
 * womöglich unbemerkt.
 *
 * Bewusst eine EIGENE Einstellung und nicht an `studyCondition` gekoppelt: Deren
 * Standardwert `C` bedeutet zugleich „Produkt mit allen Funktionen". Würde man die Tasten
 * dort sperren, wäre die Funktion für jede normale Nutzung kaputt. Die Bedingung
 * beschreibt den FUNKTIONSUMFANG, dieser Schalter den ABLAUF — zwei verschiedene Dinge.
 *
 * Aufteilung: Tasten sind die Oberfläche der Proband:innen, Einstellungen bleiben die
 * Oberfläche der Versuchsleitung — die kann also weiterhin alles umstellen.
 */
function studyModeFromConfig(): boolean {
    return vscode.workspace.getConfiguration('blindcode').get<boolean>('studyMode', false);
}

function speechVerbosityFromConfig(): string {
    return vscode.workspace.getConfiguration('blindcode.speech').get<string>('verbosity', 'high');
}

/**
 * Kann auf DIESEM System überhaupt Ton ausgegeben werden? Das Audio-Backend nutzt den
 * macOS-Player `afplay` (siehe sonificationPlayer.ts). Auf anderen Plattformen bliebe
 * Bedingung C faktisch Bedingung B — das muss in der Statusanzeige sichtbar sein.
 */
const AUDIO_SUPPORTED = process.platform === 'darwin';

/** Zeitstempel HH:MM:SS.mmm — macht das Log zu einer auswertbaren Navigationsspur. */
function timestamp(): string {
    const now = new Date();
    const pad = (value: number, width = 2) => String(value).padStart(width, '0');
    return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
        + `.${pad(now.getMilliseconds(), 3)}`;
}

/** Erklärt der Versuchsleitung, warum der Ton gerade an oder aus ist. */
function soundReason(allowedByCondition: boolean, settingOn: boolean): string {
    if (!allowedByCondition) { return 'aus — die Studienbedingung sieht keinen Ton vor'; }
    if (!settingOn) { return 'aus — Einstellung „blindcode.sonification.enabled" ist deaktiviert'; }
    if (!AUDIO_SUPPORTED) {
        return `NICHT MÖGLICH auf dieser Plattform (${process.platform}): Die Tonausgabe nutzt `
            + 'den macOS-Player afplay. Diese Sitzung entspricht faktisch Bedingung B!';
    }
    return 'aktiv';
}

/**
 * Ein Eintrag der Navigationsspur. Wird zusätzlich zum Output-Kanal im Speicher
 * gehalten, damit die Versuchsleitung sie als CSV auswerten kann — aus dem
 * Output-Kanal ließe sie sich nur von Hand herauskopieren.
 */
interface TraceEntry {
    /** Wanduhrzeit ISO-8601 (eindeutig über Sitzungen hinweg). */
    iso: string;
    /** Millisekunden seit Beginn dieser Spur — die eigentliche Auswertungsgröße. */
    elapsedMs: number;
    condition: StudyCondition;
    /** 'knoten' = Positionswechsel, 'marke' = Sitzungs-/Bedingungsmarke. */
    art: 'knoten' | 'marke';
    line: number;
    column: number;
    kind: string;
    astType: string;
    /** Freitext bei Marken (z. B. „Bedingung C · Sprache an · Ton an"). */
    notiz: string;
}

/** CSV-Feld maskieren (Semikolon-getrennt: Excel-freundlich im deutschen Gebietsschema). */
function csvField(value: string | number): string {
    const text = String(value);
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
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
    // Sonifikation (Tiefe → Tonhöhe): WAV-Töne aus dem Extension-Host, abgespielt
    // per System-Player (macOS afplay) — kein Webview, keine Autoplay-Sperre.
    // An-/abschaltbar (M5: A/B/C). WAV-Dateien liegen im globalStorage der Extension.
    const sonification = new SonificationController(false, context.globalStorageUri.fsPath);
    const services: NavServices = { speech, sonification };

    // Studienbedingung A/B/C: schaltet die Funktionen je Bedingung.
    const conditionManager = new ConditionManager(studyConditionFromConfig());

    /** Navigationsspur dieser Sitzung (siehe TraceEntry) — exportierbar als CSV. */
    const trace: TraceEntry[] = [];
    let traceStart = Date.now();

    function addTrace(entry: Omit<TraceEntry, 'iso' | 'elapsedMs' | 'condition'>): void {
        trace.push({
            iso: new Date().toISOString(),
            elapsedMs: Date.now() - traceStart,
            condition: conditionManager.current,
            ...entry,
        });
    }

    const conditionStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    conditionStatusBar.show();

    /**
     * Sichtbare Markierung des aktuellen Outline-Knotens IM CODE.
     *
     * Reine Sehhilfe (Tutor:in, Vorführung, Beamer): Wer sieht, erkennt sonst nur den
     * springenden Cursor, nicht den Umfang des Knotens, auf dem man steht. Für blinde
     * Nutzer:innen ohne Wirkung — Sprache und Ton bleiben unberührt.
     * In Bedingung A abgeschaltet, weil die Extension dort auch visuell inert sein muss.
     */
    const nodeDecoration = vscode.window.createTextEditorDecorationType({
        backgroundColor: new vscode.ThemeColor('editor.rangeHighlightBackground'),
        isWholeLine: false,
        borderWidth: '0 0 0 2px',
        borderStyle: 'solid',
        borderColor: new vscode.ThemeColor('focusBorder'),
    });

    function highlightEnabledFromConfig(): boolean {
        return vscode.workspace.getConfiguration('blindcode').get<boolean>('highlightCurrentNode', true);
    }

    function applyHighlight(editor: vscode.TextEditor, node: OutlineNode | null): void {
        if (!node || !highlightEnabledFromConfig() || !conditionManager.isEnabled('navigation')) {
            editor.setDecorations(nodeDecoration, []);
            return;
        }
        const start = node.astNode.startPosition;
        const end = node.astNode.endPosition;
        editor.setDecorations(nodeDecoration, [
            new vscode.Range(start.row, start.column, end.row, end.column),
        ]);
    }

    /**
     * Wendet die aktuelle Bedingung an: effektive Sonifikation, Sprachkanal und die
     * Statusanzeige für die Versuchsleitung.
     */
    function applyCondition(): void {
        conditionManager.setCondition(studyConditionFromConfig());
        const condition = conditionManager.current;

        const speechOn = conditionManager.isEnabled('speech');
        const soundAllowed = conditionManager.isEnabled('sonification');
        const soundSetting = sonificationSettingFromConfig();
        // Ton nur, wenn die Bedingung ihn erlaubt UND die Einstellung an ist UND die
        // Plattform ihn überhaupt kann.
        const soundOn = soundAllowed && soundSetting && AUDIO_SUPPORTED;

        sonification.setEnabled(soundOn);
        // Sprachkanal vorab aufbauen (B/C) bzw. abbauen (A → keine sichtbaren Panels).
        speech.setActive(speechOn);

        // Die Anzeige nennt den EFFEKTIVEN Zustand, nicht nur den Buchstaben: „Bedingung C"
        // bei stummem Ton wäre die am schwersten zu bemerkende Fehlkonfiguration überhaupt.
        // Schloss-Symbol, wenn der Sitzungsmodus die Tasten sperrt — die Versuchsleitung
        // muss auf einen Blick sehen, ob die Sperre wirklich aktiv ist.
        const lock = studyModeFromConfig() ? ' $(lock)' : '';
        conditionStatusBar.text =
            `BCNav: ${condition} · Sprache ${speechOn ? '✓' : '✗'} · Ton ${soundOn ? '✓' : '✗'}${lock}`;
        conditionStatusBar.tooltip =
            `Studienbedingung ${condition} — A: aus (nur Screenreader) · B: Navigation + Sprache · `
            + `C: + Sonifikation\n`
            + `Sprachausgabe: ${speechOn ? 'aktiv' : 'aus — Bedingung A ist die Kontrollbedingung'}\n`
            + `Sonifikation: ${soundReason(soundAllowed, soundSetting)}\n`
            + (studyModeFromConfig()
                ? 'Sitzungsmodus AKTIV: Alt+S und Alt+M sind für die Testperson gesperrt.'
                : 'Sitzungsmodus aus — Alt+S und Alt+M sind bedienbar.');
        // Warnfarbe genau im gefährlichen Fall: Ton ist GEWOLLT, kommt aber nicht.
        conditionStatusBar.backgroundColor = soundAllowed && soundSetting && !AUDIO_SUPPORTED
            ? new vscode.ThemeColor('statusBarItem.warningBackground')
            : undefined;

        // Bedingungswechsel in die Navigationsspur schreiben → das Log ist selbsterklärend.
        const notiz = `Bedingung ${condition} · Sprache ${speechOn ? 'an' : 'aus'} `
            + `· Ton ${soundOn ? 'an' : 'aus'}`;
        outputChannel.appendLine(`--- ${timestamp()}  ${notiz} ---`);
        addTrace({ art: 'marke', line: 0, column: 0, kind: '', astType: '', notiz });
    }

    context.subscriptions.push(
        outputChannel, statusBar, conditionStatusBar, speech, treeRegistration, sonification,
        nodeDecoration,
        // Laufenden Debounce-Timer mit abräumen, sonst feuert sein Callback noch,
        // nachdem die Ressourcen oben verworfen wurden.
        new vscode.Disposable(() => {
            if (debounceTimer) {
                clearTimeout(debounceTimer);
                debounceTimer = undefined;
            }
        })
    );
    applyCondition();

    /** Zuletzt protokollierter Knoten — verhindert eine Log-Zeile je Cursorbewegung. */
    let lastLogged: string | undefined;

    function updateNodeInfo(editor: vscode.TextEditor): void {
        if (editor.document.languageId !== 'java') {
            statusBar.text = '';
            return;
        }
        const { outline, current } = outlineAndCurrent(editor);
        // Baumansicht live aktualisieren (nur wenn die View geladen ist).
        treeProvider.update(outline, current, depthConfigFromSettings());
        applyHighlight(editor, current);
        if (!current) { return; }
        // Statusleiste für die Versuchsleiterin; gesprochen wird nur bei Navigation.
        speech.showStatus(current);
        const pos = current.astNode.startPosition;
        // Nur bei echtem Knotenwechsel protokollieren: updateNodeInfo läuft bei JEDER
        // Cursorbewegung (auch Pfeiltasten innerhalb einer Zeile), das Log würde sonst
        // über eine Sitzung unbegrenzt wachsen.
        const key = `${pos.row}:${pos.column}:${current.kind}`;
        if (key !== lastLogged) {
            lastLogged = key;
            // Mit Zeitstempel: die Spur zeigt nicht nur den Weg, sondern auch das Tempo
            // (z. B. wie lange jemand den Sonst-Zweig gesucht hat).
            outputChannel.appendLine(
                `${timestamp()}  ${pos.row + 1}:${pos.column + 1}  `
                + `${current.kind} (${current.astNode.type})`
            );
            addTrace({
                art: 'knoten',
                line: pos.row + 1,
                column: pos.column + 1,
                kind: current.kind,
                astType: current.astNode.type,
                notiz: '',
            });
        }
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
        // Hörbare Aktivierungsbestätigung. Sehende sehen die Statusleiste; für blinde
        // Nutzer:innen gäbe es dieses Signal sonst gar nicht.
        // In Bedingung A entfällt sie wie alles andere (Extension wirkt inert).
        // Das Earcon ist KEINE Sonifikation (siehe startTone) und kommt daher in B und C
        // gleichermaßen — die manipulierte Variable bleibt unberührt.
        if (conditionManager.isEnabled('navigation')) {
            switch (startSignalFromConfig()) {
                case 'earcon':
                    sonification.playStart();
                    break;
                case 'speech':
                    // Achtung: fällt mit dem Vorlesen der frisch geöffneten Datei durch
                    // den Screenreader zusammen — zwei Sprachquellen gleichzeitig.
                    speech.announceRaw(
                        `BlindCode Navigator aktiv, Bedingung ${conditionManager.current}.`
                    );
                    break;
                case 'off':
                    break;
            }
        }
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
                event.affectsConfiguration('blindcode.sonification') ||
                event.affectsConfiguration('blindcode.studyMode')
            ) {
                applyCondition();
            }
            // Auch eine Änderung der Sprach-Ausführlichkeit gehört in die Spur: Sonst
            // bliebe unbemerkt, dass jemand mitten in der Aufgabe die Ansagen gekürzt
            // oder stummgeschaltet hat. Hier statt im Befehl, damit auch direkte
            // Änderungen in den Einstellungen erfasst werden.
            if (event.affectsConfiguration('blindcode.speech.verbosity')) {
                const notiz = `Sprach-Modus: ${speechVerbosityFromConfig()}`;
                outputChannel.appendLine(`--- ${timestamp()}  ${notiz} ---`);
                addTrace({ art: 'marke', line: 0, column: 0, kind: '', astType: '', notiz });
            }
        }),
        vscode.commands.registerCommand('blindcode-navigator.toggleSonification', () => {
            // In Bedingung A ist die Extension vollständig inert (wie die Alt-Pfeiltasten):
            // sonst quittierte Alt+S mit einer sichtbaren Benachrichtigung und wäre für
            // Proband:innen wahrnehmbar — das verfälscht die Kontrollbedingung.
            // `setStudyCondition` bleibt bewusst ungated (Weg aus A heraus).
            if (!conditionManager.isEnabled('navigation')) { return; }
            // Während einer Sitzung gesperrt: sonst könnte die Testperson die
            // untersuchte Größe selbst abschalten (siehe studyModeFromConfig).
            if (studyModeFromConfig()) { return; }
            const on = !sonificationSettingFromConfig();
            void vscode.workspace.getConfiguration('blindcode.sonification')
                .update('enabled', on, vscode.ConfigurationTarget.Global)
                .then(() => {
                    applyCondition();
                    // Der neue Zustand sagt sich selbst an. Ohne Ansage wäre bei
                    // „aus" nicht zu unterscheiden, ob die Taste gewirkt hat oder
                    // ob die Tonausgabe ausgefallen ist.
                    const hinweis = on && !conditionManager.isEnabled('sonification')
                        ? `Sonifikation aktiviert, aber in Bedingung ${conditionManager.current} inaktiv.`
                        : `Sonifikation ${on ? 'an' : 'aus'}`;
                    speech.announceRaw(hinweis);
                    vscode.window.showInformationMessage(hinweis);
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
            'blindcode-navigator.navigateNextSibling',
            withJavaEditor(navigateNextSibling)
        ),
        vscode.commands.registerCommand(
            'blindcode-navigator.navigatePrevSibling',
            withJavaEditor(navigatePrevSibling)
        ),
        vscode.commands.registerCommand(
            'blindcode-navigator.navigateIn',
            withJavaEditor(navigateIn)
        ),
        vscode.commands.registerCommand(
            'blindcode-navigator.navigateOut',
            withJavaEditor(navigateOut)
        ),
        vscode.commands.registerCommand(
            'blindcode-navigator.readLine',
            withJavaEditor(readCurrentLine)
        ),
        vscode.commands.registerCommand(
            'blindcode-navigator.showOutline',
            withJavaEditor(showOutline)
        ),
        vscode.commands.registerCommand('blindcode-navigator.showTree', async () => {
            // Werkzeug der SEKUNDÄREN Nutzergruppe (Tutor:in/Versuchsleitung), bewusst
            // OHNE Tastenkürzel — nur über die Befehlspalette erreichbar. Die Baumansicht
            // ist ausdrücklich kein Teil des barrierefreien Nutzungspfads.
            await vscode.commands.executeCommand(`${TreeViewProvider.viewId}.focus`);
            // Der `.focus`-Befehl ist der einzige Weg, eine Panel-View einzublenden, er
            // zieht aber den Tastaturfokus aus dem Editor — danach greifen die
            // when-Klauseln (`editorTextFocus`) nicht mehr und ALLE Alt-Tasten wären tot.
            // Für eine blinde Person wäre das eine Sackgasse. Deshalb den Fokus sofort
            // zurückgeben: die Ansicht bleibt sichtbar (für die sehende Begleitung),
            // die Navigation bleibt bedienbar.
            await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === 'java') {
                const { outline, current } = outlineAndCurrent(editor);
                treeProvider.update(outline, current, depthConfigFromSettings());
            }
        }),
        vscode.commands.registerCommand('blindcode-navigator.focusCode', async () => {
            // Rückfall-Befehl: Er hängt an denselben Tasten wie die Navigation, aber mit
            // der umgekehrten when-Klausel (`!editorTextFocus`). Er greift also genau dann,
            // wenn eine Java-Datei aktiv ist, der Tastaturfokus aber woanders liegt —
            // im Dateibaum, im Terminal, im Suchfeld.
            //
            // Warum überhaupt: Ohne ihn passiert bei einem Tastendruck in dieser Lage
            // NICHTS — keine Bewegung, kein Ton, keine Meldung. Ein folgenloser
            // Tastendruck ist in einem barrierefreien Interface der schlimmste Fall:
            // „falsch gedrückt" und „Werkzeug kaputt" klingen identisch.
            //
            // Der Befehl meldet die Lage nicht nur, er BEHEBT sie: Ein Druck holt den
            // Fokus zurück. Bewusst OHNE gleichzeitig zu navigieren — dieselbe Taste
            // täte sonst mal eines, mal zweierlei; Vorhersagbarkeit wiegt schwerer als
            // ein gespartes Tastendrücken.
            if (!conditionManager.isEnabled('navigation')) { return; }
            await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
            if (conditionManager.isEnabled('speech')) {
                // announceRaw, nicht announce: eine Systemantwort auf eine Nutzeraktion
                // wird auch im stummgeschalteten Modus (Alt+M) ausgegeben.
                speech.announceRaw('Fokus zurück im Code.');
            }
        }),
        vscode.commands.registerCommand('blindcode-navigator.exportTrace', async () => {
            // Werkzeug der Versuchsleitung: die Spur als CSV sichern (Semikolon-getrennt,
            // damit Excel sie im deutschen Gebietsschema direkt in Spalten öffnet).
            if (trace.length === 0) {
                vscode.window.showInformationMessage('Die Navigationsspur ist leer.');
                return;
            }
            const header = 'zeit_iso;ms_seit_start;bedingung;art;zeile;spalte;knotenart;ast_typ;notiz';
            const rows = trace.map(e => [
                e.iso, e.elapsedMs, e.condition, e.art,
                e.line || '', e.column || '', e.kind, e.astType, e.notiz,
            ].map(csvField).join(';'));
            const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const target = await vscode.window.showSaveDialog({
                filters: { CSV: ['csv'] },
                saveLabel: 'Navigationsspur sichern',
                defaultUri: vscode.Uri.file(`bcnav-spur-${stamp}.csv`),
            });
            if (!target) { return; }
            // BOM voranstellen, sonst zerlegt Excel Umlaute in den Knotenarten.
            const csv = '﻿' + [header, ...rows].join('\r\n') + '\r\n';
            await vscode.workspace.fs.writeFile(target, Buffer.from(csv, 'utf8'));
            vscode.window.showInformationMessage(
                `Navigationsspur gesichert: ${trace.length} Einträge.`
            );
        }),
        vscode.commands.registerCommand('blindcode-navigator.resetTrace', () => {
            // Zwischen zwei Proband:innen aufrufen, damit die Spuren getrennt bleiben.
            trace.length = 0;
            traceStart = Date.now();
            outputChannel.clear();
            applyCondition(); // schreibt sofort wieder die Bedingungsmarke an den Anfang
            vscode.window.showInformationMessage('Navigationsspur zurückgesetzt.');
        }),
        vscode.commands.registerCommand('blindcode-navigator.cycleSpeechMode', async () => {
            // Ausführlichkeit im Ring: volle Kette → Methode+Klasse → nur Element → aus.
            // „aus" betrifft nur die AUTOMATISCHEN Ansagen; Alt+W und Alt+L antworten
            // weiter — dadurch ist der stumme Modus gefahrlos, man kann sich nicht
            // verlieren. In Bedingung A ist die Extension inert.
            if (!conditionManager.isEnabled('speech')) { return; }
            if (studyModeFromConfig()) { return; } // s. o. — Sperre während der Sitzung
            await speech.cycleMode();
        }),
        vscode.commands.registerCommand('blindcode-navigator.whereAmI', () => {
            // „Wo bin ich?" — spricht den aktuellen Pfad erneut, ohne zu navigieren.
            // Sprach-Feature → in Bedingung A aus.
            if (!conditionManager.isEnabled('speech')) { return; }
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'java') { return; }
            const { current } = outlineAndCurrent(editor);
            if (!current) {
                // Auch diese Auskunft muss hörbar sein: Alt+W wird gerade dann
                // gedrückt, wenn jemand nicht weiß, wo er steht. Eine stumme
                // Benachrichtigung ließe ihn ohne jede Antwort zurück.
                const hinweis = 'Keine Code-Struktur an dieser Position';
                speech.announceRaw(hinweis);
                vscode.window.showInformationMessage(hinweis);
                return;
            }
            // Zweite Sonifikations-Abbildung: die ABSOLUTE Tiefe als Anzahl Klicks
            // (Anker + n). Nur in Bedingung C, weil das Struktur-Sonifikation ist.
            // Erst die Klicks, dann die Sprache — sonst überlagern sich beide Kanäle.
            const earconMs = sonification.playCountForNode(current);
            speech.announceDelayed(current, earconMs);
        }),
    );
}

export function deactivate() {}
