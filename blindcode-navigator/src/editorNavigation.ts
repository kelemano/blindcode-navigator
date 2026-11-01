import * as vscode from 'vscode';
import { getAST, getNamedNodeAtCursor } from './parser';
import {
    buildOutline,
    outlineNodeFor,
    outlineDepth,
    navIn,
    navNextSibling,
    navPrevSibling,
    navOut,
    Outline,
    OutlineNode,
    NavMovement,
} from './navigator';
import { describeOutlineNode, outlineMatches, buildEntryAnnouncement } from './contextSpeech';
import type { SpeechController } from './speech';
import type { SonificationController } from './sonificationPlayer';

/** Dienste, die bei einer Navigation auf dem Zielknoten ausgelöst werden. */
export interface NavServices {
    speech: SpeechController;
    sonification: SonificationController;
}

/**
 * VS-Code-Adapter für die Outline-Navigation (Kap. 5.3). Baut pro Aktion den
 * Outline-Baum (klein, < 500 LOC → vernachlässigbar), findet den Knoten an der
 * Cursorposition, wendet die Richtung an, bewegt den Cursor und spricht den Kontext.
 *
 * Tastenmodell (Ebenen-Modell „Überblick → Eintauchen"):
 *   Alt+↑ navigatePrevSibling · Alt+↓ navigateNextSibling  (Geschwister auf dieser Ebene)
 *   Alt+→ navigateIn (eine Ebene hinein + Inhalt ansagen) · Alt+← navigateOut (heraus)
 *   Alt+O showOutline (Gliederungs-Liste → frei zu jedem Knoten springen)
 *   Alt+L readCurrentLine (rohe Code-Zeile vorlesen)
 */

/**
 * Rückmeldung auf einen Tastendruck, der nichts bewegt hat.
 *
 * Im rein auditiven Zugang ist Stille die einzige Rückmeldung, die sich nicht
 * deuten lässt: Sie ist von einer nicht angekommenen Taste, einem abgestürzten
 * Werkzeug und einem verstummten Screenreader nicht zu unterscheiden. Eine
 * Benachrichtigung von VS Code genügt dafür nicht — sie erscheint sichtbar, wird
 * aber nicht vorgelesen, solange der Fokus im Editor bleibt. Die Meldung läuft
 * deshalb zusätzlich über die Sprachausgabe.
 *
 * Bewusst über announceRaw und damit auch im Sprach-Modus `off`: Wer stumm
 * navigiert, braucht die Auskunft über eine Ebenengrenze erst recht, weil ihm
 * der Ton allein nicht sagt, ob die Taste wirkungslos war oder nicht ankam.
 */
function meldeOhneWirkung(services: NavServices, text: string): void {
    services.speech.announceRaw(text);
    vscode.window.showInformationMessage(text);
}

/** Outline-Knoten an der aktuellen Cursorposition (oder null). */
export function outlineNodeAtCursor(editor: vscode.TextEditor): OutlineNode | null {
    return outlineAndCurrent(editor).current;
}

/**
 * Outline-Baum plus den Knoten an der Cursorposition (current = null, wenn der
 * Cursor auf keinem Stopp liegt). Eine Quelle für Statusleiste, Sprache und Baumansicht.
 */
export function outlineAndCurrent(editor: vscode.TextEditor): { outline: Outline; current: OutlineNode | null } {
    const tree = getAST(editor.document);
    const outline = buildOutline(tree.rootNode);
    const astNode = getNamedNodeAtCursor(tree, editor.selection.active);
    return { outline, current: outlineNodeFor(outline, astNode) };
}

function locate(editor: vscode.TextEditor): { outline: Outline; node: OutlineNode } | null {
    const tree = getAST(editor.document);
    const outline = buildOutline(tree.rootNode);
    const astNode = getNamedNodeAtCursor(tree, editor.selection.active);
    const node = outlineNodeFor(outline, astNode);
    return node ? { outline, node } : null;
}

/** Setzt Cursor und Auswahl auf den Anfang des Zielknotens. */
function moveToNode(editor: vscode.TextEditor, node: OutlineNode): void {
    const start = node.astNode.startPosition;
    const pos = new vscode.Position(start.row, start.column);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(
        new vscode.Range(pos, pos),
        vscode.TextEditorRevealType.InCenterIfOutsideViewport
    );
}

/** Löst Sprache + Sonifikation auf dem Zielknoten aus (onNavigate). */
function announce(services: NavServices, target: OutlineNode, movement: NavMovement): void {
    services.speech.announce(target);
    services.sonification.play(target, movement);
}

function go(
    editor: vscode.TextEditor,
    services: NavServices,
    pick: (outline: Outline, node: OutlineNode) => OutlineNode | null,
    edgeMessage: string,
    movement: NavMovement
): void {
    const located = locate(editor);
    if (!located) {
        meldeOhneWirkung(services, 'Keine Code-Struktur an dieser Position');
        return;
    }
    const target = pick(located.outline, located.node);
    if (!target) {
        meldeOhneWirkung(services, edgeMessage);
        return;
    }
    moveToNode(editor, target);
    announce(services, target, movement);
}

/** Alt+↓ — nächstes Geschwister auf dieser Ebene. */
export function navigateNextSibling(editor: vscode.TextEditor, services: NavServices): void {
    go(editor, services, (outline, node) => navNextSibling(outline, node), 'Letzter Knoten auf dieser Ebene', 'next');
}

/** Alt+↑ — vorheriges Geschwister auf dieser Ebene. */
export function navigatePrevSibling(editor: vscode.TextEditor, services: NavServices): void {
    go(editor, services, (outline, node) => navPrevSibling(outline, node), 'Erster Knoten auf dieser Ebene', 'prev');
}

/** Alt+← — eine Ebene heraus (Elternknoten). */
export function navigateOut(editor: vscode.TextEditor, services: NavServices): void {
    go(editor, services, (_outline, node) => navOut(node), 'Oberste Ebene erreicht', 'out');
}

/**
 * Alt+→ — eine Ebene HINEIN (erstes Kind). Statt der normalen Knoten-Ansage wird
 * die betretene Ebene benannt und ihr Inhalt aufgezählt („Methode calculate
 * betreten, 2 Elemente: …"). Auf einem Blatt bleibt der Cursor stehen und es kommt
 * „… hat keine tiefere Ebene".
 */
export function navigateIn(editor: vscode.TextEditor, services: NavServices): void {
    const located = locate(editor);
    if (!located) {
        meldeOhneWirkung(services, 'Keine Code-Struktur an dieser Position');
        return;
    }
    const target = navIn(located.node);
    if (!target) {
        // Blatt: keine tiefere Ebene — nur ansagen, nicht bewegen.
        services.speech.announceMessage(buildEntryAnnouncement(located.node), located.node);
        return;
    }
    moveToNode(editor, target);
    // Eintauch-Ansage bezieht sich auf den betretenen (Eltern-)Knoten.
    services.speech.announceMessage(buildEntryAnnouncement(located.node), target);
    services.sonification.play(target, 'in');
}

/** Alt+L — liest die rohe Quelltextzeile des aktuellen Knotens vor (genau eine Zeile). */
export function readCurrentLine(editor: vscode.TextEditor, services: NavServices): void {
    const located = locate(editor);
    if (!located) {
        meldeOhneWirkung(services, 'Keine Code-Struktur an dieser Position');
        return;
    }
    const row = located.node.astNode.startPosition.row;
    const line = editor.document.lineAt(row).text.trim();
    services.speech.announceRaw(line.length > 0 ? line : '(leere Zeile)');
}

interface OutlineQuickPickItem extends vscode.QuickPickItem {
    node: OutlineNode;
}

/**
 * Alt+O — Gliederungs-Liste (StructJumper-Analog). Zeigt alle Outline-Knoten in
 * Lesereihenfolge als barrierefreie QuickPick. Das sichtbare Label ist deutsch;
 * gefiltert wird über `outlineMatches` (deutsches Label UND englische Java-
 * Schlüsselwörter), sodass z. B. „else" den „Sonst-Zweig" findet. `alwaysShow`
 * schaltet die eingebaute (nur Label-)Filterung von VS Code ab, damit unser
 * eigener Filter maßgeblich ist. Enter springt zum Knoten und spricht den Kontext.
 */
export function showOutline(editor: vscode.TextEditor, services: NavServices): void {
    const tree = getAST(editor.document);
    const outline = buildOutline(tree.rootNode);
    if (outline.linear.length === 0) {
        meldeOhneWirkung(services, 'Keine Code-Struktur in dieser Datei');
        return;
    }
    const allItems: OutlineQuickPickItem[] = outline.linear.map(node => ({
        label: `${'    '.repeat(outlineDepth(node))}${describeOutlineNode(node)}`,
        description: `Zeile ${node.astNode.startPosition.row + 1}`,
        alwaysShow: true,
        node,
    }));

    const quickPick = vscode.window.createQuickPick<OutlineQuickPickItem>();
    quickPick.placeholder = 'Filtern (z. B. else, if, for, while, return) – Enter springt zum Knoten';
    quickPick.items = allItems;
    quickPick.onDidChangeValue(value => {
        const query = value.trim();
        quickPick.items = query
            ? allItems.filter(item => outlineMatches(item.node, query))
            : allItems;
    });
    quickPick.onDidAccept(() => {
        const selected = quickPick.selectedItems[0];
        if (selected) {
            moveToNode(editor, selected.node);
            announce(services, selected.node, 'jump');
        }
        quickPick.hide();
    });
    quickPick.onDidHide(() => quickPick.dispose());
    quickPick.show();
}
