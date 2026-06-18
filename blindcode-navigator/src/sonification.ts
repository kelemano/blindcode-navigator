import type { OutlineKind, OutlineNode } from './navigator';

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
    /** true → eigener, dissonanter Fehler-Earcon (Syntaxfehler/fehlender Token). */
    error: boolean;
    durationMs: number;
    volume: number;
    attackMs: number;
    decayMs: number;
    releaseMs: number;
}

/**
 * Fehler-Earcon: ein tiefer, dissonanter „Thud" für ERROR-/MISSING-Knoten
 * (kaputter Code). Klar unterscheidbar von den pentatonischen Tiefen-Tönen.
 */
export function errorTone(): ToneCommand {
    return {
        depth: 0,
        frequency: 110, // tief (A2)
        warning: false,
        error: true,
        durationMs: 260,
        volume: 0.3,
        attackMs: 5,
        decayMs: 60,
        releaseMs: 140,
    };
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

/**
 * Tiefen-Modus für die Sonifikation. Die Tiefe ist eine reine PROJEKTION aus dem
 * EINEN kanonischen Outline-Baum — es wird KEIN zweiter Baum gebaut. Es ändert sich
 * nur, welche Knoten entlang des Pfades als Ebene zählen.
 */
export type SonificationDepthMode = 'control' | 'control-and-methods' | 'full-scope';

export interface SonificationDepthConfig {
    depthMode: SonificationDepthMode;
    /** Wenn nicht leer: überschreibt depthMode — nur diese astNode-Typen zählen. */
    customDepthNodeTypes: string[];
}

/** Pro Modus die Outline-Arten, die NICHT als Tiefe zählen. */
const EXCLUDED_KINDS: Record<SonificationDepthMode, ReadonlySet<OutlineKind>> = {
    // Kontroll-Verschachtelung: Klasse/Methode + then/else-Wrapper zählen nicht.
    'control': new Set<OutlineKind>([
        'class', 'interface', 'enum', 'method', 'constructor', 'then-branch', 'else-branch',
    ]),
    // wie control, aber Methode/Konstruktor zählen mit.
    'control-and-methods': new Set<OutlineKind>([
        'class', 'interface', 'enum', 'then-branch', 'else-branch',
    ]),
    // alles außer den then/else-Zweig-Wrappern zählt (Klasse + Methode inklusive).
    'full-scope': new Set<OutlineKind>([
        'then-branch', 'else-branch',
    ]),
};

/**
 * Sonifikations-Tiefe eines Outline-Knotens (reine Projektion). Zählt die Knoten
 * entlang des Pfades Selbst→Wurzel, die laut Konfiguration als Ebene gelten.
 *
 * - customDepthNodeTypes nicht leer → nur Knoten, deren astNode.type in der Liste ist.
 * - sonst nach depthMode (siehe EXCLUDED_KINDS).
 *
 * Ändert NICHT die in der Baumansicht angezeigte Tiefe (outlineDepth) oder die
 * Sprachausgabe — nur die Tonhöhe der Sonifikation.
 */
export function sonificationDepth(node: OutlineNode, config: SonificationDepthConfig): number {
    let depth = 0;
    let current: OutlineNode | null = node;
    if (config.customDepthNodeTypes.length > 0) {
        const allowed = new Set(config.customDepthNodeTypes);
        while (current) {
            if (allowed.has(current.astNode.type)) { depth += 1; }
            current = current.parent;
        }
        return depth;
    }
    const excluded = EXCLUDED_KINDS[config.depthMode] ?? EXCLUDED_KINDS.control;
    while (current) {
        if (!excluded.has(current.kind)) { depth += 1; }
        current = current.parent;
    }
    return depth;
}

/** Baut den vollständigen Abspielbefehl für eine Tiefe (Frequenz + Hüllkurven-Defaults). */
export function toneForDepth(depth: number): ToneCommand {
    const { frequency, warning } = depthToFrequency(depth);
    return {
        depth,
        frequency,
        warning,
        error: false,
        durationMs: TONE_DEFAULTS.durationMs,
        volume: TONE_DEFAULTS.volume,
        attackMs: TONE_DEFAULTS.attackMs,
        decayMs: TONE_DEFAULTS.decayMs,
        releaseMs: TONE_DEFAULTS.releaseMs,
    };
}
