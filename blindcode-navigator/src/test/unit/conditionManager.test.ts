import * as assert from 'assert';
import { ConditionManager, StudyCondition, Feature } from '../../conditionManager';

suite('ConditionManager — Bedingungssteuerung A/B/C', () => {

    test('DoD: isFeatureEnabled(\'sonification\', \'B\') === false', () => {
        assert.strictEqual(ConditionManager.isFeatureEnabled('sonification', 'B'), false);
    });

    test('A = alles aus (nur Screenreader)', () => {
        for (const f of ['navigation', 'speech', 'sonification'] as Feature[]) {
            assert.strictEqual(ConditionManager.isFeatureEnabled(f, 'A'), false, f);
        }
    });

    test('B = Navigation + Sprache, keine Sonifikation', () => {
        assert.strictEqual(ConditionManager.isFeatureEnabled('navigation', 'B'), true);
        assert.strictEqual(ConditionManager.isFeatureEnabled('speech', 'B'), true);
        assert.strictEqual(ConditionManager.isFeatureEnabled('sonification', 'B'), false);
    });

    test('C = alles an', () => {
        for (const f of ['navigation', 'speech', 'sonification'] as Feature[]) {
            assert.strictEqual(ConditionManager.isFeatureEnabled(f, 'C'), true, f);
        }
    });

    test('vollständige Matrix', () => {
        const expected: Record<StudyCondition, Record<Feature, boolean>> = {
            A: { navigation: false, speech: false, sonification: false },
            B: { navigation: true, speech: true, sonification: false },
            C: { navigation: true, speech: true, sonification: true },
        };
        for (const c of ['A', 'B', 'C'] as StudyCondition[]) {
            for (const f of ['navigation', 'speech', 'sonification'] as Feature[]) {
                assert.strictEqual(ConditionManager.isFeatureEnabled(f, c), expected[c][f], `${c}/${f}`);
            }
        }
    });

    test('Instanz spiegelt die gesetzte Bedingung und ist umschaltbar', () => {
        const cm = new ConditionManager('A');
        assert.strictEqual(cm.current, 'A');
        assert.strictEqual(cm.isEnabled('navigation'), false);
        cm.setCondition('C');
        assert.strictEqual(cm.current, 'C');
        assert.strictEqual(cm.isEnabled('sonification'), true);
    });
});
