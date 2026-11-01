import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import type { NavMovement, OutlineNode } from './navigator';
import {
    ToneCommand,
    toneForDepth,
    errorTone,
    startTone,
    countTone,
    COUNT_MAX,
    depthToFrequency,
    sonificationDepth,
    SonificationDepthConfig,
    SonificationDepthMode,
} from './sonification';
import { renderToneWav } from './wavSynth';

/** macOS-Systemplayer. Bewusst macOS-only (Studien-/Entwicklungsplattform). */
const AFPLAY = '/usr/bin/afplay';

/** Version im Dateinamen → nach Parameteränderung werden Töne neu gerendert. */
const TONE_VERSION = 'v1';

/**
 * Liest die Tiefen-Konfiguration der Sonifikation aus den Einstellungen.
 * Exportiert, damit die Baumansicht DIESELBE Projektion anzeigen kann, die auch
 * vertont wird — sonst sähe die Begleitung eine andere Tiefe als gehört wird.
 */
export function depthConfigFromSettings(): SonificationDepthConfig {
    const config = vscode.workspace.getConfiguration('blindcode.sonification');
    return {
        depthMode: config.get<SonificationDepthMode>('depthMode', 'control'),
        customDepthNodeTypes: config.get<string[]>('customDepthNodeTypes', []),
    };
}

/**
 * VS-Code-Adapter für die Sonifikation (Kap. 5.3).
 *
 * Der Ton wird im Extension-Host als WAV synthetisiert (wavSynth.ts, dieselben
 * Parameter wie sonification.ts) und über den System-Player `afplay` abgespielt.
 * Dadurch entfällt die frühere Webview mit ihrer Autoplay-Sperre: Für die (blinden)
 * Nutzer:innen spielt der Ton ohne sichtbares Panel und ohne einmaligen Klick —
 * Tastendruck → Ton. Backend ist macOS-only.
 *
 * Additiv & read-only gegenüber Navigation/Sprache. Über `enabled` an-/abschaltbar
 * (Studienbedingungen A/B/C: B = ohne Ton, C = mit Ton).
 */
export class SonificationController implements vscode.Disposable {
    /** key → WAV-Dateipfad (Tiefen 1..6, 'warn', 'error'). Einmalig gerendert. */
    private readonly files = new Map<string, string>();
    private rendered = false;
    /** Zuletzt gestarteter afplay-Prozess (wird bei neuem Ton beendet). */
    private current: ChildProcess | undefined;

    constructor(private enabled: boolean, private readonly storageDir: string) {}

    isEnabled(): boolean {
        return this.enabled;
    }

    setEnabled(on: boolean): void {
        this.enabled = on;
        if (!on) {
            this.stopCurrent(); // in Bedingung B garantiert kein Ton
        }
    }

    /** Schaltet um und liefert den neuen Zustand. */
    toggle(): boolean {
        this.setEnabled(!this.enabled);
        return this.enabled;
    }

    /**
     * Spielt den Ton für einen Knoten (no-op, wenn deaktiviert oder nicht macOS).
     * Die Tonhöhen-Tiefe ist eine konfigurierbare Projektion aus dem Outline-Knoten
     * (depthMode / customDepthNodeTypes) — siehe sonificationDepth.
     */
    play(node: OutlineNode, movement: NavMovement): void {
        if (!this.enabled || process.platform !== 'darwin') {
            return;
        }
        // `movement` wird von der aktuellen Abbildung (Tiefe → Tonhöhe) noch nicht
        // ausgewertet — bewusst: Erst ist die Schnittstelle da, die Abbildung bleibt
        // unverändert. Damit sind bewegungsabhängige Varianten (z. B. „bei next/prev
        // die Position auf der Ebene statt der Tiefe") ohne Umbau erprobbar.
        void movement;
        this.ensureRendered();
        const key = this.keyFor(node);
        const file = this.files.get(key);
        if (file) {
            this.playFile(file);
        }
    }

    /**
     * Spielt das Status-Earcon „bereit" (Aktivierung der Extension).
     *
     * Bewusst UNABHÄNGIG von `enabled`: Das Startsignal ist keine Sonifikation — es
     * bildet keine Codestruktur ab, sondern meldet den Systemzustand. Es soll daher
     * auch in Bedingung B kommen, in der die Struktur-Sonifikation aus ist, damit
     * beide Bedingungen dieselbe Rückmeldung „das Werkzeug läuft" geben.
     * Bedingung A wird eine Ebene höher (extension.ts) abgefangen.
     */
    playStart(): void {
        if (process.platform !== 'darwin') {
            return;
        }
        this.ensureRendered();
        const file = this.files.get('start');
        if (file) {
            this.playFile(file);
        }
    }

    /**
     * Spielt das Zähl-Earcon für „Wo bin ich?" (Alt+W) und liefert dessen Dauer in ms
     * (0, wenn nichts abgespielt wurde). Die Dauer braucht der Aufrufer, um die
     * Sprachansage danach zu terminieren — sonst überlagern sich Klicks und Screenreader.
     *
     * ANDERS ALS das Startsignal respektiert dieses Earcon `enabled`: Es bildet die
     * TIEFE EINES CODE-KNOTENS ab und ist damit Struktur-Sonifikation — also genau die
     * manipulierte Variable. In Bedingung B (ohne Sonifikation) bleibt Alt+W deshalb
     * rein sprachlich; erst in C kommt die Zählung hinzu.
     */
    playCountForNode(node: OutlineNode): number {
        if (!this.enabled || process.platform !== 'darwin') {
            return 0;
        }
        const depth = sonificationDepth(node, depthConfigFromSettings());
        const clicks = Math.max(0, Math.min(COUNT_MAX, Math.floor(depth)));
        this.ensureRendered();
        const file = this.files.get(`count-${clicks}`);
        if (!file) {
            return 0;
        }
        this.playFile(file);
        return countTone(clicks).durationMs;
    }

    /** Ordnet einem Knoten die passende Ton-Datei zu. */
    private keyFor(node: OutlineNode): string {
        // Fehler-/fehlende Knoten: eigener dissonanter Fehler-Earcon statt Tiefen-Ton.
        if (node.kind === 'error' || node.kind === 'missing') {
            return 'error';
        }
        const depth = sonificationDepth(node, depthConfigFromSettings());
        if (depthToFrequency(depth).warning) {
            return 'warn';
        }
        return String(Math.max(1, Math.min(6, Math.floor(depth))));
    }

    /** Rendert die Tonpalette einmalig als WAV-Dateien (Tiefen 1..6, Warn, Fehler). */
    private ensureRendered(): void {
        if (this.rendered) {
            return;
        }
        const specs: Array<[string, ToneCommand]> = [];
        for (let level = 1; level <= 6; level++) {
            specs.push([String(level), toneForDepth(level)]);
        }
        specs.push(['warn', toneForDepth(7)]); // 880 Hz + Warn-Piep
        specs.push(['error', errorTone()]);
        specs.push(['start', startTone()]); // Status-Earcon, keine Sonifikation
        // Zähl-Earcons für „Wo bin ich?" (Alt+W): Anker + 0..COUNT_MAX Klicks.
        for (let clicks = 0; clicks <= COUNT_MAX; clicks++) {
            specs.push([`count-${clicks}`, countTone(clicks)]);
        }
        try {
            fs.mkdirSync(this.storageDir, { recursive: true });
            for (const [key, cmd] of specs) {
                const file = path.join(this.storageDir, `bcnav-tone-${TONE_VERSION}-${key}.wav`);
                if (!fs.existsSync(file)) {
                    fs.writeFileSync(file, renderToneWav(cmd));
                }
                this.files.set(key, file);
            }
        } catch {
            // Schreiben fehlgeschlagen → lieber Stille als Absturz.
        }
        this.rendered = true;
    }

    /** Spielt eine WAV-Datei über afplay; beendet einen noch laufenden Ton. */
    private playFile(file: string): void {
        this.stopCurrent();
        try {
            const child = spawn(AFPLAY, [file], { stdio: 'ignore' });
            // Fehlt afplay o. Ä. → stiller No-op statt unbehandeltem Fehler.
            child.on('error', () => { /* ignore */ });
            this.current = child;
        } catch {
            // ignore
        }
    }

    private stopCurrent(): void {
        if (this.current) {
            this.current.kill();
            this.current = undefined;
        }
    }

    dispose(): void {
        this.stopCurrent();
    }
}
