import * as assert from 'assert';
import Parser = require('tree-sitter');
import {
    findParent,
    findFirstChild,
    findNextSibling,
    findPrevSibling,
    toMeaningfulNode,
    isMeaningful,
    ifBranchKind,
} from '../../navigator';
import { parseJava, findFirstOfType } from './helpers';

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
const root = tree.rootNode;

function nodeAt(row: number, column: number): Parser.SyntaxNode {
    return root.namedDescendantForPosition({ row, column });
}

const classDecl = findFirstOfType(root, 'class_declaration')!;
const method = findFirstOfType(root, 'method_declaration')!;
const outerIf = nodeAt(2, 4);                                  // if (x > 0)            Zeile 3
const forNode = findFirstOfType(root, 'for_statement')!;       // for (...)            Zeile 4
const elseBlock = outerIf.childForFieldName('alternative')!;   // else-block           Zeile 9
const returnMinus1 = nodeAt(9, 6);                             // return -1;           Zeile 10
const returnX = nodeAt(11, 4);                                 // return x;            Zeile 12
const printlnStmt = findFirstOfType(root, 'expression_statement')!; // println-Anweisung Zeile 6

suite('navigator — Meaningful-Node-Navigation', () => {

    test('Fixture-Annahmen', () => {
        assert.strictEqual(outerIf.type, 'if_statement');
        assert.strictEqual(forNode.type, 'for_statement');
        assert.strictEqual(elseBlock.type, 'block');
        assert.strictEqual(ifBranchKind(elseBlock), 'else');
        assert.strictEqual(returnMinus1.type, 'return_statement');
        assert.strictEqual(returnX.type, 'return_statement');
    });

    suite('isMeaningful (Whitelist)', () => {
        test('strukturelle Knoten sind bedeutungstragend', () => {
            for (const n of [classDecl, method, outerIf, forNode, returnMinus1, printlnStmt]) {
                assert.ok(isMeaningful(n), `${n.type} sollte meaningful sein`);
            }
        });

        test('der else-Zweig (alternative-block) ist bedeutungstragend', () => {
            assert.ok(isMeaningful(elseBlock));
        });

        test('Low-Level-Knoten werden NICHT als Stopp gewertet', () => {
            const condition = outerIf.childForFieldName('condition')!;       // parenthesized_expression
            const binary = condition.namedChildren[0];                       // binary_expression
            const modifiers = findFirstOfType(root, 'modifiers')!;
            const identifier = findFirstOfType(root, 'identifier')!;
            const thenBlock = outerIf.childForFieldName('consequence')!;     // then-block: transparent
            for (const n of [condition, binary, modifiers, identifier, thenBlock]) {
                assert.ok(!isMeaningful(n), `${n.type} sollte NICHT meaningful sein`);
            }
        });
    });

    suite('findFirstChild (überspringt Low-Level + transparente Blöcke)', () => {
        test('Methode -> erste Anweisung (if), nicht modifiers/type/params', () => {
            assert.strictEqual(findFirstChild(method)?.type, 'if_statement');
        });

        test('if -> for (nicht die Bedingung/parenthesized_expression)', () => {
            assert.strictEqual(findFirstChild(outerIf)?.id, forNode.id);
        });

        test('Klasse -> Methode (class_body transparent)', () => {
            assert.strictEqual(findFirstChild(classDecl)?.id, method.id);
        });

        test('Edge Case: Blatt-Anweisung (println) hat kein Kind', () => {
            assert.strictEqual(findFirstChild(printlnStmt), null);
        });
    });

    suite('findParent (Meaningful-Parent)', () => {
        test('if -> Methode (Methodenrumpf transparent)', () => {
            assert.strictEqual(findParent(outerIf)?.id, method.id);
        });

        test('println -> inneres if (then-Block transparent)', () => {
            const parent = findParent(printlnStmt);
            assert.strictEqual(parent?.type, 'if_statement');
            assert.strictEqual(parent?.startPosition.row, 4); // inneres if, Zeile 5
        });

        test('Edge Case: Klasse hat keinen Parent (Wurzel)', () => {
            assert.strictEqual(findParent(classDecl), null);
        });
    });

    suite('if/else-Navigation (Kernanforderung)', () => {
        test('Down(if) dann Right erreicht den else-Zweig', () => {
            const down = findFirstChild(outerIf)!;                  // for
            const right = findNextSibling(down)!;                   // else-block
            assert.strictEqual(right.id, elseBlock.id);
            assert.strictEqual(ifBranchKind(right), 'else');
        });

        test('Parent-Kette aus dem else heraus: else-Zweig -> if -> Methode -> Klasse', () => {
            const chain: Parser.SyntaxNode[] = [];
            let cur: Parser.SyntaxNode | null = returnMinus1;
            while (cur) { chain.push(cur); cur = findParent(cur); }
            // chain[0] = return -1 selbst
            assert.strictEqual(chain[1].id, elseBlock.id);          // else-Zweig
            assert.strictEqual(chain[2].id, outerIf.id);            // if-Anweisung
            assert.strictEqual(chain[3].id, method.id);             // Methode
            assert.strictEqual(chain[4].id, classDecl.id);          // Klasse
            assert.strictEqual(chain.length, 5);                    // danach: oberste Ebene
        });

        test('springt NICHT direkt von return -1 auf die Methode', () => {
            assert.strictEqual(findParent(returnMinus1)?.type, 'block');
            assert.notStrictEqual(findParent(returnMinus1)?.type, 'method_declaration');
        });
    });

    suite('findNextSibling / findPrevSibling', () => {
        test('nächstes Geschwister des if ist return x', () => {
            assert.strictEqual(findNextSibling(outerIf)?.id, returnX.id);
        });

        test('nächstes Geschwister der for-Schleife ist der else-Zweig', () => {
            assert.strictEqual(findNextSibling(forNode)?.id, elseBlock.id);
        });

        test('vorheriges Geschwister des else-Zweigs ist die for-Schleife', () => {
            assert.strictEqual(findPrevSibling(elseBlock)?.id, forNode.id);
        });

        test('Edge Case: return -1 ist einziges Kind des else -> kein Geschwister', () => {
            assert.strictEqual(findPrevSibling(returnMinus1), null);
            assert.strictEqual(findNextSibling(returnMinus1), null);
        });

        test('Edge Case: letzte Anweisung der Methode hat kein nächstes Geschwister', () => {
            assert.strictEqual(findNextSibling(returnX), null);
        });

        test('Edge Case: einzige Top-Level-Deklaration hat kein Geschwister', () => {
            assert.strictEqual(findNextSibling(classDecl), null);
            assert.strictEqual(findPrevSibling(classDecl), null);
        });
    });

    suite('Up und Down sind echte Inverse (Down dann Up = Start)', () => {
        for (const [name, node] of [
            ['Klasse', classDecl],
            ['Methode', method],
            ['if', outerIf],
            ['else-Zweig', elseBlock],
            ['for', forNode],
        ] as const) {
            test(`Down/Up auf ${name}`, () => {
                const down = findFirstChild(node);
                assert.ok(down, `${name} sollte ein Kind haben`);
                assert.strictEqual(findParent(down!)?.id, node.id);
            });
        }
    });

    suite('toMeaningfulNode (Cursor-Normalisierung steigt auf)', () => {
        test('Cursor in der Bedingung (binary_expression) -> if-Anweisung', () => {
            const binary = outerIf.childForFieldName('condition')!.namedChildren[0];
            assert.strictEqual(toMeaningfulNode(binary)?.id, outerIf.id);
        });

        test('Cursor auf dem Methodenrumpf-block -> Methode', () => {
            const methodBody = method.childForFieldName('body')!;
            assert.strictEqual(toMeaningfulNode(methodBody)?.id, method.id);
        });

        test('bedeutungstragender Knoten bleibt unverändert', () => {
            assert.strictEqual(toMeaningfulNode(outerIf)?.id, outerIf.id);
        });
    });
});
