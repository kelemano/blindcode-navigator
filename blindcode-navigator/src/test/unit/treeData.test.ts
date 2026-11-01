import * as assert from 'assert';
import { parseJava } from './helpers';
import { buildOutline, outlineDepth } from '../../navigator';
import { buildTreeData } from '../../treeData';
import { sonificationDepth, SonificationDepthConfig } from '../../sonification';

const CONFIG: SonificationDepthConfig = { depthMode: 'control', customDepthNodeTypes: [] };

const CODE = `public class Hund {
  public void schlafen(int stunden) {
    if (stunden > 8) {
      System.out.println("zu lange");
    } else {
      System.out.println("gut");
    }
  }
}`;

suite('buildTreeData — Anzeige für die sehende Begleitung', () => {

    test('toneDepth entspricht EXAKT der vertonten Tiefe (keine zweite Rechnung)', () => {
        // Der Sinn der Anzeige: Die Begleitung soll dieselbe Tiefe sehen, die die
        // Person hört. Driften die beiden auseinander, führt jede Nachbesprechung
        // in die Irre — genau das soll dieser Test verhindern.
        const outline = buildOutline(parseJava(CODE).rootNode);
        const rows = buildTreeData(outline, null, CONFIG);
        assert.strictEqual(rows.length, outline.linear.length);
        outline.linear.forEach((node, i) => {
            const erwartet = Math.max(0, Math.floor(sonificationDepth(node, CONFIG)));
            assert.strictEqual(rows[i].toneDepth, erwartet, `Knoten ${i} (${rows[i].label})`);
        });
    });

    test('Struktur-Tiefe und Ton-Tiefe sind wirklich verschieden', () => {
        // Wären sie überall gleich, wäre die zweite Spalte sinnlos. Beim Dann-Zweig
        // müssen sie auseinanderlaufen: Zweige zählen im Modus „control" nicht mit.
        const outline = buildOutline(parseJava(CODE).rootNode);
        const rows = buildTreeData(outline, null, CONFIG);
        const zweig = rows.find(r => r.label === 'Dann-Zweig');
        assert.ok(zweig, 'Dann-Zweig im Baum erwartet');
        assert.notStrictEqual(zweig.depth, zweig.toneDepth);
    });

    test('genau ein Knoten trägt die Rolle „current"', () => {
        const outline = buildOutline(parseJava(CODE).rootNode);
        const current = outline.linear.find(n => n.kind === 'if');
        const rows = buildTreeData(outline, current ?? null, CONFIG);
        assert.strictEqual(rows.filter(r => r.roles.includes('current')).length, 1);
    });

    test('ohne aktuellen Knoten trägt keine Zeile eine Rolle', () => {
        const outline = buildOutline(parseJava(CODE).rootNode);
        const rows = buildTreeData(outline, null, CONFIG);
        assert.ok(rows.every(r => r.roles.length === 0));
    });

    test('Einrückung folgt der Struktur-Tiefe', () => {
        const outline = buildOutline(parseJava(CODE).rootNode);
        const rows = buildTreeData(outline, null, CONFIG);
        outline.linear.forEach((node, i) => {
            assert.strictEqual(rows[i].depth, outlineDepth(node));
        });
    });
});
