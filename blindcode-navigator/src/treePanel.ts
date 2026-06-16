import * as vscode from 'vscode';
import { Outline, OutlineNode, outlineDepth, resolveNeighbours } from './navigator';
import { describeOutlineNode } from './contextSpeech';

/**
 * Visuelle Baumansicht (Kap. 4 — Visualisierungs-/Debug-Hilfe, KEIN Kernfeature
 * für blinde Nutzer:innen). Zweck:
 *  - Entwicklerin: sieht den kanonischen Outline-Baum und was jede Pfeiltaste tut.
 *  - Sekundärer Anwendungsfall: sehende:r Tutor:in, der/die eine:n blinde:n
 *    Studierende:n begleitet.
 *
 * Read-only: ändert keine bestehende Navigations-/Sprachlogik. Nutzt denselben
 * Outline-Baum wie Navigation und Sprache.
 */

type Role = 'current' | 'up' | 'down' | 'sibling' | 'parent';

interface TreeItemData {
    depth: number;
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
export function buildTreeData(outline: Outline, current: OutlineNode | null): TreeItemData[] {
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
        tag(n.sibling, 'sibling');
        tag(n.parent, 'parent');
    }
    return outline.linear.map(node => ({
        depth: outlineDepth(node),
        label: describeOutlineNode(node),
        line: node.astNode.startPosition.row + 1,
        row: node.astNode.startPosition.row,
        col: node.astNode.startPosition.column,
        roles: roles.get(node.index) ?? [],
    }));
}

export class TreeViewProvider implements vscode.WebviewViewProvider {
    /** ID der View (siehe package.json contributes.views). */
    public static readonly viewId = 'blindcodeTree';

    private view: vscode.WebviewView | undefined;
    private lastNodes: TreeItemData[] = [];

    /** onJump wird aufgerufen, wenn im Baum auf einen Knoten geklickt wird. */
    constructor(private readonly onJump: (row: number, column: number) => void) {}

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this.html();
        webviewView.webview.onDidReceiveMessage(message => {
            if (message?.type === 'jump') {
                this.onJump(message.row, message.col);
            } else if (message?.type === 'ready') {
                // Webview ist geladen → den zuletzt bekannten Stand rendern.
                this.post();
            }
        });
        webviewView.onDidDispose(() => { this.view = undefined; });
    }

    /** Aktualisiert die Darstellung (nur wenn die View existiert/sichtbar ist). */
    update(outline: Outline, current: OutlineNode | null): void {
        this.lastNodes = buildTreeData(outline, current);
        this.post();
    }

    private post(): void {
        this.view?.webview.postMessage({ type: 'render', nodes: this.lastNodes });
    }

    private html(): string {
        const nonce = String(Math.random()).slice(2);
        return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 8px; }
  h2 { font-size: 1em; margin: 0 0 6px; }
  #legend { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
  .chip { border: 1px solid var(--vscode-panel-border); border-left-width: 6px; border-radius: 4px; padding: 1px 6px; font-size: .85em; }
  .row { display: flex; align-items: center; }
  .guide { color: var(--vscode-descriptionForeground); white-space: pre; }
  .node {
    display: inline-flex; align-items: center; gap: 8px;
    border: 1px solid var(--vscode-panel-border); border-left-width: 6px;
    border-radius: 4px; padding: 2px 8px; margin: 2px 0;
    background: var(--vscode-editor-background); color: var(--vscode-foreground);
    cursor: pointer; font: inherit; text-align: left;
  }
  .node:hover { outline: 1px solid var(--vscode-focusBorder); }
  .line { color: var(--vscode-descriptionForeground); font-size: .85em; }
  .badge { font-size: .8em; border-radius: 3px; padding: 0 5px; border: 1px solid var(--vscode-panel-border); }
  /* Rollen: deutliche Farbtöne + Textbadge (nicht nur Farbe). */
  .role-current { border-left-color: var(--vscode-foreground); border-left-width: 3px; }
  .role-up      { border-left-color: #2e9b3f; } .badge-up      { border-color:#2e9b3f; color:#2e9b3f; }
  .role-down    { border-left-color: #2f7fe0; } .badge-down    { border-color:#2f7fe0; color:#2f7fe0; }
  .role-sibling { border-left-color: #d2a017; } .badge-sibling { border-color:#d2a017; color:#d2a017; }
  .role-parent  { border-left-color: #9b59c4; } .badge-parent  { border-color:#9b59c4; color:#9b59c4; }
  .badge-current { border-color: var(--vscode-foreground); }
  #empty { color: var(--vscode-descriptionForeground); }
</style>
</head>
<body>
<h2>BlindCode Baum (Visualisierung / Debug)</h2>
<div id="legend">
  <span class="chip role-up">↑ Alt+↑ vorheriger</span>
  <span class="chip role-down">↓ Alt+↓ nächster</span>
  <span class="chip role-sibling">→ Alt+→ Geschwister</span>
  <span class="chip role-parent">← Alt+← Elternknoten</span>
  <span class="chip role-current">● aktueller Knoten</span>
</div>
<div id="tree"><p id="empty">Cursor in eine Java-Datei setzen …</p></div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const BADGE = { current: '● aktuell', up: '↑ vorher', down: '↓ nächster', sibling: '→ Geschwister', parent: '← Eltern' };
  function render(nodes) {
    const tree = document.getElementById('tree');
    tree.textContent = '';
    if (!nodes.length) { tree.innerHTML = '<p id="empty">Keine Code-Struktur.</p>'; return; }
    for (const n of nodes) {
      const row = document.createElement('div');
      row.className = 'row';
      const guide = document.createElement('span');
      guide.className = 'guide';
      guide.textContent = '   '.repeat(n.depth);
      row.appendChild(guide);
      const box = document.createElement('button');
      box.type = 'button';
      box.className = 'node' + (n.roles[0] ? ' role-' + n.roles[0] : '');
      const label = document.createElement('span');
      label.textContent = n.label;
      box.appendChild(label);
      const line = document.createElement('span');
      line.className = 'line';
      line.textContent = 'Zeile ' + n.line;
      box.appendChild(line);
      for (const r of n.roles) {
        const b = document.createElement('span');
        b.className = 'badge badge-' + r;
        b.textContent = BADGE[r];
        box.appendChild(b);
      }
      box.addEventListener('click', () => vscode.postMessage({ type: 'jump', row: n.row, col: n.col }));
      row.appendChild(box);
      tree.appendChild(row);
    }
  }
  window.addEventListener('message', e => { if (e.data && e.data.type === 'render') { render(e.data.nodes); } });
  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
    }
}
