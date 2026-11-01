import { COUNT_DEFAULTS, type ToneCommand } from './sonification';

/**
 * WAV-Synthese — reine Logik (kein VS Code, kein Web Audio), damit unit-testbar.
 *
 * Erzeugt aus einem ToneCommand (denselben Parametern wie sonification.ts) einen
 * fertigen 16-bit-PCM-WAV-Puffer. Die Töne werden vom Extension-Host als Datei
 * abgelegt und über den System-Player (afplay) abgespielt — dadurch entfällt die
 * Webview und ihre Autoplay-Sperre (kein „einmal klicken" mehr): Tastendruck → Ton.
 *
 * Die Wellenform/Hüllkurve bildet exakt die frühere Webview-Umsetzung nach:
 *   - Tiefen-Ton: Sinus mit „Pluck"-Hüllkurve (attack → decay auf 0, sustain 0).
 *   - Warnton (Tiefe > 6): zusätzlicher kurzer 990-Hz-Piep 180 ms nach dem Hauptton.
 *   - Fehler-Earcon: zwei leicht verstimmte Sägezähne (dissonant, tief).
 */

const SAMPLE_RATE = 44100;

/** Intervall des Start-Earcons: reine Quinte (440 Hz → 660 Hz). */
const GREETING_INTERVAL = 1.5;
/** Zeitversatz der zweiten Note des Start-Earcons in Sekunden. */
const GREETING_OFFSET_SEC = 0.09;

/** Eine Stimme (Oszillator) mit linearer Hüllkurve: 0 → Lautstärke → 0. */
interface Voice {
    type: 'sine' | 'sawtooth';
    frequency: number;
    /** Startzeitpunkt der Stimme in Sekunden (für den verzögerten Warn-Piep). */
    startSec: number;
    volume: number;
    /** Anstiegszeit in Sekunden (0 → Lautstärke). */
    attackSec: number;
    /** Ende der Hüllkurve in Sekunden (relativ zum Start; hier ist die Lautstärke 0). */
    endSec: number;
}

/** Baut die Stimmen eines Abspielbefehls (spiegelt die Webview-Logik onTone). */
function voicesFor(cmd: ToneCommand): Voice[] {
    const attackSec = cmd.attackMs / 1000;
    if (cmd.countClicks !== undefined) {
        // Zähl-Earcon: weicher Ankerton, danach `countClicks` kurze, hohe Klicks.
        // Tiefe 0 → nur der Anker (nie Stille, siehe countTone).
        const anchorEndSec = COUNT_DEFAULTS.anchorMs / 1000;
        const voices: Voice[] = [{
            type: 'sine',
            frequency: COUNT_DEFAULTS.anchorHz,
            startSec: 0,
            volume: cmd.volume,
            attackSec,
            endSec: anchorEndSec,
        }];
        const firstClickSec = (COUNT_DEFAULTS.anchorMs + COUNT_DEFAULTS.gapMs) / 1000;
        for (let i = 0; i < cmd.countClicks; i++) {
            voices.push({
                type: 'sine',
                frequency: COUNT_DEFAULTS.clickHz,
                startSec: firstClickSec + (i * COUNT_DEFAULTS.clickSpacingMs) / 1000,
                volume: cmd.volume,
                attackSec: 0.004,
                endSec: COUNT_DEFAULTS.clickMs / 1000,
            });
        }
        return voices;
    }
    if (cmd.greeting) {
        // Status-Earcon „bereit": zwei kurze Sinus-Noten aufwärts. Bewusst ZWEI
        // Ereignisse — Tiefen-Töne sind immer einzelne Anschläge, dadurch ist das
        // Startsignal nicht mit einem Tiefen-Ton verwechselbar.
        const noteEndSec = (cmd.attackMs + cmd.decayMs) / 1000;
        return [0, GREETING_OFFSET_SEC].map((startSec, index) => ({
            type: 'sine' as const,
            frequency: index === 0 ? cmd.frequency : cmd.frequency * GREETING_INTERVAL,
            startSec,
            volume: cmd.volume,
            attackSec,
            endSec: noteEndSec,
        }));
    }
    if (cmd.error) {
        // Zwei leicht verstimmte Sägezähne; Hüllkurve läuft bis durationMs auf 0.
        const endSec = cmd.durationMs / 1000;
        return [cmd.frequency, cmd.frequency * 1.06].map(frequency => ({
            type: 'sawtooth' as const,
            frequency,
            startSec: 0,
            volume: cmd.volume,
            attackSec,
            endSec,
        }));
    }
    const voices: Voice[] = [{
        type: 'sine',
        frequency: cmd.frequency,
        startSec: 0,
        volume: cmd.volume,
        attackSec,
        endSec: (cmd.attackMs + cmd.decayMs) / 1000, // Pluck: attack → decay auf 0
    }];
    if (cmd.warning) {
        // Code-Smell-Warnton: kurzer, höherer Piep kurz nach dem Hauptton.
        voices.push({
            type: 'sine',
            frequency: 990,
            startSec: 0.18,
            volume: cmd.volume,
            attackSec: 0.005,
            endSec: 0.035,
        });
    }
    return voices;
}

/** Lineare Hüllkurve einer Stimme zum (stimmen-lokalen) Zeitpunkt t. */
function envelope(voice: Voice, localSec: number): number {
    if (localSec < 0 || localSec >= voice.endSec) {
        return 0;
    }
    if (localSec < voice.attackSec) {
        return voice.volume * (localSec / voice.attackSec);
    }
    const decaySpan = voice.endSec - voice.attackSec;
    return voice.volume * (1 - (localSec - voice.attackSec) / decaySpan);
}

/** Momentanwert der Wellenform bei Phase x (in Perioden). */
function waveform(type: Voice['type'], x: number): number {
    if (type === 'sine') {
        return Math.sin(2 * Math.PI * x);
    }
    // Sägezahn in [-1, 1].
    return 2 * (x - Math.floor(x + 0.5));
}

/** Schreibt den 44-Byte-WAV-Header (PCM, mono, 16 bit) in den Puffer. */
function writeHeader(buffer: Buffer, dataBytes: number): void {
    const blockAlign = 2; // 1 Kanal * 16 bit / 8
    buffer.write('RIFF', 0, 'ascii');
    buffer.writeUInt32LE(36 + dataBytes, 4);
    buffer.write('WAVE', 8, 'ascii');
    buffer.write('fmt ', 12, 'ascii');
    buffer.writeUInt32LE(16, 16);              // fmt-Chunk-Länge
    buffer.writeUInt16LE(1, 20);               // Audioformat = PCM
    buffer.writeUInt16LE(1, 22);               // Kanäle = 1
    buffer.writeUInt32LE(SAMPLE_RATE, 24);
    buffer.writeUInt32LE(SAMPLE_RATE * blockAlign, 28); // Byte-Rate
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(16, 34);              // Bits pro Sample
    buffer.write('data', 36, 'ascii');
    buffer.writeUInt32LE(dataBytes, 40);
}

/**
 * Rendert ein ToneCommand zu einem WAV-Puffer (16-bit-PCM, mono, 44,1 kHz).
 * Faithful zu sonification.ts + der früheren Webview-Wiedergabe.
 */
export function renderToneWav(cmd: ToneCommand): Buffer {
    const voices = voicesFor(cmd);
    const releaseSec = cmd.releaseMs / 1000;
    const totalSec =
        Math.max(...voices.map(v => v.startSec + v.endSec)) + releaseSec;
    const numSamples = Math.max(1, Math.ceil(totalSec * SAMPLE_RATE));
    const dataBytes = numSamples * 2;

    const buffer = Buffer.alloc(44 + dataBytes);
    writeHeader(buffer, dataBytes);

    for (let i = 0; i < numSamples; i++) {
        const t = i / SAMPLE_RATE;
        let sample = 0;
        for (const voice of voices) {
            const localSec = t - voice.startSec;
            const gain = envelope(voice, localSec);
            if (gain !== 0) {
                sample += gain * waveform(voice.type, voice.frequency * localSec);
            }
        }
        // Auf [-1, 1] begrenzen (bei überlagerten Stimmen möglich) und zu int16.
        const clamped = Math.max(-1, Math.min(1, sample));
        buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
    }
    return buffer;
}
