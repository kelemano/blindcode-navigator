import * as assert from 'assert';
import { buildOutline, Outline, OutlineNode } from '../../navigator';
import { buildContextString, describeOutlineNode } from '../../contextSpeech';
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
