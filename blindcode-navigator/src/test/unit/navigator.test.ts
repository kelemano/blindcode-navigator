import * as assert from 'assert';
import {
    buildOutline,
    outlineNodeFor,
    outlineDepth,
    navDown,
    navUp,
    navIn,
    navOut,
    navNextSibling,
    resolveNeighbours,
    Outline,
    OutlineNode,
} from '../../navigator';
import { parseJava } from './helpers';

// Identisch zur Studien-Fixture test-java/MathLogic.java.
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

const tree = parseJava(SRC);
const outline: Outline = buildOutline(tree.rootNode);

/** Erster Outline-Knoten einer Art (in Lesereihenfolge). */
function first(kind: string): OutlineNode {
    const node = outline.linear.find(n => n.kind === kind);
    assert.ok(node, `Outline-Knoten der Art ${kind} erwartet`);
    return node!;
}
/** Outline-Knoten einer Art in einer bestimmten Zeile (1-basiert). */
function at(kind: string, line: number): OutlineNode {
    const node = outline.linear.find(
        n => n.kind === kind && n.astNode.startPosition.row === line - 1
    );
    assert.ok(node, `Outline-Knoten ${kind} in Zeile ${line} erwartet`);
    return node!;
}

suite('navigator — Outline-Modell (StructJumper-Gliederung)', () => {

    test('Lesereihenfolge (Alt+↓) entspricht der erwarteten Gliederung', () => {
        const order = outline.linear.map(n => n.kind);
        assert.deepStrictEqual(order, [
            'class',
            'method',
            'if',          // if (x > 0)
            'then-branch',
            'for',
            'if',          // if (i % 2 == 0)
            'then-branch',
            'statement',   // System.out.println(i)
            'else-branch',
            'return',      // return -1
            'return',      // return x
        ]);
    });

    suite('Alt+↓ / Alt+↑ sind echte Inverse (Lesereihenfolge)', () => {
        test('Down-dann-Up führt überall zum Ausgangsknoten zurück', () => {
            for (const node of outline.linear) {
                const down = navDown(outline, node);
                if (down) {
                    assert.strictEqual(navUp(outline, down)?.index, node.index);
                }
            }
        });
        test('Anfang/Ende sind Edge Cases', () => {
            assert.strictEqual(navUp(outline, outline.linear[0]), null);
            assert.strictEqual(navDown(outline, outline.linear[outline.linear.length - 1]), null);
        });
    });

    suite('Alt+→ / Alt+← sind echte Inverse (Verschachtelung)', () => {
        test('In-dann-Out führt zum Ausgangsknoten zurück', () => {
            for (const node of outline.linear) {
                const inNode = navIn(node);
                if (inNode) {
                    assert.strictEqual(navOut(inNode)?.index, node.index);
                }
            }
        });
    });

    suite('Kernanforderung: else-Zweig ist erreichbar', () => {
        test('von der println-Anweisung erreicht ein einziges Alt+↓ den Sonst-Zweig', () => {
            const println = first('statement');
            const next = navDown(outline, println);
            assert.strictEqual(next?.kind, 'else-branch');
        });

        test('Alt+→ in die äußere if-Anweisung liefert den Dann-Zweig, dann Alt+↓ den Sonst-Zweig', () => {
            const outerIf = at('if', 3);
            const dann = navIn(outerIf);
            assert.strictEqual(dann?.kind, 'then-branch');
        });

        test('Alt+← aus return -1 läuft Sonst-Zweig → if → Methode → Klasse', () => {
            const ret = at('return', 10);
            const chain: string[] = [];
            let cur: OutlineNode | null = ret;
            while (cur) { chain.push(cur.kind); cur = navOut(cur); }
            assert.deepStrictEqual(chain, ['return', 'else-branch', 'if', 'method', 'class']);
        });
    });

    suite('Konsistenz: hinein = Rumpf (kein Kopf-Stopp)', () => {
        test('Alt+→ in die for-Schleife liefert die erste RUMPF-Anweisung (inneres if), nicht den Kopf', () => {
            const forNode = first('for');
            assert.strictEqual(navIn(forNode)?.kind, 'if');
        });
        test('der for-Kopf (int i = 0) ist KEIN eigener Outline-Knoten', () => {
            // In Zeile 4 gibt es nur die for-Schleife als Stopp, keine Variablendeklaration.
            const stopsInLine4 = outline.linear.filter(n => n.astNode.startPosition.row === 3);
            assert.deepStrictEqual(stopsInLine4.map(n => n.kind), ['for']);
        });
        test('Alt+→ in die Methode liefert die erste Anweisung (if), nicht modifiers/Typ/Parameter', () => {
            assert.strictEqual(navIn(first('method'))?.kind, 'if');
        });
    });

    suite('Low-Level-Knoten werden übersprungen', () => {
        test('Bedingungen/Ausdrücke/Bezeichner sind keine Outline-Knoten', () => {
            const kinds = new Set(outline.linear.map(n => n.astNode.type));
            for (const noise of [
                'parenthesized_expression', 'binary_expression', 'identifier',
                'modifiers', 'field_access', 'method_invocation', 'update_expression',
            ]) {
                assert.ok(!kinds.has(noise), `${noise} sollte kein Outline-Knoten sein`);
            }
        });
    });

    suite('Alt+→ navNextSibling (Block überspringen)', () => {
        test('Dann-Zweig → Sonst-Zweig (then → else in einer Taste)', () => {
            assert.strictEqual(navNextSibling(outline, at('then-branch', 3))?.kind, 'else-branch');
        });
        test('äußere if-Anweisung → return x (ganzes if überspringen)', () => {
            const next = navNextSibling(outline, at('if', 3));
            assert.strictEqual(next?.kind, 'return');
            assert.strictEqual(next?.astNode.startPosition.row, 11); // return x, Zeile 12
        });
        test('Edge: println hat kein nächstes Geschwister', () => {
            assert.strictEqual(navNextSibling(outline, first('statement')), null);
        });
        test('Edge: einzige Top-Level-Klasse hat kein Geschwister', () => {
            assert.strictEqual(navNextSibling(outline, first('class')), null);
        });
    });

    suite('resolveNeighbours (Richtungsziele für die Baumansicht)', () => {
        test('für das äußere if: up/down/sibling/parent korrekt', () => {
            const n = resolveNeighbours(outline, at('if', 3));
            assert.strictEqual(n.up?.kind, 'method');        // Alt+↑ vorheriger in Lesereihenfolge
            assert.strictEqual(n.down?.kind, 'then-branch');  // Alt+↓ nächster in Lesereihenfolge
            assert.strictEqual(n.sibling?.kind, 'return');    // Alt+→ nächstes Geschwister (return x)
            assert.strictEqual(n.parent?.kind, 'method');     // Alt+← Elternknoten
        });

        test('für println: kein Geschwister; down zeigt in den else-Zweig', () => {
            const n = resolveNeighbours(outline, first('statement'));
            assert.strictEqual(n.down?.kind, 'else-branch');
            assert.strictEqual(n.sibling, null);
            assert.strictEqual(n.parent?.kind, 'then-branch');
        });

        test('für die Wurzel (class): kein up, kein sibling, kein parent', () => {
            const n = resolveNeighbours(outline, first('class'));
            assert.strictEqual(n.up, null);
            assert.strictEqual(n.sibling, null);
            assert.strictEqual(n.parent, null);
            assert.strictEqual(n.down?.kind, 'method');
        });
    });

    suite('outlineDepth (für die Gliederungs-Liste)', () => {
        test('Tiefen entsprechen der Verschachtelung', () => {
            assert.strictEqual(outlineDepth(first('class')), 0);
            assert.strictEqual(outlineDepth(first('method')), 1);
            assert.strictEqual(outlineDepth(at('if', 3)), 2);
            assert.strictEqual(outlineDepth(at('then-branch', 3)), 3);
            assert.strictEqual(outlineDepth(first('statement')), 7);
            assert.strictEqual(outlineDepth(at('else-branch', 9)), 3);
            assert.strictEqual(outlineDepth(at('return', 12)), 2);
        });
    });

    suite('outlineNodeFor (Cursor → Outline-Knoten)', () => {
        test('Cursor in der Bedingung (binary_expression) landet auf der if-Anweisung', () => {
            const outerIf = at('if', 3);
            const binary = outerIf.astNode
                .childForFieldName('condition')!
                .namedChildren[0]; // binary_expression
            assert.strictEqual(outlineNodeFor(outline, binary)?.index, outerIf.index);
        });
        test('Cursor im for-Kopf (int i = 0) landet auf der for-Schleife', () => {
            const forNode = first('for');
            const init = forNode.astNode.childForFieldName('init')!; // local_variable_declaration
            assert.strictEqual(outlineNodeFor(outline, init)?.index, forNode.index);
        });
        test('Cursor auf einem bedeutungstragenden Knoten bleibt dort', () => {
            const ret = at('return', 12);
            assert.strictEqual(outlineNodeFor(outline, ret.astNode)?.index, ret.index);
        });
    });

    suite('Fehlertoleranz: kaputter Code (ERROR/MISSING)', () => {
        test('fehlendes Semikolon erscheint als navigierbarer "missing"-Knoten', () => {
            const o = buildOutline(parseJava('class A {\n void m(){\n  int x = 5\n }\n}').rootNode);
            const missing = o.linear.find(n => n.kind === 'missing');
            assert.ok(missing, 'ein missing-Knoten wird erwartet');
            assert.strictEqual(missing!.astNode.type, ';');
        });

        test('unparsbarer Code erscheint als navigierbarer "error"-Knoten', () => {
            const o = buildOutline(parseJava('class A {\n void m(){\n  @@@\n  int y = 1;\n }\n}').rootNode);
            assert.ok(o.linear.some(n => n.kind === 'error'), 'ein error-Knoten wird erwartet');
        });

        test('Navigation bleibt stabil: Down/Up sind auch im kaputten Baum echte Inverse', () => {
            const o = buildOutline(parseJava('class A {\n void m(){\n  int x = 5\n }\n}').rootNode);
            for (const n of o.linear) {
                const down = navDown(o, n);
                if (down) {
                    assert.strictEqual(navUp(o, down)?.index, n.index);
                }
            }
        });

        test('gültiger Code erzeugt KEINE error/missing-Knoten (keine Regression)', () => {
            const kinds = new Set(outline.linear.map(n => n.kind));
            assert.ok(!kinds.has('error'));
            assert.ok(!kinds.has('missing'));
        });
    });
});
