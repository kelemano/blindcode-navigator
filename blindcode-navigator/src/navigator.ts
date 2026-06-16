import type Parser = require('tree-sitter');

/**
 * Reine AST-Traversal-Logik (Komponente "Navigator", siehe Kap. 4.1).
 *
 * Diese Funktionen kennen weder VS Code noch den Editor. Sie nehmen einen
 * tree-sitter-Knoten entgegen und liefern den Zielknoten der jeweiligen
 * Navigationsrichtung oder `null`, wenn es kein Ziel gibt (Edge Case).
 *
 * --- Meaningful-Node-Whitelist (Designentscheidung M2/Kap. 4.2) ---
 * Navigation stoppt NUR auf strukturell bedeutungstragenden Knoten (Klasse,
 * Methode, if, else-Zweig, Schleifen, return, Variablendeklaration,
 * Anweisung/Methodenaufruf, …). Alles andere (binary_expression, modifiers,
 * field_access, identifier, parenthesized_expression …) ist für blinde
 * Anfänger:innen Rauschen und wird übersprungen — analog zu StructJumper, das die
 * logische Hierarchie statt der Syntaxdetails navigiert.
 *
 * Modell: Navigation operiert auf dem "meaningful tree" — dem auf die Whitelist
 * eingeschränkten Baum. Nicht-bedeutungstragende Knoten sind transparent: ihre
 * bedeutungstragenden Nachfahren rücken an ihre Stelle. Dadurch gilt:
 *   - parent/child sind echte Inverse (Down dann Up landet wieder am Start),
 *   - der else-Zweig ist ein eigener Stopp (siehe isMeaningful),
 *   - der Skopus bleibt erhalten und wird in M3 hörbar gemacht.
 */

/** Knotentyp der tree-sitter-java-Wurzel. */
const ROOT_TYPE = 'program';

/**
 * Bedeutungstragende Knotentypen (Navigationsziele). `block` ist NICHT enthalten;
 * der else-Zweig (alternative-block) wird in isMeaningful gesondert ergänzt.
 */
const MEANINGFUL_TYPES = new Set<string>([
    // Typdeklarationen
    'class_declaration',
    'interface_declaration',
    'enum_declaration',
    'record_declaration',
    'annotation_type_declaration',
    // Member
    'method_declaration',
    'constructor_declaration',
    'compact_constructor_declaration',
    'field_declaration',
    // Kontrollstrukturen
    'if_statement',
    'for_statement',
    'enhanced_for_statement',
    'while_statement',
    'do_statement',
    'switch_statement',
    'switch_expression',
    'try_statement',
    'try_with_resources_statement',
    'catch_clause',
    'finally_clause',
    'synchronized_statement',
    'labeled_statement',
    // Anweisungen
    'return_statement',
    'break_statement',
    'continue_statement',
    'throw_statement',
    'yield_statement',
    'assert_statement',
    'local_variable_declaration',
    'expression_statement', // u. a. Methodenaufruf-Anweisung, Zuweisung
    // Sonstiges
    'lambda_expression',
]);

/**
 * Zweig-Art eines block-Knotens: 'else' wenn er der `alternative`-Zweig eines if
 * ist, 'then' wenn `consequence`, sonst null. (tree-sitter-java kennt keinen
 * else_clause-Knoten; der else-Zweig ist der zweite block, Feld `alternative`.)
 */
export function ifBranchKind(block: Parser.SyntaxNode): 'else' | 'then' | null {
    const parent = block.parent;
    if (!parent || parent.type !== 'if_statement') {
        return null;
    }
    if (parent.childForFieldName('alternative')?.id === block.id) {
        return 'else';
    }
    if (parent.childForFieldName('consequence')?.id === block.id) {
        return 'then';
    }
    return null;
}

/** Ist `node` ein Navigationsziel (bedeutungstragend)? */
export function isMeaningful(node: Parser.SyntaxNode): boolean {
    if (MEANINGFUL_TYPES.has(node.type)) {
        return true;
    }
    // Der else-Zweig ist ein eigenständiger sinnvoller Stopp (der then-Zweig
    // dagegen ist transparent — er ist der Standard-Rumpf des if).
    if (node.type === 'block' && ifBranchKind(node) === 'else') {
        return true;
    }
    return false;
}

/**
 * Die bedeutungstragenden Kinder im meaningful tree: bedeutungstragende Kinder
 * werden übernommen, nicht-bedeutungstragende durch ihre eigenen (rekursiv
 * ermittelten) bedeutungstragenden Nachfahren ersetzt.
 */
function meaningfulChildren(node: Parser.SyntaxNode): Parser.SyntaxNode[] {
    const result: Parser.SyntaxNode[] = [];
    for (const child of node.namedChildren) {
        if (isMeaningful(child)) {
            result.push(child);
        } else {
            result.push(...meaningfulChildren(child));
        }
    }
    return result;
}

/** Nächster bedeutungstragender Vorfahr (oder null). */
function meaningfulParent(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
    let parent = node.parent;
    while (parent && !isMeaningful(parent)) {
        parent = parent.parent;
    }
    return parent ?? null;
}

/** Wurzelknoten (program) durch Hochlaufen. */
function rootOf(node: Parser.SyntaxNode): Parser.SyntaxNode {
    let current = node;
    while (current.parent) {
        current = current.parent;
    }
    return current;
}

/** Index von `node` (per stabiler tree-sitter-id) in einer Knotenliste. */
function indexById(nodes: Parser.SyntaxNode[], node: Parser.SyntaxNode): number {
    return nodes.findIndex(n => n.id === node.id);
}

/**
 * Container für Geschwister: der bedeutungstragende Elternknoten, oder — für
 * Top-Level-Deklarationen — die Programmwurzel.
 */
function siblingContainer(node: Parser.SyntaxNode): Parser.SyntaxNode {
    return meaningfulParent(node) ?? rootOf(node);
}

/**
 * Normalisiert einen (Cursor-)Knoten auf den nächsten bedeutungstragenden Knoten,
 * indem nach oben gelaufen wird. Liegt der Cursor z. B. in einer Bedingung
 * (binary_expression), landet man auf der umschließenden if-Anweisung.
 * Liefert null, wenn es keinen bedeutungstragenden Vorfahren gibt (z. B. leeres Programm).
 */
export function toMeaningfulNode(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
    let current: Parser.SyntaxNode | null = node;
    while (current && !isMeaningful(current)) {
        current = current.parent;
    }
    return current;
}

/**
 * Elternknoten im meaningful tree ("hoch im Baum", Alt+Up).
 * Liefert null, wenn der Knoten auf oberster Ebene liegt.
 */
export function findParent(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
    const parent = meaningfulParent(node);
    if (!parent || parent.type === ROOT_TYPE) {
        return null;
    }
    return parent;
}

/**
 * Erstes bedeutungstragendes Kind ("rein in den Block", Alt+Down).
 * Liefert null, wenn es kein bedeutungstragendes Kind gibt (Blatt-Anweisung).
 */
export function findFirstChild(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
    return meaningfulChildren(node)[0] ?? null;
}

/**
 * Nächstes bedeutungstragendes Geschwister ("weiter auf gleicher Ebene", Alt+Right).
 * Liefert null, wenn es kein weiteres gibt.
 */
export function findNextSibling(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
    const siblings = meaningfulChildren(siblingContainer(node));
    const index = indexById(siblings, node);
    if (index === -1) {
        return null;
    }
    return siblings[index + 1] ?? null;
}

/**
 * Vorheriges bedeutungstragendes Geschwister ("zurück auf gleicher Ebene", Alt+Left).
 * Liefert null, wenn es kein vorheriges gibt.
 */
export function findPrevSibling(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
    const siblings = meaningfulChildren(siblingContainer(node));
    const index = indexById(siblings, node);
    if (index <= 0) {
        return null;
    }
    return siblings[index - 1] ?? null;
}
