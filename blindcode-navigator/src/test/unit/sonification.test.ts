import * as assert from 'assert';
import { depthToFrequency, toneForDepth, TONE_DEFAULTS } from '../../sonification';

suite('sonification — Tiefe → Frequenz (pentatonisch)', () => {

    test('Tiefe 1..6 ergibt die pentatonische Tabelle', () => {
        assert.strictEqual(depthToFrequency(1).frequency, 220);
        assert.strictEqual(depthToFrequency(2).frequency, 330);
        assert.strictEqual(depthToFrequency(3).frequency, 440);
        assert.strictEqual(depthToFrequency(4).frequency, 550);
        assert.strictEqual(depthToFrequency(5).frequency, 660);
        assert.strictEqual(depthToFrequency(6).frequency, 880);
    });

    test('Tiefe 1..6 löst keinen Warnton aus', () => {
        for (let d = 1; d <= 6; d++) {
            assert.strictEqual(depthToFrequency(d).warning, false, `Tiefe ${d}`);
        }
    });

    test('Tiefe > 6 → 880 Hz + Warnton (Code-Smell)', () => {
        for (const d of [7, 8, 12]) {
            assert.deepStrictEqual(depthToFrequency(d), { frequency: 880, warning: true });
        }
    });

    test('tiefer = höher (monoton steigend bis Tiefe 6)', () => {
        for (let d = 1; d < 6; d++) {
            assert.ok(
                depthToFrequency(d + 1).frequency > depthToFrequency(d).frequency,
                `Tiefe ${d + 1} sollte höher klingen als ${d}`
            );
        }
    });

    test('Tiefe < 1 wird auf 1 geklemmt (oberste Ebene = tiefster Ton)', () => {
        assert.strictEqual(depthToFrequency(0).frequency, 220);
        assert.strictEqual(depthToFrequency(-3).frequency, 220);
        assert.strictEqual(depthToFrequency(0).warning, false);
    });

    test('toneForDepth liefert Frequenz, Warn-Flag und Hüllkurven-Defaults', () => {
        const tone = toneForDepth(3);
        assert.strictEqual(tone.frequency, 440);
        assert.strictEqual(tone.warning, false);
        assert.strictEqual(tone.depth, 3);
        assert.strictEqual(tone.durationMs, TONE_DEFAULTS.durationMs);
        assert.strictEqual(tone.volume, TONE_DEFAULTS.volume);
        assert.strictEqual(tone.attackMs, TONE_DEFAULTS.attackMs);
        assert.strictEqual(tone.decayMs, TONE_DEFAULTS.decayMs);
        assert.strictEqual(tone.releaseMs, TONE_DEFAULTS.releaseMs);
    });

    test('toneForDepth bei Tiefe 8 trägt das Warn-Flag', () => {
        assert.strictEqual(toneForDepth(8).warning, true);
        assert.strictEqual(toneForDepth(8).frequency, 880);
    });
});
