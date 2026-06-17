import * as assert from 'assert';
import * as vscode from 'vscode';

/**
 * Integrationstests im echten VS-Code-Host (Kap. 5.4). Sie öffnen den Golden-Code
 * und führen die echten Befehle aus, prüfen also Aktivierung + Cursor-Navigation
 * end-to-end. (Laufen via `npm run test:integration` / CI; nicht in der reinen
 * Node-Unit-Suite.)
 *
 * Golden-Code identisch zu test-java/MathLogic.java; hier als String, damit der Test
 * unabhängig vom Workspace ist und die Golden-Datei nicht verändert wird.
 */
const GOLDEN = `public class MathLogic {
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

function setCondition(condition: 'A' | 'B' | 'C'): Thenable<void> {
    return vscode.workspace
        .getConfiguration('blindcode')
        .update('studyCondition', condition, vscode.ConfigurationTarget.Global);
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function openGolden(): Promise<vscode.TextEditor> {
    const doc = await vscode.workspace.openTextDocument({ language: 'java', content: GOLDEN });
    return vscode.window.showTextDocument(doc);
}

function setCursor(editor: vscode.TextEditor, line: number, character: number): void {
    const pos = new vscode.Position(line, character);
    editor.selection = new vscode.Selection(pos, pos);
}

const activeLine = (editor: vscode.TextEditor): number => editor.selection.active.line;

const CMD = {
    down: 'blindcode-navigator.navigateDown',
    up: 'blindcode-navigator.navigateUp',
    sibling: 'blindcode-navigator.navigateNextSibling',
    out: 'blindcode-navigator.navigateOut',
};

suite('Integration: BlindCode Navigator am Golden-File', () => {

    suiteSetup(async () => {
        // Java-Datei öffnen → aktiviert die Extension (activationEvents: onLanguage:java),
        // damit die Befehle registriert sind, bevor der erste Test sie prüft.
        await openGolden();
        await setCondition('C'); // alle Funktionen an
        await delay(150);
    });

    suiteTeardown(async () => {
        await setCondition('C');
    });

    test('alle Befehle sind registriert', async () => {
        const commands = await vscode.commands.getCommands(true);
        for (const command of [
            CMD.down, CMD.up, CMD.sibling, CMD.out,
            'blindcode-navigator.showOutline',
            'blindcode-navigator.showTree',
            'blindcode-navigator.toggleSonification',
            'blindcode-navigator.setStudyCondition',
        ]) {
            assert.ok(commands.includes(command), `Befehl fehlt: ${command}`);
        }
    });

    test('Alt+↓ von der Klasse führt zur Methode', async () => {
        const editor = await openGolden();
        setCursor(editor, 0, 13);
        await vscode.commands.executeCommand(CMD.down);
        assert.strictEqual(activeLine(editor), 1); // Methode, Zeile 2
    });

    test('Alt+↓ läuft die Lesereihenfolge ab und erreicht den else-Zweig', async () => {
        const editor = await openGolden();
        setCursor(editor, 5, 10); // println, Zeile 6
        await vscode.commands.executeCommand(CMD.down);
        assert.strictEqual(activeLine(editor), 8); // Sonst-Zweig (else-Block), Zeile 9
    });

    test('Down dann Up kehrt zum Ausgangsknoten zurück', async () => {
        const editor = await openGolden();
        setCursor(editor, 1, 13); // Methode
        await vscode.commands.executeCommand(CMD.down); // -> if, Zeile 3
        assert.strictEqual(activeLine(editor), 2);
        await vscode.commands.executeCommand(CMD.up);   // zurück -> Methode, Zeile 2
        assert.strictEqual(activeLine(editor), 1);
    });

    test('Alt+→ vom Dann-Zweig springt zum Sonst-Zweig', async () => {
        const editor = await openGolden();
        setCursor(editor, 2, 4); // äußeres if
        await vscode.commands.executeCommand(CMD.down);    // -> Dann-Zweig, Zeile 3
        assert.strictEqual(activeLine(editor), 2);
        await vscode.commands.executeCommand(CMD.sibling); // -> Sonst-Zweig, Zeile 9
        assert.strictEqual(activeLine(editor), 8);
    });

    test('Alt+← geht heraus (return -1 -> äußeres if über den Sonst-Zweig)', async () => {
        const editor = await openGolden();
        setCursor(editor, 9, 6); // return -1, Zeile 10
        await vscode.commands.executeCommand(CMD.out);  // -> Sonst-Zweig, Zeile 9
        assert.strictEqual(activeLine(editor), 8);
        await vscode.commands.executeCommand(CMD.out);  // -> äußeres if, Zeile 3
        assert.strictEqual(activeLine(editor), 2);
    });

    test('Bedingung A: Navigation tut nichts (Cursor bleibt)', async () => {
        await setCondition('A');
        await delay(80);
        const editor = await openGolden();
        setCursor(editor, 0, 13);
        await vscode.commands.executeCommand(CMD.down);
        assert.strictEqual(activeLine(editor), 0); // unverändert
        await setCondition('C');
        await delay(80);
    });

    test('nach Rückschalten auf C funktioniert die Navigation wieder', async () => {
        const editor = await openGolden();
        setCursor(editor, 0, 13);
        await vscode.commands.executeCommand(CMD.down);
        assert.strictEqual(activeLine(editor), 1);
    });
});
