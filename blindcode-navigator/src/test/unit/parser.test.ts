import * as assert from 'assert';
import {
    getAST,
    getNodeAtCursor,
    getNamedNodeAtCursor,
    invalidateCache,
} from '../../parser';
import { fakeDocument, pos } from './helpers';

const SRC = `public class MathLogic {
  public int calculate(int x) {
    if (x > 0) {
      return -1;
    }
    return x;
  }
}`;

suite('parser (tree-sitter-Kapselung)', () => {

    test('getAST liefert einen geparsten Baum mit program-Wurzel', () => {
        const tree = getAST(fakeDocument(SRC));
        assert.strictEqual(tree.rootNode.type, 'program');
    });

    test('getNamedNodeAtCursor liefert den benannten Knoten an der Cursorposition', () => {
        const tree = getAST(fakeDocument(SRC));
        // Zeile 3, Spalte 5 -> if_statement
        const node = getNamedNodeAtCursor(tree, pos(2, 4));
        assert.strictEqual(node.type, 'if_statement');
    });

    test('getNodeAtCursor kann auch einen unbenannten Token liefern (z. B. Klammer)', () => {
        const tree = getAST(fakeDocument(SRC));
        // Position auf der Bedingungsklammer "(" in Zeile 3
        const node = getNodeAtCursor(tree, pos(2, 7));
        assert.ok(node.type.length > 0);
    });

    test('Cache: gleiche Version liefert dieselbe Baum-Instanz (kein Neu-Parsen)', () => {
        const doc = fakeDocument(SRC, { uri: 'file:///cache-test.java', version: 1 });
        const first = getAST(doc);
        const second = getAST(doc);
        assert.strictEqual(first, second);
    });

    test('Cache: neue Version erzwingt Neu-Parsen (andere Baum-Instanz)', () => {
        const uri = 'file:///version-test.java';
        const first = getAST(fakeDocument(SRC, { uri, version: 1 }));
        const second = getAST(fakeDocument(SRC, { uri, version: 2 }));
        assert.notStrictEqual(first, second);
    });

    test('invalidateCache entfernt den Eintrag und erzwingt Neu-Parsen', () => {
        const uri = 'file:///invalidate-test.java';
        const first = getAST(fakeDocument(SRC, { uri, version: 1 }));
        invalidateCache(uri);
        const second = getAST(fakeDocument(SRC, { uri, version: 1 }));
        assert.notStrictEqual(first, second);
    });
});
