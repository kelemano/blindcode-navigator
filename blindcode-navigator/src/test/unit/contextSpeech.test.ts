import * as assert from 'assert';
import Parser = require('tree-sitter');
import { buildContextString, describeNode } from '../../contextSpeech';
import { parseJava, findFirstOfType } from './helpers';

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

const outerIf = findFirstOfType(root, 'if_statement')!;
const elseBlock = outerIf.childForFieldName('alternative')!;       // 2. block = else
const returnMinus1 = nodeAt(9, 6);                                 // return -1;  (im else)
const forNode = findFirstOfType(root, 'for_statement')!;
const method = findFirstOfType(root, 'method_declaration')!;
const classDecl = findFirstOfType(root, 'class_declaration')!;

suite('contextSpeech — buildContextString', () => {

    test('DoD: else-Zweig exakt "else-Zweig, in Methode calculate, Klasse MathLogic"', () => {
        assert.strictEqual(
            buildContextString(elseBlock),
            'else-Zweig, in Methode calculate, Klasse MathLogic'
        );
    });

    test('Skopus wird trotz Block-Skip vermittelt: return -1 -> "im else-Zweig"', () => {
        assert.strictEqual(
            buildContextString(returnMinus1),
            'return-Anweisung, im else-Zweig, in Methode calculate, Klasse MathLogic'
        );
    });

    test('for-Schleife nennt Zweig, Methode und Klasse', () => {
        assert.strictEqual(
            buildContextString(forNode),
            'for-Schleife, im if-Zweig, in Methode calculate, Klasse MathLogic'
        );
    });

    test('Methode (selbst): "Methode calculate, Klasse MathLogic"', () => {
        assert.strictEqual(buildContextString(method), 'Methode calculate, Klasse MathLogic');
    });

    test('Klasse (selbst, oberste Ebene): "Klasse MathLogic"', () => {
        assert.strictEqual(buildContextString(classDecl), 'Klasse MathLogic');
    });

    suite('describeNode (Selbst-Beschreibung)', () => {
        test('then-block des if -> "if-Zweig"', () => {
            const thenBlock = outerIf.childForFieldName('consequence')!;
            assert.strictEqual(describeNode(thenBlock), 'if-Zweig');
        });

        test('alternative-block des if -> "else-Zweig"', () => {
            assert.strictEqual(describeNode(elseBlock), 'else-Zweig');
        });

        test('Methode bekommt ihren Namen angehängt', () => {
            assert.strictEqual(describeNode(method), 'Methode calculate');
        });
    });

    suite('Sonderfälle (kein leerer String, kein Absturz)', () => {
        test('Lambda-Ausdruck -> beginnt mit "Lambda-Ausdruck"', () => {
            const lambdaRoot = parseJava(
                'class C { Runnable r = () -> { System.out.println(1); }; }'
            ).rootNode;
            const lambda = findFirstOfType(lambdaRoot, 'lambda_expression')!;
            const result = buildContextString(lambda);
            assert.ok(result.startsWith('Lambda-Ausdruck'), result);
        });

        test('anonyme innere Klasse -> "anonyme Klasse"', () => {
            const anonRoot = parseJava(
                'class C { Runnable r = new Runnable(){ public void run(){} }; }'
            ).rootNode;
            const anon = findFirstOfType(anonRoot, 'object_creation_expression')!;
            assert.strictEqual(describeNode(anon), 'anonyme Klasse');
        });

        test('unbekannter Knotentyp liefert nicht-leeren String', () => {
            const cond = outerIf.childForFieldName('condition')!;
            assert.ok(buildContextString(cond).length > 0);
        });
    });
});
