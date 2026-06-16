import type Parser = require('tree-sitter');
import { ifBranchKind } from './navigator';

/**
 * Kontext-Sprachausgabe (Komponente "ContextSpeech", Kap. 4.3).
 *
 * Reine Logik ohne VS-Code-Abhängigkeit: wandelt einen tree-sitter-Knoten in eine
 * deutschsprachige Orientierungsbeschreibung um. Format (Stefik 2011: Wichtigstes
 * zuerst):
 *
 *     "<Knoten>, <innerer Skopus>, …, in Methode <X>, Klasse <Y>"
 *
 * Beispiele:
 *   - "else-Zweig, in Methode calculate, Klasse MathLogic"
 *   - "for-Schleife, in Methode main, Klasse HelloWorld"
 *   - "return-Anweisung, im else-Zweig, in Methode calculate, Klasse MathLogic"
 *
 * Wichtig (Designvorgabe M0/M3): Die Navigation überspringt strukturelle
 * Block-Knoten — die Skopusgrenze (then/else, Methode, Klasse) wird hier aus dem
 * ECHTEN Baum rekonstruiert, damit sie trotzdem hörbar bleibt. Skopus-Fehlvorstellungen
 * sind das didaktische Kernziel (Kap. 2.5).
 */

/** Knotentyp → deutsche Bezeichnung (Selbst-Beschreibung). */
const LABELS: Record<string, string> = {
    if_statement: 'if-Anweisung',
    for_statement: 'for-Schleife',
    enhanced_for_statement: 'for-each-Schleife',
    while_statement: 'while-Schleife',
    do_statement: 'do-while-Schleife',
    switch_statement: 'switch-Anweisung',
    switch_expression: 'switch-Anweisung',
    try_statement: 'try-Block',
    catch_clause: 'catch-Block',
    finally_clause: 'finally-Block',
    return_statement: 'return-Anweisung',
    break_statement: 'break-Anweisung',
    continue_statement: 'continue-Anweisung',
    throw_statement: 'throw-Anweisung',
    expression_statement: 'Anweisung',
    local_variable_declaration: 'Variablendeklaration',
    field_declaration: 'Feld',
    method_declaration: 'Methode',
    constructor_declaration: 'Konstruktor',
    class_declaration: 'Klasse',
    interface_declaration: 'Interface',
    enum_declaration: 'Enum',
    lambda_expression: 'Lambda-Ausdruck',
    ternary_expression: 'Bedingungsausdruck',
    parenthesized_expression: 'Bedingung',
    method_invocation: 'Methodenaufruf',
    field_access: 'Feldzugriff',
    object_creation_expression: 'Objekterzeugung',
    array_creation_expression: 'Array-Erzeugung',
    assignment_expression: 'Zuweisung',
    formal_parameters: 'Parameterliste',
    block: 'Block',
    program: 'Programm',
    identifier: 'Bezeichner',
};

/** Knotentypen, die einen Namen tragen (childForFieldName('name')). */
const NAMED_TYPES = new Set<string>([
    'method_declaration',
    'constructor_declaration',
    'class_declaration',
    'interface_declaration',
    'enum_declaration',
]);

/** Name eines Knotens über das 'name'-Feld, falls vorhanden. */
function nodeName(node: Parser.SyntaxNode): string | null {
    return node.childForFieldName('name')?.text ?? null;
}

// ifBranchKind (else/then-Erkennung) lebt in navigator.ts (eine Quelle der Wahrheit
// für die AST-Struktur) und wird hier für die Beschriftung wiederverwendet.

/** Ist `node` eine anonyme innere Klasse (object_creation mit class_body)? */
function isAnonymousClass(node: Parser.SyntaxNode): boolean {
    return (
        node.type === 'object_creation_expression' &&
        node.namedChildren.some(c => c.type === 'class_body')
    );
}

/**
 * Selbst-Beschreibung eines Knotens (ohne Skopus), z. B. "else-Zweig",
 * "for-Schleife", "Methode calculate".
 */
export function describeNode(node: Parser.SyntaxNode): string {
    if (node.type === 'block') {
        const branch = ifBranchKind(node);
        if (branch === 'else') { return 'else-Zweig'; }
        if (branch === 'then') { return 'if-Zweig'; }
        return 'Block';
    }
    if (isAnonymousClass(node)) {
        return 'anonyme Klasse';
    }
    const label = LABELS[node.type] ?? node.type;
    if (NAMED_TYPES.has(node.type)) {
        const name = nodeName(node);
        return name ? `${label} ${name}` : label;
    }
    return label;
}

/**
 * Skopus-Qualifizierer eines Vorfahren ("im else-Zweig", "in for-Schleife",
 * "in Methode X", "Klasse Y") oder null, wenn der Vorfahr keinen eigenen Skopus
 * beiträgt (z. B. ein Methoden-/Schleifenrumpf-block oder ein nacktes if, dessen
 * Zweige den Skopus bereits tragen).
 */
function scopeQualifier(node: Parser.SyntaxNode): string | null {
    switch (node.type) {
        case 'block': {
            const branch = ifBranchKind(node);
            if (branch === 'else') { return 'im else-Zweig'; }
            if (branch === 'then') { return 'im if-Zweig'; }
            return null;
        }
        case 'for_statement':
            return 'in for-Schleife';
        case 'enhanced_for_statement':
            return 'in for-each-Schleife';
        case 'while_statement':
            return 'in while-Schleife';
        case 'do_statement':
            return 'in do-while-Schleife';
        case 'try_statement':
            return 'im try-Block';
        case 'catch_clause':
            return 'im catch-Block';
        case 'switch_statement':
        case 'switch_expression':
            return 'in switch-Anweisung';
        case 'lambda_expression':
            return 'in Lambda-Ausdruck';
        case 'method_declaration': {
            const name = nodeName(node);
            return name ? `in Methode ${name}` : 'in einer Methode';
        }
        case 'constructor_declaration':
            return 'im Konstruktor';
        case 'class_declaration': {
            if (isAnonymousClass(node)) { return 'in anonymer Klasse'; }
            const name = nodeName(node);
            return name ? `Klasse ${name}` : 'in anonymer Klasse';
        }
        case 'interface_declaration': {
            const name = nodeName(node);
            return name ? `Interface ${name}` : 'in einem Interface';
        }
        case 'enum_declaration': {
            const name = nodeName(node);
            return name ? `Enum ${name}` : 'in einem Enum';
        }
        // if_statement selbst trägt keinen Skopus — seine Zweige (block) tun es.
        default:
            return null;
    }
}

/** Skopus-Kette von innen nach außen über die echten Vorfahren. */
function scopeQualifiers(node: Parser.SyntaxNode): string[] {
    const out: string[] = [];
    let current = node.parent;
    while (current) {
        const qualifier = scopeQualifier(current);
        if (qualifier) {
            out.push(qualifier);
        }
        current = current.parent;
    }
    return out;
}

/**
 * Vollständige Orientierungsbeschreibung: Selbst-Beschreibung + Skopus-Kette,
 * durch ", " verbunden.
 */
export function buildContextString(node: Parser.SyntaxNode): string {
    return [describeNode(node), ...scopeQualifiers(node)].join(', ');
}
