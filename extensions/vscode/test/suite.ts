import * as vscode from 'vscode';
import * as assert from 'node:assert/strict';
async function until<T>(
  action: () => PromiseLike<T> | T,
  predicate: (value: T) => boolean,
): Promise<T> {
  const end = Date.now() + 20000;
  let last: T;
  do {
    last = await action();
    if (predicate(last)) return last;
    await new Promise((r) => setTimeout(r, 150));
  } while (Date.now() < end);
  throw new Error(
    'Timed out waiting for extension condition: ' + JSON.stringify(last!),
  );
}
export async function run() {
  const root = vscode.workspace.workspaceFolders![0].uri;
  const uri = vscode.Uri.joinPath(root, 'main.lang');
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc);
  assert.equal(doc.languageId, 'langlab');
  const extension = vscode.extensions.getExtension(
    'language-lab-local.language-lab',
  )!;
  const api = (await extension.activate()) as {
    getPreviewState(): { ready: boolean; projectId?: string };
  };
  const position = doc.positionAt(doc.getText().indexOf('maths.double') + 8);
  const definitions = await until(
    () =>
      vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeDefinitionProvider',
        uri,
        position,
      ),
    (v) => !!v?.length,
  );
  assert.equal(
    definitions![0].uri.path,
    vscode.Uri.joinPath(root, 'lib/maths.lang').path,
  );
  const hover = await vscode.commands.executeCommand<vscode.Hover[]>(
    'vscode.executeHoverProvider',
    uri,
    position,
  );
  assert.ok(hover?.length);
  const completion =
    await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      uri,
      doc.positionAt(doc.getText().indexOf('maths.double') + 6),
    );
  assert.ok(completion?.items.some((i) => i.label === 'double'));
  const bad = new vscode.WorkspaceEdit();
  bad.replace(
    uri,
    new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)),
    'integer missing = 1.',
  );
  await vscode.workspace.applyEdit(bad);
  await until(
    () => vscode.languages.getDiagnostics(uri),
    (ds) => ds.some((d) => String(d.code) === 'SYNTAX_ERROR'),
  );
  const fixed = new vscode.WorkspaceEdit();
  fixed.replace(
    uri,
    new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)),
    'input integer: number = 7. button "Go", do. print(number). end button.',
  );
  await vscode.workspace.applyEdit(fixed);
  await until(
    () => vscode.languages.getDiagnostics(uri),
    (ds) => ds.length === 0,
  );
  await vscode.commands.executeCommand('langlab.run');
  await until(
    () => api.getPreviewState(),
    (s) => s.ready,
  );
  assert.ok(api.getPreviewState().projectId);
  await vscode.commands.executeCommand('langlab.stop');
  console.log(
    'VS Code extension: language registration, unsaved diagnostics, completion, hover, cross-file definition, preview and Stop passed.',
  );
}
