import * as vscode from 'vscode';
import type { OutlineNode } from './navigator';
import { buildContextString, describeOutlineNode } from './contextSpeech';

/**
 * Sprachausgabe-Schicht (VS-Code-Adapter für ContextSpeech, Kap. 4.3/5.3).
 *
 * Trennung: die reine Textbildung liegt in contextSpeech.ts; hier wird der Text
 * an den Screenreader übergeben. Zwei Mechanismen (umschaltbar über die
 * Einstellung `blindcode.speechMechanism`):
 *
 *  - "ariaLive" (Standard): verstecktes Webview mit aria-live-Region. VS Code
 *    bietet Extensions KEINE direkte Screenreader-Announce-API; eine aria-live-
 *    Region im Webview ist der robuste, plattformübergreifende Weg (und dieselbe
 *    Infrastruktur, die M4 für die Sonifikation per Web Audio nutzt).
 *  - "notification": vscode.window.showInformationMessage — wird von VoiceOver/NVDA
 *    zuverlässig vorgelesen, ist aber aufdringlich. Garantierter Fallback.
 *
 * Die Statusleiste ([type]/Kurzlabel) ist für die Versuchsleiterin gedacht — sie
 * wird von VoiceOver nicht zuverlässig vorgelesen und ist daher NICHT der
 * Sprachkanal für Proband:innen.
 */

interface Announcer extends vscode.Disposable {
    announce(text: string): void;
}

/** aria-live-Region in einem Webview (Standard). */
class AriaLiveAnnouncer implements Announcer {
    private panel: vscode.WebviewPanel | undefined;

    private ensurePanel(): vscode.Webview {
        if (this.panel) {
            return this.panel.webview;
        }
        this.panel = vscode.window.createWebviewPanel(
            'blindcodeSpeech',
            'BlindCode Sprachausgabe',
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
            { enableScripts: true, retainContextWhenHidden: true }
        );
        this.panel.webview.html = this.html();
        this.panel.onDidDispose(() => { this.panel = undefined; });
        return this.panel.webview;
    }

    private html(): string {
        const nonce = String(Math.random()).slice(2);
        // Leeren + verzögertes Setzen erzwingt eine Änderung der Live-Region,
        // sodass auch identischer Text erneut vorgelesen wird.
        return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}';">
</head>
<body>
<div id="live" aria-live="assertive" role="alert"></div>
<script nonce="${nonce}">
  const live = document.getElementById('live');
  window.addEventListener('message', (e) => {
    live.textContent = '';
    setTimeout(() => { live.textContent = e.data.text; }, 30);
  });
</script>
</body>
</html>`;
    }

    announce(text: string): void {
        this.ensurePanel().postMessage({ text });
    }

    dispose(): void {
        this.panel?.dispose();
        this.panel = undefined;
    }
}

/** Fallback: Benachrichtigung (von Screenreadern zuverlässig vorgelesen). */
class NotificationAnnouncer implements Announcer {
    announce(text: string): void {
        vscode.window.showInformationMessage(text);
    }
    dispose(): void { /* nichts zu tun */ }
}

export class SpeechController implements vscode.Disposable {
    private announcer: Announcer;
    private readonly configListener: vscode.Disposable;

    constructor(private readonly statusBar: vscode.StatusBarItem) {
        this.announcer = SpeechController.createAnnouncer();
        // Mechanismus zur Laufzeit umschaltbar (wichtig für den Pilot-Test).
        this.configListener = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('blindcode.speechMechanism')) {
                this.announcer.dispose();
                this.announcer = SpeechController.createAnnouncer();
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

    /** Spricht den vollständigen Kontext und aktualisiert die Statusleiste. */
    announce(node: OutlineNode): void {
        const text = buildContextString(node);
        this.statusBar.text = `BCNav: ${describeOutlineNode(node)}`;
        this.announcer.announce(text);
    }

    dispose(): void {
        this.configListener.dispose();
        this.announcer.dispose();
    }
}
