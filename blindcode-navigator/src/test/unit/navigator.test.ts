import * as assert from 'assert';
import Parser = require('tree-sitter');
import {
    findParent,
    findFirstChild,
    findNextSibling,
    findPrevSibling,
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

const tree = parseJava(SRC);
const root = tree.rootNode;

/** Benannter Knoten an einer (0-basierten) Zeile/Spalte. */
function nodeAt(row: number, column: number): Parser.SyntaxNode {
    return root.namedDescendantForPosition({ row, column });
}

// Das äußere if liegt in Zeile 3 (row 2), Spalte 5 (column 4).
const outerIf = nodeAt(2, 4);

suite('navigator (reine AST-Logik)', () => {

    test('Fixture: Knoten in Zeile 3 ist ein if_statement', () => {
        assert.strictEqual(outerIf.type, 'if_statement');
    });

    suite('findParent', () => {
        test('Elternknoten des if ist der umschließende block (Methodenrumpf)', () => {
            const parent = findParent(outerIf);
            assert.strictEqual(parent?.type, 'block');
        });

        test('zwei Schritte hoch vom if erreichen die method_declaration', () => {
            const block = findParent(outerIf);
            assert.ok(block);
            assert.strictEqual(findParent(block!)?.type, 'method_declaration');
        });

        test('Edge Case: class_declaration hat keinen navigierbaren Parent (Wurzel)', () => {
            const classDecl = findFirstOfType(root, 'class_declaration');
            assert.ok(classDecl);
            assert.strictEqual(findParent(classDecl!), null);
        });
    });

    suite('findFirstChild', () => {
        test('erstes benanntes Kind des if ist die Bedingung (parenthesized_expression)', () => {
            assert.strictEqual(findFirstChild(outerIf)?.type, 'parenthesized_expression');
        });

        test('Edge Case: ein Identifier-Blatt hat kein benanntes Kind', () => {
            const identifier = findFirstOfType(root, 'identifier');
            assert.ok(identifier);
            assert.strictEqual(findFirstChild(identifier!), null);
        });
    });

    suite('findNextSibling', () => {
        test('nächstes Geschwister des if ist das return_statement (return x)', () => {
            assert.strictEqual(findNextSibling(outerIf)?.type, 'return_statement');
        });

        test('Edge Case: letzte Anweisung im block hat kein nächstes Geschwister', () => {
            const returnX = findNextSibling(outerIf); // return x;
            assert.ok(returnX);
            assert.strictEqual(findNextSibling(returnX!), null);
        });
    });

    suite('findPrevSibling', () => {
        test('vorheriges Geschwister des return ist das if', () => {
            const returnX = findNextSibling(outerIf);
            assert.ok(returnX);
            assert.strictEqual(findPrevSibling(returnX!)?.type, 'if_statement');
        });

        test('Edge Case: erste Anweisung im block hat kein vorheriges Geschwister', () => {
            assert.strictEqual(findPrevSibling(outerIf), null);
        });
    });
});
