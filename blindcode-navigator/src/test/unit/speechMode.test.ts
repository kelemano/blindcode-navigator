import * as assert from 'assert';
import { nextSpeechMode, SPEECH_MODE_CYCLE, SPEECH_MODE_LABELS, SpeechMode } from '../../contextSpeech';

suite('Sprach-Modus-Ring (Alt+M)', () => {

    test('schaltet in der dokumentierten Reihenfolge weiter', () => {
        assert.strictEqual(nextSpeechMode('high'), 'medium');
        assert.strictEqual(nextSpeechMode('medium'), 'low');
        assert.strictEqual(nextSpeechMode('low'), 'off');
        assert.strictEqual(nextSpeechMode('off'), 'high', 'Ring schließt sich');
    });

    test('vier Tastendrücke führen zum Ausgangszustand zurück', () => {
        let mode: SpeechMode = 'high';
        for (let i = 0; i < SPEECH_MODE_CYCLE.length; i++) { mode = nextSpeechMode(mode); }
        assert.strictEqual(mode, 'high');
    });

    test('jeder Modus sagt sich selbst an — auch „aus"', () => {
        for (const mode of SPEECH_MODE_CYCLE) {
            const label = SPEECH_MODE_LABELS[mode];
            assert.ok(label && label.length > 0, `Ansage fehlt für ${mode}`);
        }
        // Der stumme Modus muss erklären, dass man nicht verloren ist.
        assert.ok(SPEECH_MODE_LABELS.off.includes('Alt+W'));
    });
});
