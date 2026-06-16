/**
 * Sonifikation — reine Logik (Komponente "Sonification", Kap. 4.4).
 *
 * Bildet die Verschachtelungs-TIEFE eines Knotens auf eine TONHÖHE ab
 * (tiefer verschachtelt = höher). Das ist der wissenschaftliche Kern der Arbeit
 * (FF2) und das, was StructJumper nicht hat.
 *
 * Diese Datei enthält KEINE VS-Code-/Audio-Abhängigkeit und ist damit unit-testbar.
 * Die eigentliche Tonerzeugung läuft in einem Webview (Web Audio API), weil der
 * Node.js-Kontext von VS-Code-Extensions kein AudioContext besitzt — siehe
 * sonificationPlayer.ts und Kap. 4.4 (Designentscheidung Webview).
 *
 * Tiefe → Frequenz (pentatonisch, weniger dissonant; Stefik 2011):
 *   1 → 220 Hz (A3) · 2 → 330 (E4) · 3 → 440 (A4) · 4 → 550 (C#5) ·
 *   5 → 660 (E5) · 6 → 880 (A5) · >6 → 880 + Warnton (Code-Smell-Signal)
 */

/** Pentatonische Frequenzen für Tiefe 1..6 (Index 0 = Tiefe 1). */
const PENTATONIC_HZ = [220, 330, 440, 550, 660, 880];

/** Tonparameter (Kap. 4.4): Dauer, Lautstärke, Hüllkurve (attack/decay/sustain/release). */
export const TONE_DEFAULTS = {
    durationMs: 150,
    volume: 0.3,
    attackMs: 10,
    decayMs: 50,
    sustain: 0,
    releaseMs: 90,
} as const;

/** Vollständiger Abspielbefehl, der an das Webview geschickt wird. */
export interface ToneCommand {
    /** Anzuzeigende/abzuspielende Tiefe (für Anzeige im Panel). */
    depth: number;
    /** Trägerfrequenz in Hz. */
    frequency: number;
    /** true ab Tiefe > 6 → zusätzlicher Warnton. */
    warning: boolean;
    durationMs: number;
    volume: number;
    attackMs: number;
    decayMs: number;
    releaseMs: number;
}

/**
 * Tiefe → Frequenz + Warn-Flag. Tiefen < 1 werden auf 1 geklemmt (z. B. die
 * oberste Ebene), Tiefen > 6 liefern 880 Hz mit warning = true.
 */
export function depthToFrequency(depth: number): { frequency: number; warning: boolean } {
    const level = Math.max(1, Math.floor(depth));
    if (level > 6) {
        return { frequency: 880, warning: true };
    }
    return { frequency: PENTATONIC_HZ[level - 1], warning: false };
}

/** Baut den vollständigen Abspielbefehl für eine Tiefe (Frequenz + Hüllkurven-Defaults). */
export function toneForDepth(depth: number): ToneCommand {
    const { frequency, warning } = depthToFrequency(depth);
    return {
        depth,
        frequency,
        warning,
        durationMs: TONE_DEFAULTS.durationMs,
        volume: TONE_DEFAULTS.volume,
        attackMs: TONE_DEFAULTS.attackMs,
        decayMs: TONE_DEFAULTS.decayMs,
        releaseMs: TONE_DEFAULTS.releaseMs,
    };
}
