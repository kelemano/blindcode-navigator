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
    /** true → Status-Earcon „bereit" (zwei Noten aufwärts), KEINE Sonifikation. */
    greeting: boolean;
    /**
     * > 0 → Zähl-Earcon für „Wo bin ich?": Ankerton + so viele Klicks wie Ebenen.
     * Der Wert ist die Anzahl der KLICKS (Tiefe 0 → 0 Klicks, nur der Anker).
     */
    countClicks?: number;
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
        greeting: false,
        durationMs: 260,
        volume: 0.3,
        attackMs: 5,
        decayMs: 60,
        releaseMs: 140,
    };
}

/** Parameter des Zähl-Earcons („Wo bin ich?", Alt+W). Siehe countTone(). */
export const COUNT_DEFAULTS = {
    /** Ankerton: tief und weich — „Boden", ab hier wird gezählt. */
    anchorHz: 165,
    anchorMs: 200,
    /** Klick: kurz und hoch, bewusst KEIN Ton aus der pentatonischen Reihe. */
    clickHz: 1320,
    clickMs: 40,
    /** Abstand von Klick-Anfang zu Klick-Anfang (Zählbarkeit ~130 ms). */
    clickSpacingMs: 130,
    /** Pause zwischen Anker und erstem Klick. */
    gapMs: 120,
    /** Nachlauf (Stille) am Ende — verlängert die WAV-Datei, siehe renderToneWav. */
    releaseMs: 60,
} as const;

/** Höchste Ebenenzahl, für die ein Zähl-Earcon vorgerendert wird. */
export const COUNT_MAX = 8;

/**
 * Zähl-Earcon für „Wo bin ich?" (Alt+W) — die ABSOLUTE Tiefe als Anzahl.
 *
 * Zweite, bewusst andere Sonifikations-Abbildung neben der Tonhöhe (Kap. 4.4,
 * Entwurfsalternativen). Begründung der Aufteilung:
 *   - Während der BEWEGUNG zählt die Änderung („tiefer/flacher") — das leistet die
 *     Tonhöhe pre-attentiv und in konstanter Dauer.
 *   - Auf ANFRAGE zählt der absolute Wert — den liefert eine Anzahl eindeutig, ohne
 *     Referenzton und ohne musikalische Vorbildung (absolutes Gehör ist selten).
 *     Hier stört die variable Dauer nicht, weil nicht navigiert wird.
 *
 * Form: Ankerton + `clicks` Klicks. Der Anker löst zwei Probleme auf einmal —
 *   1. Tiefe 0 (Klasse/Methode: keine Kontroll-Verschachtelung) wäre sonst STILLE,
 *      und Stille darf in einem barrierefreien Interface nie Information tragen:
 *      sie ist von „kaputt" oder „nicht gedrückt" nicht unterscheidbar.
 *   2. Er ist der Zähl-Auftakt („ab jetzt zählen") — ohne ihn weiß man beim ersten
 *      Klick nicht, ob man den Anfang verpasst hat.
 * Die Klicks haben eine KONSTANTE Höhe: Anzahl und Tonhöhe bleiben orthogonale
 * Abbildungen, sonst würden beide Varianten vermischt.
 */
export function countTone(clicks: number): ToneCommand {
    const safeClicks = Math.max(0, Math.min(COUNT_MAX, Math.floor(clicks)));
    // Ende des letzten hörbaren Ereignisses …
    const lastEventEndMs = safeClicks > 0
        ? COUNT_DEFAULTS.anchorMs + COUNT_DEFAULTS.gapMs
            + (safeClicks - 1) * COUNT_DEFAULTS.clickSpacingMs + COUNT_DEFAULTS.clickMs
        : COUNT_DEFAULTS.anchorMs;
    // … plus Nachlauf: renderToneWav hängt releaseMs an, die Datei ist so lang.
    // durationMs MUSS die Dateilänge abdecken, sonst startet die Sprachansage
    // (die daran terminiert wird) noch während der Ton läuft.
    const totalMs = lastEventEndMs + COUNT_DEFAULTS.releaseMs;
    return {
        depth: safeClicks,
        frequency: COUNT_DEFAULTS.anchorHz,
        warning: false,
        error: false,
        greeting: false,
        countClicks: safeClicks,
        durationMs: totalMs,
        volume: 0.28,
        attackMs: 8,
        decayMs: COUNT_DEFAULTS.anchorMs - 8,
        releaseMs: COUNT_DEFAULTS.releaseMs,
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
        greeting: false,
        durationMs: TONE_DEFAULTS.durationMs,
        volume: TONE_DEFAULTS.volume,
        attackMs: TONE_DEFAULTS.attackMs,
        decayMs: TONE_DEFAULTS.decayMs,
        releaseMs: TONE_DEFAULTS.releaseMs,
    };
}

/**
 * Status-Earcon „System bereit" (beim Aktivieren der Extension).
 *
 * AUSDRÜCKLICH KEIN TEIL DER SONIFIKATION: Dieser Ton bildet keine Codestruktur ab,
 * sondern meldet einen Systemzustand — wie der Fehler-Earcon, nur positiv. Deshalb
 * ist er in den Bedingungen B UND C identisch und unabhängig von
 * `blindcode.sonification`; die manipulierte Variable (Tiefe → Tonhöhe während der
 * Navigation) bleibt unberührt. In Bedingung A entfällt er wie alles andere.
 *
 * Form: ZWEI Noten aufwärts (Grundton → Quinte, 440 → 660 Hz). Die Tiefen-Töne sind
 * immer EINZELNE Anschläge — durch die Zweistimmigkeit ist das Startsignal nicht mit
 * einem Tiefen-Ton verwechselbar. Beide Frequenzen stammen aus der pentatonischen
 * Reihe (Tiefe 3 und 5), das Signal bleibt also im Klangfamilien-Kontext.
 */
export function startTone(): ToneCommand {
    return {
        depth: 0,
        frequency: 440, // Grundton; die Quinte darüber ergänzt wavSynth
        warning: false,
        error: false,
        greeting: true,
        durationMs: 180,
        volume: 0.25, // etwas leiser als die Navigations-Töne (Begrüßung, kein Signalton)
        attackMs: 8,
        decayMs: 70,
        releaseMs: 120,
    };
}
