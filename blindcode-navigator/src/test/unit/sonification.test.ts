import * as assert from 'assert';
import {
    depthToFrequency,
    toneForDepth,
    TONE_DEFAULTS,
    sonificationDepth,
    SonificationDepthConfig,
} from '../../sonification';
import { buildOutline, OutlineNode } from '../../navigator';
import { parseJava } from './helpers';

const MATH_LOGIC = `public class MathLogic {
  public int calculate(int x) {
    if (x > 0) {
      for (int i = 0; i < x; i++) {
        if (i % 2 == 0) {
          System.out.println(i);
        }
      }
    } else {
      return -1;
    }
    return x;
  }
}`;

const outline = buildOutline(parseJava(MATH_LOGIC).rootNode);
function node(kind: string, line: number): OutlineNode {
    const n = outline.linear.find(
        x => x.kind === kind && x.astNode.startPosition.row === line - 1
    );
    assert.ok(n, `${kind} in Zeile ${line}`);
    return n!;
}
const cfg = (
    depthMode: SonificationDepthConfig['depthMode'],
    customDepthNodeTypes: string[] = []
): SonificationDepthConfig => ({ depthMode, customDepthNodeTypes });

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

suite('sonificationDepth — konfigurierbare Projektion (eine Baumquelle)', () => {

    test('Modus "control" (Standard): println = 4 (if=1, for=2, inneres if=3, println=4)', () => {
        const c = cfg('control');
        assert.strictEqual(sonificationDepth(node('if', 3), c), 1);
        assert.strictEqual(sonificationDepth(node('for', 4), c), 2);
        assert.strictEqual(sonificationDepth(node('if', 5), c), 3);
        assert.strictEqual(sonificationDepth(node('statement', 6), c), 4);
        // Klasse/Methode zählen nicht
        assert.strictEqual(sonificationDepth(node('method', 2), c), 0);
        assert.strictEqual(sonificationDepth(node('class', 1), c), 0);
    });

    test('Modus "control-and-methods": alles +1 (Methode zählt mit) → println = 5', () => {
        const c = cfg('control-and-methods');
        assert.strictEqual(sonificationDepth(node('method', 2), c), 1);
        assert.strictEqual(sonificationDepth(node('if', 3), c), 2);
        assert.strictEqual(sonificationDepth(node('statement', 6), c), 5);
        assert.strictEqual(sonificationDepth(node('class', 1), c), 0);
    });

    test('Modus "full-scope": Klasse + Methode zählen → println = 6', () => {
        const c = cfg('full-scope');
        assert.strictEqual(sonificationDepth(node('class', 1), c), 1);
        assert.strictEqual(sonificationDepth(node('method', 2), c), 2);
        assert.strictEqual(sonificationDepth(node('if', 3), c), 3);
        assert.strictEqual(sonificationDepth(node('for', 4), c), 4);
        assert.strictEqual(sonificationDepth(node('if', 5), c), 5);
        assert.strictEqual(sonificationDepth(node('statement', 6), c), 6);
    });

    test('then/else-Zweige zählen in keinem Standardmodus als Ebene', () => {
        // Der Dann-Zweig hat dieselbe Tiefe wie sein if (er zählt nicht selbst).
        assert.strictEqual(
            sonificationDepth(node('then-branch', 3), cfg('control')),
            sonificationDepth(node('if', 3), cfg('control'))
        );
    });

    test('customDepthNodeTypes überschreibt depthMode (zählt nur gelistete astNode-Typen)', () => {
        const c = cfg('full-scope', ['if_statement', 'for_statement', 'while_statement', 'method_declaration']);
        // println-Pfad: inneres if + for + äußeres if + Methode = 4 (trotz full-scope)
        assert.strictEqual(sonificationDepth(node('statement', 6), c), 4);
        assert.strictEqual(sonificationDepth(node('for', 4), c), 3); // for + äußeres if + Methode
        assert.strictEqual(sonificationDepth(node('method', 2), c), 1);
    });

    test('tiefe künstliche Verschachtelung (>6 Kontrollebenen) löst den Warnton aus', () => {
        // 6 verschachtelte ifs + eine Anweisung → control-Tiefe 7.
        const src = `class A { void m() {
          if(a){ if(b){ if(c){ if(d){ if(e){ if(f){ x(); } } } } } }
        } }`;
        const o = buildOutline(parseJava(src).rootNode);
        const deepest = o.linear.find(n => n.kind === 'statement')!;
        const depth = sonificationDepth(deepest, cfg('control'));
        assert.ok(depth > 6, `erwartet > 6, war ${depth}`);
        assert.strictEqual(depthToFrequency(depth).warning, true);
    });
});
