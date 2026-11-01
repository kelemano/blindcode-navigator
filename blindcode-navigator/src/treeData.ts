import { Outline, OutlineNode, outlineDepth, resolveNeighbours } from './navigator';
import { describeOutlineNode } from './contextSpeech';
import { sonificationDepth, SonificationDepthConfig } from './sonification';

/**
 * Render-Daten der Baumansicht — REINE Logik, kein VS Code, daher unit-testbar.
 * (Bewusst getrennt von treePanel.ts: Dort steckt der Webview-Adapter, der `vscode`
 * importiert; alles in dieser Datei bleibt dadurch aus den Unit-Tests erreichbar.)
 */

export type Role = 'current' | 'up' | 'down' | 'child' | 'parent';

export interface TreeItemData {
    /** Strukturelle Tiefe — bestimmt die Einrückung in der Ansicht. */
    depth: number;
    /**
     * Tiefe, die die SONIFIKATION vertont — eine andere Projektion desselben Baums
     * (Klasse/Methode und then/else zählen im Standardmodus nicht mit). Wird eigens
     * angezeigt, weil die Begleitung sonst eine andere Tiefe SIEHT als die Person
     * HÖRT — beim Nachbesprechen führt das direkt in die Irre.
     */
    toneDepth: number;
    label: string;
    line: number;
    row: number;
    col: number;
    roles: Role[];
}

/**
 * Baut die Render-Daten: Baum in Lesereihenfolge, plus die Rollen (aktueller Knoten
 * und die vier Richtungs-Nachbarn) je Knoten. Rein (kein VS Code) — testbar.
 */
export function buildTreeData(
    outline: Outline,
    current: OutlineNode | null,
    depthConfig: SonificationDepthConfig
): TreeItemData[] {
    const roles = new Map<number, Role[]>();
    const tag = (node: OutlineNode | null | undefined, role: Role) => {
        if (!node) { return; }
        const list = roles.get(node.index) ?? [];
        list.push(role);
        roles.set(node.index, list);
    };
    if (current) {
        const n = resolveNeighbours(outline, current);
        tag(current, 'current');
        tag(n.up, 'up');
        tag(n.down, 'down');
        tag(n.child, 'child');
        tag(n.parent, 'parent');
    }
    return outline.linear.map(node => ({
        depth: outlineDepth(node),
        toneDepth: Math.max(0, Math.floor(sonificationDepth(node, depthConfig))),
        label: describeOutlineNode(node),
        line: node.astNode.startPosition.row + 1,
        row: node.astNode.startPosition.row,
        col: node.astNode.startPosition.column,
        roles: roles.get(node.index) ?? [],
    }));
}

