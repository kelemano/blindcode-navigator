import * as vscode from 'vscode';
import type { OutlineNode } from './navigator';
import {
    toneForDepth,
    errorTone,
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
        const webview = this.ensurePanel();
        // Fehler-/fehlende Knoten: eigener dissonanter Fehler-Earcon statt Tiefen-Ton.
        if (node.kind === 'error' || node.kind === 'missing') {
            webview.postMessage({ type: 'tone', ...errorTone() });
            return;
        }
        const depth = sonificationDepth(node, depthConfigFromSettings());
        webview.postMessage({ type: 'tone', ...toneForDepth(depth) });
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
        this.panel.webview.onDidReceiveMessage(message => {
            if (message?.type === 'ready') {
                this.postConfig();
            } else if (message?.type === 'setDepthMode' && typeof message.mode === 'string') {
                void vscode.workspace
                    .getConfiguration('blindcode.sonification')
                    .update('depthMode', message.mode, vscode.ConfigurationTarget.Global)
                    .then(() => this.postConfig());
            }
        });
        this.panel.onDidDispose(() => { this.panel = undefined; });
        return this.panel.webview;
    }

    /** Sendet den aktuellen Tiefen-Modus an das Panel (Auswahl synchron halten). */
    private postConfig(): void {
        this.panel?.webview.postMessage({
            type: 'config',
            depthMode: depthConfigFromSettings().depthMode,
        });
    }

    /** Wird vom Konfigurations-Listener aufgerufen, falls sich die Einstellungen ändern. */
    refreshConfig(): void {
        this.postConfig();
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
  h3 { font-size: .9em; margin: 14px 0 4px; }
  p { color: var(--vscode-descriptionForeground); }
  #last { font-size: 1.4em; margin: 8px 0; }
  button { font: inherit; padding: 4px 10px; }
  label { display: block; margin: 6px 0 2px; }
  select { font: inherit; padding: 3px; min-width: 16em; }
  .row { margin: 8px 0; }
  code { background: var(--vscode-textCodeBlock-background); padding: 0 4px; border-radius: 3px; }
  pre { background: var(--vscode-textCodeBlock-background); padding: 8px; border-radius: 4px; overflow:auto; }
  .muted { color: var(--vscode-descriptionForeground); font-size: .9em; }
</style>
</head>
<body>
<h2>BlindCode Sonifikation (Audio)</h2>
<p>Tiefe → Tonhöhe (tiefer verschachtelt = höher). Dieses Panel erzeugt nur den Ton.</p>
<div id="last">—</div>
<p id="hint"></p>
<button id="enable" type="button">Audio aktivieren</button>

<div class="row">
  <label for="depthMode">Tiefen-Modus (welche Knoten als Ebene zählen):</label>
  <select id="depthMode">
    <option value="control">control — nur Kontrollstrukturen (Standard) · println = Tiefe 4 (550 Hz)</option>
    <option value="control-and-methods">control-and-methods — + Methode · println = 5 (660 Hz)</option>
    <option value="full-scope">full-scope — Klasse + Methode · println = 6 (880 Hz)</option>
  </select>
  <p class="muted">Ändert nur die Tonhöhe — Baumansicht und Sprachausgabe bleiben gleich.
  Für die Studie den Standard <code>control</code> lassen.</p>
</div>

<h3>Auch per Einstellungen / Terminal</h3>
<p class="muted">Einstellungen-UI: <code>⌘,</code> → nach <code>blindcode.sonification.depthMode</code> suchen.<br>
settings.json (Befehlspalette <code>⌘⇧P</code> → „Preferences: Open User Settings (JSON)") bzw. per Terminal in die Datei schreiben:</p>
<pre>{
  "blindcode.sonification.depthMode": "control",
  "blindcode.sonification.customDepthNodeTypes": ["if_statement","for_statement"]
}</pre>
<p class="muted">macOS-Pfad: <code>~/Library/Application Support/Code/User/settings.json</code>
(Insiders: <code>Code - Insiders</code>). <code>customDepthNodeTypes</code> überschreibt den Modus
(nur die gelisteten tree-sitter-Knotentypen zählen). Ton an/aus: <code>Alt+S</code>.</p>

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
  // Dissonanter, tiefer Fehler-Earcon (zwei leicht verstimmte Sägezähne).
  function playError(c, t0, m) {
    [m.frequency, m.frequency * 1.06].forEach(freq => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t0);
      osc.connect(gain).connect(c.destination);
      const dur = m.durationMs / 1000, rel = m.releaseMs / 1000;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(m.volume, t0 + m.attackMs / 1000);
      gain.gain.linearRampToValueAtTime(0, t0 + dur);
      osc.start(t0);
      osc.stop(t0 + dur + rel);
    });
  }
  function onTone(m) {
    const c = ensureCtx();
    const t0 = c.currentTime;
    if (m.error) {
      playError(c, t0, m);
      document.getElementById('last').textContent = '⚠ Syntaxfehler / fehlender Code';
    } else {
      playTone(c, m.frequency, t0, m);
      if (m.warning) {
        // Code-Smell-Warnton: kurzer, höherer Piep kurz nach dem Hauptton.
        playTone(c, 990, t0 + 0.18, { volume: m.volume, attackMs: 5, decayMs: 30, durationMs: 60, releaseMs: 40 });
      }
      document.getElementById('last').textContent =
        'Tiefe ' + m.depth + ' → ' + m.frequency + ' Hz' + (m.warning ? '  ⚠ zu tief verschachtelt' : '');
    }
    document.getElementById('hint').textContent =
      (c.state === 'suspended') ? 'Kein Ton? Einmal „Audio aktivieren" klicken.' : '';
  }
  document.getElementById('enable').addEventListener('click', () => {
    ensureCtx();
    document.getElementById('hint').textContent = '';
  });
  const depthModeSelect = document.getElementById('depthMode');
  depthModeSelect.addEventListener('change', () => {
    vscode.postMessage({ type: 'setDepthMode', mode: depthModeSelect.value });
  });
  window.addEventListener('message', e => {
    const m = e.data;
    if (!m) { return; }
    if (m.type === 'tone') { onTone(m); }
    else if (m.type === 'config') { depthModeSelect.value = m.depthMode; }
  });
  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
    }
}
