import * as vscode from 'vscode';
import type { OutlineNode } from './navigator';
import {
    buildContextString,
    describeOutlineNode,
    explicitVerbosity,
    nextSpeechMode,
    SpeechMode,
    SPEECH_MODE_CYCLE,
    SPEECH_MODE_LABELS,
} from './contextSpeech';

function modeFromConfig(): SpeechMode {
    const value = vscode.workspace
        .getConfiguration('blindcode.speech')
        .get<string>('verbosity', 'high');
    return SPEECH_MODE_CYCLE.includes(value as SpeechMode) ? (value as SpeechMode) : 'high';
}

/**
 * Sprachausgabe-Schicht (VS-Code-Adapter für ContextSpeech, Kap. 4.3/5.3).
 *
 * Trennung: die reine Textbildung liegt in contextSpeech.ts; hier wird der Text
 * an den Screenreader übergeben. Zwei Mechanismen (umschaltbar über die
 * Einstellung `blindcode.speechMechanism`):
 *
 *  - "ariaLive" (Standard): Webview mit aria-live-Region. VS Code bietet Extensions
 *    KEINE direkte Screenreader-Announce-API; eine aria-live-Region im Webview ist
 *    der robuste, plattformübergreifende Weg. Das Panel ist sichtbar (beside,
 *    preserveFocus) — ein wirklich verstecktes Webview ist über die API nicht
 *    möglich; akzeptierter Architektur-Workaround (Kap. 4.3).
 *    Der Text wird erst nach dem 'ready'-Handshake gepostet, sonst ginge die
 *    ERSTE Ansage verloren (das Webview-Skript läuft nach createWebviewPanel).
 *  - "notification": vscode.window.showInformationMessage — wird von VoiceOver/NVDA
 *    zuverlässig vorgelesen, ist aber aufdringlich. Garantierter Fallback.
 *
 * Die Statusleiste ([type]/Kurzlabel) ist für die Versuchsleiterin gedacht — sie
 * wird von VoiceOver nicht zuverlässig vorgelesen und ist daher NICHT der
 * Sprachkanal für Proband:innen.
 */

interface Announcer extends vscode.Disposable {
    announce(text: string): void;
    /** Ausgabekanal vorab aufbauen (vor der Sitzung), damit die Ansage sofort sitzt. */
    prepare(): void;
    /** Ausgabekanal wieder abbauen (z. B. Bedingung A: keine sichtbaren Panels). */
    close(): void;
}

/** aria-live-Region in einem Webview (Standard). */
class AriaLiveAnnouncer implements Announcer {
    private panel: vscode.WebviewPanel | undefined;
    /** Erst nach dem 'ready'-Handshake nimmt das Webview Nachrichten an. */
    private ready = false;
    /** Ansage, die vor dem Handshake anfiel (nur die JÜNGSTE ist relevant). */
    private pending: string | undefined;

    private ensurePanel(): vscode.WebviewPanel {
        if (this.panel) {
            return this.panel;
        }
        const panel = vscode.window.createWebviewPanel(
            'blindcodeSpeech',
            'BlindCode Sprachausgabe',
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
            { enableScripts: true, retainContextWhenHidden: true }
        );
        this.panel = panel;
        // WICHTIG: erst den Empfänger registrieren, dann das HTML setzen.
        panel.webview.onDidReceiveMessage(message => {
            if (message?.type !== 'ready') { return; }
            this.ready = true;
            // Die Ansage nachholen, die den Panel-Aufbau ausgelöst hat.
            if (this.pending !== undefined) {
                const text = this.pending;
                this.pending = undefined;
                void panel.webview.postMessage({ text });
            }
        });
        panel.webview.html = this.html();
        panel.onDidDispose(() => {
            this.panel = undefined;
            this.ready = false;
            this.pending = undefined;
        });
        return panel;
    }

    private html(): string {
        const nonce = String(Math.random()).slice(2);
        // Leeren + verzögertes Setzen erzwingt eine Änderung der Live-Region,
        // sodass auch identischer Text erneut vorgelesen wird.
        return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 8px; }
  h2 { font-size: 1em; margin: 0 0 2px; }
  #note { color: var(--vscode-descriptionForeground); font-size: .85em; margin: 0 0 10px; }
  /* Die Live-Region ist der Screenreader-Kanal und bleibt visuell unauffällig. */
  #live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  ol { list-style: none; margin: 0; padding: 0; }
  li { display: flex; gap: 8px; padding: 3px 0; border-bottom: 1px solid var(--vscode-panel-border); }
  li:first-child .text { font-weight: 600; }
  .zeit { color: var(--vscode-descriptionForeground); font-size: .85em; font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
<h2>BlindCode Sprachausgabe</h2>
<p id="note">Mitschrift für die Begleitung — neueste Ansage oben. Die vorgelesene
Ausgabe selbst läuft über eine unsichtbare Live-Region.</p>
<div id="live" aria-live="assertive" role="alert"></div>
<ol id="log" aria-hidden="true"></ol>
<script nonce="${nonce}">
  const vscodeApi = acquireVsCodeApi();
  const live = document.getElementById('live');
  const log = document.getElementById('log');
  const MAX = 200;
  function zeitstempel() {
    const d = new Date(), p = (n, w = 2) => String(n).padStart(w, '0');
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds())
      + '.' + p(d.getMilliseconds(), 3);
  }
  window.addEventListener('message', (e) => {
    // 1. Screenreader-Kanal: Leeren + verzögertes Setzen erzwingt eine Änderung der
    //    Live-Region, sodass auch identischer Text erneut vorgelesen wird.
    live.textContent = '';
    setTimeout(() => { live.textContent = e.data.text; }, 30);
    // 2. Sicht-Kanal: Mitschrift. aria-hidden, damit der Screenreader sie NICHT
    //    zusätzlich vorliest — sonst käme jede Ansage doppelt.
    const li = document.createElement('li');
    const t = document.createElement('span');
    t.className = 'zeit';
    t.textContent = zeitstempel();
    const s = document.createElement('span');
    s.className = 'text';
    s.textContent = e.data.text;
    li.appendChild(t); li.appendChild(s);
    log.insertBefore(li, log.firstChild);
    while (log.childElementCount > MAX) { log.removeChild(log.lastChild); }
  });
  // Handshake: Nachrichten, die vor dem Laden dieses Skripts gepostet werden,
  // gehen verloren. Erst hier ist der Empfänger oben registriert.
  vscodeApi.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
    }

    announce(text: string): void {
        const panel = this.ensurePanel();
        this.ensureBeside(panel);
        if (this.ready) {
            void panel.webview.postMessage({ text });
        } else {
            // Panel wird gerade erst aufgebaut → zwischenspeichern statt verlieren.
            // Nur der jüngste Stand zählt: eine überholte Position anzusagen wäre falsch.
            this.pending = text;
        }
    }

    /**
     * Hält das Panel SICHTBAR und in einer eigenen Editor-Gruppe neben dem Code.
     *
     * Grund: Ein verstecktes Webview steht nicht im Accessibility-Baum — die
     * Live-Region wird dann von VoiceOver gar nicht erst gesehen, und die Ansage
     * geht lautlos verloren. Landet die Mitschrift in derselben Gruppe wie die
     * Java-Datei (z. B. weil die Datei nach dem Panel geöffnet wurde), verdeckt
     * der Code-Tab sie dauerhaft.
     *
     * Deshalb: liegt das Panel in der Spalte des aktiven Editors oder ist es
     * unsichtbar, wird es einmalig nach nebenan geholt. Danach ist die Bedingung
     * falsch und `reveal` läuft nicht mehr — kein Flackern bei jedem Tastendruck.
     * `preserveFocus` lässt den Cursor im Code, sonst wäre die nächste Alt-Taste weg.
     */
    private ensureBeside(panel: vscode.WebviewPanel): void {
        const codeColumn = vscode.window.activeTextEditor?.viewColumn;
        if (!panel.visible || (codeColumn !== undefined && panel.viewColumn === codeColumn)) {
            panel.reveal(vscode.ViewColumn.Beside, true);
        }
    }

    /**
     * Baut das Panel VOR der ersten Ansage auf. Zwei Gründe:
     *  1. Die Editor-Aufteilung (Panel „beside") ändert sich dann einmalig beim
     *     Öffnen der Datei — nicht mitten in der Sitzung beim ersten Tastendruck.
     *  2. Der 'ready'-Handshake ist bis zum ersten Alt-Tastendruck längst durch.
     * `preserveFocus` sorgt dafür, dass der Editor den Fokus behält.
     */
    prepare(): void {
        this.ensurePanel();
    }

    close(): void {
        this.panel?.dispose(); // onDidDispose setzt panel/ready/pending zurück
    }

    dispose(): void {
        this.panel?.dispose();
        this.panel = undefined;
        this.ready = false;
        this.pending = undefined;
    }
}

/** Fallback: Benachrichtigung (von Screenreadern zuverlässig vorgelesen). */
class NotificationAnnouncer implements Announcer {
    announce(text: string): void {
        vscode.window.showInformationMessage(text);
    }
    prepare(): void { /* kein Panel nötig */ }
    close(): void { /* kein Panel nötig */ }
    dispose(): void { /* nichts zu tun */ }
}

export class SpeechController implements vscode.Disposable {
    private announcer: Announcer;
    private readonly configListener: vscode.Disposable;
    /** Ist der Sprachkanal laut Bedingung scharf geschaltet? (siehe setActive) */
    private active = false;
    /** Noch ausstehende, verzögerte Ansage (siehe announceDelayed). */
    private pendingTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(private readonly statusBar: vscode.StatusBarItem) {
        this.announcer = SpeechController.createAnnouncer();
        // Mechanismus zur Laufzeit umschaltbar (wichtig für den Pilot-Test).
        this.configListener = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('blindcode.speechMechanism')) {
                this.announcer.dispose();
                this.announcer = SpeechController.createAnnouncer();
                // Den neuen Kanal genauso vorbereiten wie den alten — sonst ginge der
                // Vorlauf beim Umschalten mitten in der Sitzung verloren.
                if (this.active) {
                    this.announcer.prepare();
                }
            }
        });
    }

    private static createAnnouncer(): Announcer {
        const mechanism = vscode.workspace
            .getConfiguration('blindcode')
            .get<string>('speechMechanism', 'ariaLive');
        return mechanism === 'notification'
            ? new NotificationAnnouncer()
            : new AriaLiveAnnouncer();
    }

    /** Aktualisiert nur die Statusleiste (für die Versuchsleiterin), keine Sprache. */
    showStatus(node: OutlineNode): void {
        this.statusBar.text = `BCNav: ${describeOutlineNode(node)}`;
    }

    /**
     * AUTOMATISCHE Ansage bei einer Navigation. Im Modus `off` schweigt sie — dann
     * navigiert man allein nach Gehör (Ton) und fragt bei Bedarf mit Alt+W nach.
     * Die Statusleiste wird immer gesetzt (sie ist für die sehende Begleitung).
     */
    announce(node: OutlineNode): void {
        this.cancelPending();
        this.statusBar.text = `BCNav: ${describeOutlineNode(node)}`;
        const mode = modeFromConfig();
        if (mode === 'off') { return; }
        this.announcer.announce(buildContextString(node, mode));
    }

    /**
     * Spricht den Kontext erst NACH `delayMs`. Gebraucht für „Wo bin ich?" (Alt+W):
     * Dort läuft zuerst das Zähl-Earcon; würde die Sprache sofort starten, liefen
     * Klicks und Screenreader gleichzeitig und beide wären schlechter verständlich.
     * Die Statusleiste wird sofort gesetzt (sie ist für die sehende Begleitung).
     * Ein erneuter Aufruf — oder jede andere Ansage — verwirft die ausstehende:
     * eine überholte Position anzusagen wäre falsch.
     */
    announceDelayed(node: OutlineNode, delayMs: number): void {
        this.cancelPending();
        this.statusBar.text = `BCNav: ${describeOutlineNode(node)}`;
        // AUSDRÜCKLICH angefragt (Alt+W) → spricht auch im Modus `off`, und dann mit
        // voller Auskunft: Wer stumm navigiert und dann nachfragt, will alles wissen.
        const text = buildContextString(node, explicitVerbosity(modeFromConfig()));
        if (delayMs <= 0) {
            this.announcer.announce(text);
            return;
        }
        this.pendingTimer = setTimeout(() => {
            this.pendingTimer = undefined;
            this.announcer.announce(text);
        }, delayMs);
    }

    /**
     * Schaltet den Sprach-Modus eine Stufe weiter (Alt+M) und liefert den neuen Modus.
     * Der neue Zustand sagt sich selbst an — auch „aus": Die Ansage läuft noch, bevor
     * gemutet wird, sodass man nie im Unklaren ist, in welchem Modus man gelandet ist.
     */
    async cycleMode(): Promise<SpeechMode> {
        const next = nextSpeechMode(modeFromConfig());
        await vscode.workspace.getConfiguration('blindcode.speech')
            .update('verbosity', next, vscode.ConfigurationTarget.Global);
        this.cancelPending();
        this.announcer.announce(SPEECH_MODE_LABELS[next]);
        return next;
    }

    private cancelPending(): void {
        if (this.pendingTimer) {
            clearTimeout(this.pendingTimer);
            this.pendingTimer = undefined;
        }
    }

    /**
     * Spricht einen freien Text (z. B. die Eintauch-Ansage „… betreten, 2 Elemente:
     * …") und setzt die Statusleiste auf den Zielknoten.
     */
    announceMessage(text: string, node: OutlineNode): void {
        this.cancelPending();
        this.statusBar.text = `BCNav: ${describeOutlineNode(node)}`;
        if (modeFromConfig() === 'off') { return; } // ebenfalls automatisch
        this.announcer.announce(text);
    }

    /** Spricht rohen Text unverändert (z. B. eine Quelltextzeile bei Alt+L). */
    announceRaw(text: string): void {
        this.cancelPending();
        this.announcer.announce(text);
    }

    /**
     * Schaltet den Ausgabekanal scharf (Bedingung B/C) bzw. ab (Bedingung A).
     * Aktiv: Panel wird vorab aufgebaut, damit die erste Ansage sofort sitzt und
     * die Editor-Aufteilung vor Sitzungsbeginn steht.
     * Inaktiv: kein sichtbares Panel — Bedingung A muss vollständig inert wirken.
     */
    setActive(active: boolean): void {
        this.active = active;
        if (active) {
            this.announcer.prepare();
        } else {
            this.announcer.close();
        }
    }

    dispose(): void {
        this.cancelPending();
        this.configListener.dispose();
        this.announcer.dispose();
    }
}
