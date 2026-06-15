import * as assert from 'assert';
import Parser = require('tree-sitter');
import {
    findParent,
    findFirstChild,
    findNextSibling,
    findPrevSibling,
    toMeaningfulNode,
} from '../../navigator';
import { parseJava, findFirstOfType } from './helpers';

// Identisch zur Studien-Fixture test-java/MathLogic.java.
// Zeilennummern in den Tests beziehen sich auf diese Quelle (1-basiert).
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

// Fixture mit mehrfach verschachtelten "bare blocks" (zum Testen des
// mehrstufigen Block-Überspringens).
const NESTED = `class A {
  void m() {
    {
      {
        int z = 1;
      }
    }
  }
}`;

const tree = parseJava(SRC);
const root = tree.rootNode;

/** Benannter Knoten an einer (0-basierten) Zeile/Spalte. */
function nodeAt(row: number, column: number): Parser.SyntaxNode {
    return root.namedDescendantForPosition({ row, column });
}

const outerIf = nodeAt(2, 4);            // if (x > 0)            — Zeile 3
const forNode = nodeAt(3, 6);            // for (...)             — Zeile 4 (im then-Zweig)
const returnMinus1 = nodeAt(9, 6);       // return -1;            — Zeile 10 (im else-Zweig)
const classDecl = findFirstOfType(root, 'class_declaration')!;
const methodBodyBlock = findFirstOfType(root, 'block')!;      // erster block = Methodenrumpf
const printlnStmt = findFirstOfType(root, 'expression_statement')!; // System.out.println(i); — Zeile 6

suite('navigator — Block-Transparenz & reine AST-Logik', () => {

    test('Fixture-Annahmen stimmen (if/for/return -1 korrekt lokalisiert)', () => {
        assert.strictEqual(outerIf.type, 'if_statement');
        assert.strictEqual(forNode.type, 'for_statement');
        assert.strictEqual(returnMinus1.type, 'return_statement');
        assert.strictEqual(printlnStmt.type, 'expression_statement');
    });

    suite('findParent (überspringt strukturelle Block-Knoten)', () => {
        test('überspringt den Methoden-block: if -> method_declaration', () => {
            const parent = findParent(outerIf);
            assert.strictEqual(parent?.type, 'method_declaration');
        });

        test('überspringt verschachtelte Blöcke: tiefe Anweisung -> umschließendes if', () => {
            const parent = findParent(printlnStmt);
            assert.strictEqual(parent?.type, 'if_statement');
            assert.strictEqual(parent?.startPosition.row, 4); // inneres if, Zeile 5
        });

        test('else-Zweig (zweiter block): return -1 -> äußeres if', () => {
            const parent = findParent(returnMinus1);
            assert.strictEqual(parent?.type, 'if_statement');
            assert.strictEqual(parent?.startPosition.row, 2); // äußeres if, Zeile 3
        });

        test('mehrfach verschachtelte bare blocks werden alle übersprungen', () => {
            const nestedRoot = parseJava(NESTED).rootNode;
            const zDecl = findFirstOfType(nestedRoot, 'local_variable_declaration')!;
            assert.strictEqual(findParent(zDecl)?.type, 'method_declaration');
        });

        test('Edge Case: class_declaration hat keinen navigierbaren Parent (Wurzel)', () => {
            assert.strictEqual(findParent(classDecl), null);
        });
    });

    suite('findFirstChild', () => {
        test('erstes Kind des if ist die Bedingung (parenthesized_expression)', () => {
            assert.strictEqual(findFirstChild(outerIf)?.type, 'parenthesized_expression');
        });

        test('Edge Case: ein Identifier-Blatt hat kein Kind', () => {
            const identifier = findFirstOfType(root, 'identifier')!;
            assert.strictEqual(findFirstChild(identifier), null);
        });
    });

    suite('findNextSibling (block-transparent)', () => {
        test('nächstes Geschwister des if ist return x (Zeile 12)', () => {
            const next = findNextSibling(outerIf);
            assert.strictEqual(next?.type, 'return_statement');
            assert.strictEqual(next?.startPosition.row, 11);
        });

        test('Branch-übergreifend: for (then-Zweig) -> return -1 (else-Zweig)', () => {
            // Dokumentierte Konsequenz der Block-Transparenz: then/else werden
            // zu einer flachen Geschwisterfolge unter dem if. Der Skopus wird in
            // M3 über die Sprachausgabe ("else-Zweig") wieder hörbar gemacht.
            const next = findNextSibling(forNode);
            assert.strictEqual(next?.type, 'return_statement');
            assert.strictEqual(next?.startPosition.row, 9); // return -1, Zeile 10
        });

        test('Edge Case: letzte Anweisung hat kein nächstes Geschwister', () => {
            const returnX = findNextSibling(outerIf)!;
            assert.strictEqual(findNextSibling(returnX), null);
        });

        test('Edge Case: einzige Top-Level-Deklaration hat kein Geschwister', () => {
            assert.strictEqual(findNextSibling(classDecl), null);
        });
    });

    suite('findPrevSibling (block-transparent)', () => {
        test('Branch-übergreifend: return -1 (else) -> for (then)', () => {
            assert.strictEqual(findPrevSibling(returnMinus1)?.type, 'for_statement');
        });

        test('Edge Case: erstes effektives Kind hat kein vorheriges Geschwister', () => {
            assert.strictEqual(findPrevSibling(classDecl), null);
        });
    });

    suite('toMeaningfulNode (Cursor-Normalisierung)', () => {
        test('Cursor auf einem block -> erste sinnvolle Anweisung (if)', () => {
            assert.strictEqual(toMeaningfulNode(methodBodyBlock)?.type, 'if_statement');
        });

        test('Nicht-Block-Knoten bleibt unverändert', () => {
            assert.strictEqual(toMeaningfulNode(outerIf)?.id, outerIf.id);
        });
    });
});
