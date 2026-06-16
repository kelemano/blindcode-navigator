import type Parser = require('tree-sitter');

/**
 * Navigations-Logik (Komponente "Navigator", Kap. 4.1/4.2).
 *
 * Modell: EIN kanonischer "Outline-Baum" (Code-Gliederung) aus bedeutungstragenden
 * Knoten. Dieser Baum treibt sowohl die Navigation als auch (über contextSpeech) die
 * Sprachausgabe — „was man navigiert" = „was man hört".
 *
 * Tastenmodell (StructJumper-Gliederung, Kap. 2.3):
 *   - Alt+↓ / Alt+↑ : nächster / vorheriger Knoten in LESEREIHENFOLGE (linearisierte
 *                     Vorordnung der Gliederung) — siehe navDown/navUp.
 *   - Alt+→ / Alt+← : eine Verschachtelungsebene HINEIN / HERAUS — siehe navIn/navOut.
 *
 * Aufbauregeln des Outline-Baums (siehe buildOutline):
 *   - Stopps sind nur bedeutungstragende Knoten (STOP_KINDS). Bedingungen, Ausdrücke,
 *     Bezeichner, Modifier, Köpfe (for-Init/-Update, Parameter) sind KEINE Stopps.
 *   - In einen Knoten wird nur über seinen RUMPF abgestiegen (body-Feld bzw. bei if die
 *     Zweige) — niemals über Kopf-Teile. Dadurch ist „hinein" immer der Rumpf.
 *   - if ist SYMMETRISCH: if → [Dann-Zweig, Sonst-Zweig] (Sonst nur wenn vorhanden).
 */

export type OutlineKind =
    | 'class' | 'interface' | 'enum'
    | 'method' | 'constructor' | 'field'
    | 'if' | 'then-branch' | 'else-branch'
    | 'for' | 'foreach' | 'while' | 'do'
    | 'switch' | 'try' | 'catch' | 'finally' | 'sync' | 'labeled'
    | 'return' | 'break' | 'continue' | 'throw' | 'yield' | 'assert'
    | 'variable' | 'statement' | 'lambda';

export interface OutlineNode {
    /** AST-Knoten, auf den der Cursor gesetzt wird. */
    astNode: Parser.SyntaxNode;
    kind: OutlineKind;
    parent: OutlineNode | null;
    children: OutlineNode[];
    /** Position in der linearisierten Vorordnung (für Alt+↓/↑). */
    index: number;
}

export interface Outline {
    /** Alle Knoten in Vorordnung (Lesereihenfolge). */
    linear: OutlineNode[];
    /** AST-Knoten-id → Outline-Knoten (zum Auffinden über die Cursorposition). */
    byAstId: Map<number, OutlineNode>;
}

/** AST-Knotentyp → Outline-Art (Stopp), oder undefined = kein Stopp (transparent). */
const STOP_KINDS: Record<string, OutlineKind> = {
    class_declaration: 'class',
    record_declaration: 'class',
    interface_declaration: 'interface',
    annotation_type_declaration: 'interface',
    enum_declaration: 'enum',
    method_declaration: 'method',
    constructor_declaration: 'constructor',
    compact_constructor_declaration: 'constructor',
    field_declaration: 'field',
    if_statement: 'if',
    for_statement: 'for',
    enhanced_for_statement: 'foreach',
    while_statement: 'while',
    do_statement: 'do',
    switch_statement: 'switch',
    switch_expression: 'switch',
    try_statement: 'try',
    try_with_resources_statement: 'try',
    catch_clause: 'catch',
    finally_clause: 'finally',
    synchronized_statement: 'sync',
    labeled_statement: 'labeled',
    return_statement: 'return',
    break_statement: 'break',
    continue_statement: 'continue',
    throw_statement: 'throw',
    yield_statement: 'yield',
    assert_statement: 'assert',
    local_variable_declaration: 'variable',
    expression_statement: 'statement',
    lambda_expression: 'lambda',
};

function stopKindOf(node: Parser.SyntaxNode): OutlineKind | null {
    return STOP_KINDS[node.type] ?? null;
}

/**
 * Baut den Outline-Baum aus der AST-Wurzel. Die Reihenfolge der Erzeugung ist die
 * Vorordnung (Lesereihenfolge) und füllt `linear`.
 */
export function buildOutline(root: Parser.SyntaxNode): Outline {
    const linear: OutlineNode[] = [];
    const byAstId = new Map<number, OutlineNode>();

    function emit(
        astNode: Parser.SyntaxNode,
        kind: OutlineKind,
        parent: OutlineNode | null
    ): OutlineNode {
        const node: OutlineNode = { astNode, kind, parent, children: [], index: linear.length };
        linear.push(node);
        if (!byAstId.has(astNode.id)) {
            byAstId.set(astNode.id, node);
        }
        if (parent) {
            parent.children.push(node);
        }
        return node;
    }

    /** Durchsucht die benannten Kinder eines transparenten Containers nach Stopps. */
    function scan(container: Parser.SyntaxNode, parent: OutlineNode | null): void {
        for (const child of container.namedChildren) {
            classify(child, parent);
        }
    }

    /** Ist der Knoten ein Stopp → Outline-Knoten erzeugen + Rumpf bauen; sonst transparent absteigen. */
    function classify(astNode: Parser.SyntaxNode, parent: OutlineNode | null): void {
        const kind = stopKindOf(astNode);
        if (kind === null) {
            for (const child of astNode.namedChildren) {
                classify(child, parent);
            }
            return;
        }
        const node = emit(astNode, kind, parent);
        buildBody(astNode, kind, node);
    }

    /** Erzeugt die Outline-Kinder eines Stopps (nur aus dem Rumpf, nie aus dem Kopf). */
    function buildBody(astNode: Parser.SyntaxNode, kind: OutlineKind, node: OutlineNode): void {
        if (kind === 'if') {
            buildBranch(astNode.childForFieldName('consequence'), 'then-branch', node);
            buildBranch(astNode.childForFieldName('alternative'), 'else-branch', node);
            return;
        }
        if (kind === 'try') {
            descendBody(astNode.childForFieldName('body'), node);
            for (const child of astNode.namedChildren) {
                if (child.type === 'catch_clause' || child.type === 'finally_clause') {
                    classify(child, node);
                }
            }
            return;
        }
        const body = astNode.childForFieldName('body');
        if (body) {
            descendBody(body, node);
            return;
        }
        // Einfache Anweisungen (return, Anweisung, Variablendeklaration, …): nach
        // verschachtelten Stopps (z. B. Lambdas) durchsuchen — meist keine.
        for (const child of astNode.namedChildren) {
            classify(child, node);
        }
    }

    /** Steigt in einen Rumpf ab: block transparent (Anweisungen), sonst die Einzelanweisung. */
    function descendBody(body: Parser.SyntaxNode | null, parent: OutlineNode): void {
        if (!body) { return; }
        if (body.type === 'block') {
            scan(body, parent);
        } else {
            classify(body, parent);
        }
    }

    /** Baut einen if-Zweig: ein Block wird zum Zweig-Knoten (Dann-/Sonst-Zweig);
     *  ein klammerloser Zweig oder `else if` wird direkt unter das if gehängt. */
    function buildBranch(
        branch: Parser.SyntaxNode | null,
        kind: OutlineKind,
        parent: OutlineNode
    ): void {
        if (!branch) { return; }
        if (branch.type === 'block') {
            const node = emit(branch, kind, parent);
            scan(branch, node);
        } else {
            classify(branch, parent);
        }
    }

    for (const child of root.namedChildren) {
        classify(child, null);
    }
    return { linear, byAstId };
}

/**
 * Outline-Knoten zur (Cursor-)Position: vom AST-Knoten nach oben laufen bis ein
 * Knoten mit Outline-Eintrag gefunden ist (nächster umschließender Stopp). Ein
 * Cursor in einem Kopf (z. B. der for-Init) landet so auf der zugehörigen
 * Kontrollstruktur.
 */
export function outlineNodeFor(
    outline: Outline,
    astNode: Parser.SyntaxNode
): OutlineNode | null {
    let current: Parser.SyntaxNode | null = astNode;
    while (current) {
        const node = outline.byAstId.get(current.id);
        if (node) { return node; }
        current = current.parent;
    }
    return null;
}

/** Alt+↓ — nächster Knoten in Lesereihenfolge. */
export function navDown(outline: Outline, node: OutlineNode): OutlineNode | null {
    return outline.linear[node.index + 1] ?? null;
}

/** Alt+↑ — vorheriger Knoten in Lesereihenfolge. */
export function navUp(outline: Outline, node: OutlineNode): OutlineNode | null {
    return outline.linear[node.index - 1] ?? null;
}

/** Eine Ebene hinein (erstes Kind). Wird aktuell nicht auf eine Taste gelegt,
 *  ist aber als reine Baum-Operation für Tests/künftige Nutzung exportiert. */
export function navIn(node: OutlineNode): OutlineNode | null {
    return node.children[0] ?? null;
}

/** Alt+← — eine Ebene heraus (Elternknoten). */
export function navOut(node: OutlineNode): OutlineNode | null {
    return node.parent;
}

/** Geschwister eines Knotens (Top-Level: die Wurzeln der Gliederung). */
function siblingsOf(outline: Outline, node: OutlineNode): OutlineNode[] {
    return node.parent ? node.parent.children : outline.linear.filter(n => !n.parent);
}

/** Alt+→ — nächstes Geschwister (überspringt den ganzen Block des aktuellen Knotens). */
export function navNextSibling(outline: Outline, node: OutlineNode): OutlineNode | null {
    const siblings = siblingsOf(outline, node);
    const index = siblings.indexOf(node);
    if (index === -1) { return null; }
    return siblings[index + 1] ?? null;
}

/**
 * Die vier Richtungs-Nachbarn eines Knotens (für die visuelle Baumansicht).
 * Bündelt genau die Funktionen, die auch die Tasten ausführen.
 */
export interface Neighbours {
    /** Alt+↑ — vorheriger Knoten in Lesereihenfolge. */
    up: OutlineNode | null;
    /** Alt+↓ — nächster Knoten in Lesereihenfolge. */
    down: OutlineNode | null;
    /** Alt+→ — nächstes Geschwister. */
    sibling: OutlineNode | null;
    /** Alt+← — Elternknoten. */
    parent: OutlineNode | null;
}

/** Löst für einen Knoten alle vier Richtungsziele auf (wiederverwendet die nav-Funktionen). */
export function resolveNeighbours(outline: Outline, node: OutlineNode): Neighbours {
    return {
        up: navUp(outline, node),
        down: navDown(outline, node),
        sibling: navNextSibling(outline, node),
        parent: navOut(node),
    };
}

/** Verschachtelungstiefe (Wurzel = 0) — für die Einrückung in der Gliederungs-Liste. */
export function outlineDepth(node: OutlineNode): number {
    let depth = 0;
    let current = node.parent;
    while (current) {
        depth += 1;
        current = current.parent;
    }
    return depth;
}
