import * as vscode from 'vscode';
import type { OutlineNode } from './navigator';
import {
    toneForDepth,
    sonificationDepth,
    SonificationDepthConfig,
    SonificationDepthMode,
} from './sonification';

/** Liest die Tiefen-Konfiguration der Sonifikation aus den Einstellungen. */
function depthConfigFromSettings(): SonificationDepthConfig {
    const config = vscode.workspace.getConfiguration('blindcode.sonification');
    return {
        depthMode: config.get<SonificationDepthMode>('depthMode', 'control'),
        customDepthNodeTypes: config.get<string[]>('customDepthNodeTypes', []),
    };
}

/**
 * VS-Code-Adapter für die Sonifikation (Kap. 5.3). Hält ein Webview, in dem die
 * Web Audio API läuft (der Node.js-Kontext der Extension hat kein AudioContext —
 * Designentscheidung Webview, Kap. 4.4). `play(depth)` schickt die in
 * sonification.ts berechneten Tonparameter per postMessage an das Webview.
 *
 * Additiv & read-only gegenüber Navigation/Sprache. Über `enabled` an-/abschaltbar
 * (für die Studienbedingungen A/B/C in M5: B = ohne Ton, C = mit Ton).
 */
export class SonificationController implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;

    constructor(private enabled: boolean) {}

    isEnabled(): boolean {
        return this.enabled;
    }

    setEnabled(on: boolean): void {
        this.enabled = on;
        if (!on) {
            // Panel schließen, damit in Bedingung B garantiert kein Ton läuft.
            this.panel?.dispose();
            this.panel = undefined;
        }
    }

    /** Schaltet um und liefert den neuen Zustand. */
    toggle(): boolean {
        this.setEnabled(!this.enabled);
        return this.enabled;
    }

    /**
     * Spielt den Ton für einen Knoten (no-op, wenn deaktiviert). Die Tonhöhen-Tiefe
     * ist eine konfigurierbare Projektion aus dem Outline-Knoten (depthMode /
     * customDepthNodeTypes) — siehe sonificationDepth.
     */
    play(node: OutlineNode): void {
        if (!this.enabled) {
            return;
        }
        const depth = sonificationDepth(node, depthConfigFromSettings());
        this.ensurePanel().postMessage({ type: 'tone', ...toneForDepth(depth) });
    }

    private ensurePanel(): vscode.Webview {
        if (this.panel) {
            return this.panel.webview;
        }
        this.panel = vscode.window.createWebviewPanel(
            'blindcodeSonification',
            'BlindCode Sonifikation',
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
            { enableScripts: true, retainContextWhenHidden: true }
        );
        this.panel.webview.html = this.html();
        this.panel.onDidDispose(() => { this.panel = undefined; });
        return this.panel.webview;
    }

    dispose(): void {
        this.panel?.dispose();
        this.panel = undefined;
    }

    private html(): string {
        const nonce = String(Math.random()).slice(2);
        return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 10px; }
  h2 { font-size: 1em; margin: 0 0 6px; }
  p { color: var(--vscode-descriptionForeground); }
  #last { font-size: 1.4em; margin: 8px 0; }
  button { font: inherit; padding: 4px 10px; }
</style>
</head>
<body>
<h2>BlindCode Sonifikation (Audio)</h2>
<p>Tiefe → Tonhöhe (tiefer verschachtelt = höher). Dieses Panel erzeugt nur den Ton.</p>
<div id="last">—</div>
<p id="hint"></p>
<button id="enable" type="button">Audio aktivieren</button>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  let ctx;
  function ensureCtx() {
    if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    if (ctx.state === 'suspended') { ctx.resume(); }
    return ctx;
  }
  // Ein Ton mit ADSR-Hüllkurve (sustain 0 → kurzer „Pluck").
  function playTone(c, freq, t0, m) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    osc.connect(gain).connect(c.destination);
    const a = m.attackMs / 1000, d = m.decayMs / 1000;
    const dur = m.durationMs / 1000, rel = m.releaseMs / 1000;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(m.volume, t0 + a);
    gain.gain.linearRampToValueAtTime(0, t0 + a + d); // sustain = 0
    osc.start(t0);
    osc.stop(t0 + dur + rel);
  }
  function onTone(m) {
    const c = ensureCtx();
    const t0 = c.currentTime;
    playTone(c, m.frequency, t0, m);
    if (m.warning) {
      // Code-Smell-Warnton: kurzer, höherer Piep kurz nach dem Hauptton.
      playTone(c, 990, t0 + 0.18, { volume: m.volume, attackMs: 5, decayMs: 30, durationMs: 60, releaseMs: 40 });
    }
    document.getElementById('last').textContent =
      'Tiefe ' + m.depth + ' → ' + m.frequency + ' Hz' + (m.warning ? '  ⚠ zu tief verschachtelt' : '');
    document.getElementById('hint').textContent =
      (c.state === 'suspended') ? 'Kein Ton? Einmal „Audio aktivieren" klicken.' : '';
  }
  document.getElementById('enable').addEventListener('click', () => {
    ensureCtx();
    document.getElementById('hint').textContent = '';
  });
  window.addEventListener('message', e => { if (e.data && e.data.type === 'tone') { onTone(e.data); } });
</script>
</body>
</html>`;
    }
}
