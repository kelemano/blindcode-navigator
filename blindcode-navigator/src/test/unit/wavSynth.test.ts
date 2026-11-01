import * as assert from 'assert';
import { renderToneWav } from '../../wavSynth';
import { toneForDepth, errorTone, startTone, countTone, COUNT_MAX } from '../../sonification';

/** Liest die vom Header angegebene data-Chunk-Länge (Bytes) aus einem WAV-Puffer. */
function dataBytes(buf: Buffer): number {
    return buf.readUInt32LE(40);
}

/** Höchster Absolutpegel der Samples (0..32767) — prüft „klingt überhaupt". */
function maxAmplitude(buf: Buffer): number {
    let peak = 0;
    for (let offset = 44; offset + 1 < buf.length; offset += 2) {
        peak = Math.max(peak, Math.abs(buf.readInt16LE(offset)));
    }
    return peak;
}

suite('wavSynth — Tonpalette als WAV-Puffer (afplay-Backend)', () => {

    test('erzeugt einen gültigen 16-bit-PCM-mono-WAV-Header', () => {
        const buf = renderToneWav(toneForDepth(3));
        assert.strictEqual(buf.toString('ascii', 0, 4), 'RIFF');
        assert.strictEqual(buf.toString('ascii', 8, 12), 'WAVE');
        assert.strictEqual(buf.toString('ascii', 12, 16), 'fmt ');
        assert.strictEqual(buf.readUInt16LE(20), 1, 'Audioformat = PCM');
        assert.strictEqual(buf.readUInt16LE(22), 1, 'mono');
        assert.strictEqual(buf.readUInt32LE(24), 44100, 'Samplerate');
        assert.strictEqual(buf.readUInt16LE(34), 16, 'Bits pro Sample');
        assert.strictEqual(buf.toString('ascii', 36, 40), 'data');
    });

    test('Puffergröße = 44-Byte-Header + data-Chunk-Länge', () => {
        const buf = renderToneWav(toneForDepth(4));
        assert.strictEqual(buf.length, 44 + dataBytes(buf));
        assert.ok(dataBytes(buf) > 0, 'nicht-leerer Audioanteil');
    });

    test('unterschiedliche Tiefen (Frequenzen) klingen unterschiedlich', () => {
        const low = renderToneWav(toneForDepth(1));   // 220 Hz
        const high = renderToneWav(toneForDepth(6));   // 880 Hz
        assert.ok(!low.equals(high), 'verschiedene Frequenzen → verschiedene Samples');
    });

    test('Warnton (Tiefe > 6) ist länger als der reine Tiefen-Ton (zusätzlicher Piep)', () => {
        const plain = renderToneWav(toneForDepth(6));
        const warn = renderToneWav(toneForDepth(7));
        assert.ok(dataBytes(warn) > dataBytes(plain), 'Warnton reicht bis zum verzögerten Piep');
    });

    test('Fehler-Earcon rendert als gültiges, nicht-leeres WAV', () => {
        const buf = renderToneWav(errorTone());
        assert.strictEqual(buf.toString('ascii', 0, 4), 'RIFF');
        assert.ok(dataBytes(buf) > 0);
    });

    test('Start-Earcon rendert als gültiges, nicht-leeres WAV', () => {
        const buf = renderToneWav(startTone());
        assert.strictEqual(buf.toString('ascii', 0, 4), 'RIFF');
        assert.ok(dataBytes(buf) > 0);
    });

    test('Start-Earcon ist zweistimmig: länger als eine Einzelnote', () => {
        // Die zweite Note startet zeitversetzt → der Puffer muss über die erste
        // Note hinausreichen. Genau das macht ihn von einem Tiefen-Ton (Einzel-
        // anschlag) unterscheidbar.
        const start = startTone();
        const singleNote = renderToneWav({ ...start, greeting: false });
        const twoNotes = renderToneWav(start);
        assert.ok(
            dataBytes(twoNotes) > dataBytes(singleNote),
            'zweite Note verlängert das Signal'
        );
    });

    test('Start-Earcon unterscheidet sich hörbar vom Fehler-Earcon', () => {
        assert.ok(!renderToneWav(startTone()).equals(renderToneWav(errorTone())));
    });

    test('Zähl-Earcon: Tiefe 0 ist NICHT still (nur der Ankerton)', () => {
        // Kernanforderung der Barrierefreiheit: Stille darf nie Information tragen,
        // sonst ist „Tiefe 0" von „kaputt/nicht gedrückt" ununterscheidbar.
        const buf = renderToneWav(countTone(0));
        assert.strictEqual(buf.toString('ascii', 0, 4), 'RIFF');
        assert.ok(dataBytes(buf) > 0, 'Ankerton vorhanden');
        const peak = maxAmplitude(buf);
        assert.ok(peak > 1000, `hörbarer Pegel erwartet, war ${peak}`);
    });

    test('Zähl-Earcon: jeder weitere Klick verlängert das Signal', () => {
        let previous = dataBytes(renderToneWav(countTone(0)));
        for (let clicks = 1; clicks <= 4; clicks++) {
            const current = dataBytes(renderToneWav(countTone(clicks)));
            assert.ok(current > previous, `${clicks} Klicks länger als ${clicks - 1}`);
            previous = current;
        }
    });

    test('Zähl-Earcon: durationMs deckt das gerenderte Audio ab', () => {
        // extension.ts terminiert die Sprachansage anhand von durationMs — der Wert
        // muss mindestens so lang sein wie das tatsächliche Audio, sonst überlappen
        // Klicks und Screenreader doch wieder.
        for (const clicks of [0, 1, 4, COUNT_MAX]) {
            const cmd = countTone(clicks);
            const renderedMs = (dataBytes(renderToneWav(cmd)) / 2 / 44100) * 1000;
            assert.ok(
                cmd.durationMs >= renderedMs - 1,
                `durationMs ${cmd.durationMs} < gerendert ${renderedMs.toFixed(0)} (${clicks} Klicks)`
            );
        }
    });

    test('Zähl-Earcon: Klickzahl wird auf COUNT_MAX begrenzt', () => {
        assert.strictEqual(countTone(99).countClicks, COUNT_MAX);
        assert.strictEqual(countTone(-3).countClicks, 0);
    });
});
