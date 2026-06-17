import * as assert from 'assert';
import { buildOutline, Outline, OutlineNode } from '../../navigator';
import { buildContextString, describeOutlineNode, outlineMatches } from '../../contextSpeech';
import { parseJava } from './helpers';

const SRC = `public class MathLogic {
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

const outline: Outline = buildOutline(parseJava(SRC).rootNode);

function at(kind: string, line: number): OutlineNode {
    const node = outline.linear.find(
        n => n.kind === kind && n.astNode.startPosition.row === line - 1
    );
    assert.ok(node, `${kind} in Zeile ${line} erwartet`);
    return node!;
}

suite('contextSpeech — Ansage auf dem Outline-Baum', () => {

    test('Klasse (oberste Ebene): "Klasse MathLogic"', () => {
        assert.strictEqual(buildContextString(at('class', 1)), 'Klasse MathLogic');
    });

    test('Methode: "Methode calculate, Klasse MathLogic"', () => {
        assert.strictEqual(
            buildContextString(at('method', 2)),
            'Methode calculate, Klasse MathLogic'
        );
    });

    test('Sonst-Zweig: "Sonst-Zweig, in if-Anweisung, in Methode calculate, Klasse MathLogic"', () => {
        assert.strictEqual(
            buildContextString(at('else-branch', 9)),
            'Sonst-Zweig, in if-Anweisung, in Methode calculate, Klasse MathLogic'
        );
    });

    test('return -1 (im Sonst-Zweig): Skopus wird vermittelt, if nicht doppelt genannt', () => {
        assert.strictEqual(
            buildContextString(at('return', 10)),
            'return-Anweisung, im Sonst-Zweig, in Methode calculate, Klasse MathLogic'
        );
    });

    test('for-Schleife nennt Zweig, Methode und Klasse', () => {
        assert.strictEqual(
            buildContextString(at('for', 4)),
            'for-Schleife, im Dann-Zweig, in Methode calculate, Klasse MathLogic'
        );
    });

    suite('outlineMatches (Filter der Gliederungs-Liste: deutsch UND Java-Schlüsselwort)', () => {
        test('„else" findet den Sonst-Zweig (Java-Schlüsselwort statt deutschem Label)', () => {
            assert.ok(outlineMatches(at('else-branch', 9), 'else'));
        });
        test('„sonst" und „zweig" finden den Sonst-Zweig (deutsches Label)', () => {
            assert.ok(outlineMatches(at('else-branch', 9), 'sonst'));
            assert.ok(outlineMatches(at('else-branch', 9), 'zweig'));
        });
        test('„if" findet beide if-Anweisungen', () => {
            const hits = outline.linear.filter(n => outlineMatches(n, 'if'));
            assert.deepStrictEqual(hits.map(n => n.kind).filter(k => k === 'if').length, 2);
        });
        test('„return" findet beide return-Anweisungen', () => {
            const hits = outline.linear.filter(n => outlineMatches(n, 'return'));
            assert.strictEqual(hits.length, 2);
            assert.ok(hits.every(n => n.kind === 'return'));
        });
        test('„for" findet die for-Schleife, „while" nicht', () => {
            assert.ok(outlineMatches(at('for', 4), 'for'));
            assert.ok(!outlineMatches(at('for', 4), 'while'));
        });
        test('„class" findet die Klasse (deutsches Label „Klasse" enthält kein „class")', () => {
            assert.ok(outlineMatches(at('class', 1), 'class'));
        });
        test('„then" und „dann" finden den Dann-Zweig', () => {
            assert.ok(outlineMatches(at('then-branch', 3), 'then'));
            assert.ok(outlineMatches(at('then-branch', 3), 'dann'));
        });
        test('leere Eingabe ist immer ein Treffer (zeigt alles)', () => {
            assert.ok(outline.linear.every(n => outlineMatches(n, '')));
        });
        test('nicht passender Begriff trifft nicht', () => {
            assert.ok(!outlineMatches(at('else-branch', 9), 'for'));
        });
    });

    suite('buildContextString — Ausführlichkeit (verbosity)', () => {
        test('high (Standard) = volle Skopus-Kette', () => {
            const node = at('return', 10);
            assert.strictEqual(
                buildContextString(node, 'high'),
                'return-Anweisung, im Sonst-Zweig, in Methode calculate, Klasse MathLogic'
            );
            // Standard (ohne Argument) entspricht high → bestehende Erwartungen bleiben.
            assert.strictEqual(buildContextString(node), buildContextString(node, 'high'));
        });

        test('medium = nur Anker-Skopusse (Methode/Klasse), ohne Zwischenstrukturen', () => {
            assert.strictEqual(
                buildContextString(at('return', 10), 'medium'),
                'return-Anweisung, in Methode calculate, Klasse MathLogic'
            );
            // tief verschachtelte println: medium lässt if/for/Zweige weg
            assert.strictEqual(
                buildContextString(at('statement', 6), 'medium'),
                'Anweisung, in Methode calculate, Klasse MathLogic'
            );
        });

        test('low = nur die Selbst-Beschreibung', () => {
            assert.strictEqual(buildContextString(at('return', 10), 'low'), 'return-Anweisung');
            assert.strictEqual(buildContextString(at('statement', 6), 'low'), 'Anweisung');
        });
    });

    suite('describeOutlineNode (Selbst-Beschreibung)', () => {
        test('then-/else-Zweig heißen Dann-Zweig / Sonst-Zweig', () => {
            assert.strictEqual(describeOutlineNode(at('then-branch', 3)), 'Dann-Zweig');
            assert.strictEqual(describeOutlineNode(at('else-branch', 9)), 'Sonst-Zweig');
        });
        test('if heißt if-Anweisung', () => {
            assert.strictEqual(describeOutlineNode(at('if', 3)), 'if-Anweisung');
        });
        test('Methode bekommt ihren Namen', () => {
            assert.strictEqual(describeOutlineNode(at('method', 2)), 'Methode calculate');
        });
    });
});
