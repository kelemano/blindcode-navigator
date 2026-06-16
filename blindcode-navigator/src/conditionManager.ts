/**
 * Bedingungssteuerung A/B/C (Komponente "ConditionManager", Kap. 4.1 / Methodik 6.1).
 *
 * Reine Logik ohne VS-Code-Abhängigkeit (unit-testbar). Schaltet die Funktionen je
 * Studienbedingung an/aus — wichtig für die interne Validität der Studie:
 *
 *   A = Kontrolle: alles aus (nur der Screenreader der/des Proband:in).
 *   B = Navigation + Kontext-Sprachausgabe, OHNE Sonifikation.
 *   C = alles an (Navigation + Sprache + Sonifikation).
 */

export type StudyCondition = 'A' | 'B' | 'C';

export type Feature = 'navigation' | 'speech' | 'sonification';

/** Funktions-Matrix je Bedingung. */
const FEATURE_MATRIX: Record<StudyCondition, Record<Feature, boolean>> = {
    A: { navigation: false, speech: false, sonification: false },
    B: { navigation: true, speech: true, sonification: false },
    C: { navigation: true, speech: true, sonification: true },
};

export class ConditionManager {
    /** Ist `feature` in `condition` aktiv? (reine Abbildung; DoD M5) */
    static isFeatureEnabled(feature: Feature, condition: StudyCondition): boolean {
        return FEATURE_MATRIX[condition]?.[feature] ?? false;
    }

    constructor(private condition: StudyCondition) {}

    get current(): StudyCondition {
        return this.condition;
    }

    setCondition(condition: StudyCondition): void {
        this.condition = condition;
    }

    /** Ist `feature` in der aktuell gesetzten Bedingung aktiv? */
    isEnabled(feature: Feature): boolean {
        return ConditionManager.isFeatureEnabled(feature, this.condition);
    }
}
