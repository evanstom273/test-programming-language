import * as vscode from 'vscode';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { loadProject } from './project';
import { analyze } from './analyze';
import { renameConfiguration } from './configuration';
import { buildNativeApplication, nativeFilename } from './native';
import {
  standaloneDocument,
  standaloneFilename,
} from '../../../src/build/standalone/document';
import { isLanguageValue } from '../../../src/language/program';
import type { ProjectSnapshot } from '../../../src/workspace/model';
import type { ExportOverrides } from '../../../src/language/ast';
let client: LanguageClient | undefined;
export async function activate(context: vscode.ExtensionContext) {
  const server = context.asAbsolutePath('dist/server.cjs');
  const watcher = vscode.workspace.createFileSystemWatcher('**/*');
  client = new LanguageClient(
    'languageLab',
    'Language Lab',
    {
      run: { module: server, transport: TransportKind.ipc },
      debug: { module: server, transport: TransportKind.ipc },
    },
    {
      documentSelector: [{ scheme: 'file', language: 'langlab' }],
      synchronize: { fileEvents: watcher },
    },
  );
  const buildOutput = vscode.window.createOutputChannel('Language Lab Build');
  context.subscriptions.push(watcher, client, buildOutput);
  let panel: vscode.WebviewPanel | undefined;
  let active: ProjectSnapshot | undefined;
  let lastFile: vscode.Uri | undefined;
  let revision = 0;
  let viewId = '';
  let previewReady = false;
  let saveQueue = Promise.resolve();
  const key = 'inspectorOverrides.v1';
  let overrides = context.workspaceState.get<Record<string, ExportOverrides>>(
    key,
    {},
  );
  const trusted = () => {
    if (!vscode.workspace.isTrusted)
      throw new Error(
        'Trust this workspace before running or exporting programs.',
      );
  };
  async function snapshot(uri?: vscode.Uri) {
    const file =
      uri ?? vscode.window.activeTextEditor?.document.uri ?? lastFile;
    if (!file || file.scheme !== 'file' || !file.path.endsWith('.lang'))
      throw new Error('Open and save a .lang file first.');
    const buffers = new Map(
      vscode.workspace.textDocuments
        .filter((d) => d.uri.scheme === 'file')
        .map((d) => [d.uri.fsPath, d.getText()]),
    );
    const loaded = await loadProject(
      file.fsPath,
      (vscode.workspace.workspaceFolders ?? [])
        .filter((f) => f.uri.scheme === 'file')
        .map((f) => f.uri.fsPath),
      buffers,
    );
    lastFile = file;
    return {
      ...loaded,
      files: loaded.files.map((f) => ({
        ...f,
        exportOverrides: overrides[f.id],
      })),
    };
  }
  async function host(name: string) {
    return JSON.parse(
      await readFile(
        context.asAbsolutePath('dist/' + name + '-host.json'),
        'utf8',
      ),
    );
  }
  async function checkedProject() {
    const project = await snapshot();
    const result = await analyze(project);
    if (result.diagnostics.length)
      throw new Error(
        result.diagnostics
          .map(
            (d) =>
              `${d.span.fileId}:${d.span.start.line}:${d.span.start.column} ${d.message}`,
          )
          .join('\n'),
      );
    return project;
  }

  async function nativeBuild(target: 'windows' | 'android') {
    trusted();
    const project = await checkedProject();
    const extension = target === 'windows' ? 'exe' : 'apk';
    const destination = await vscode.window.showSaveDialog({
      saveLabel:
        target === 'windows'
          ? 'Build Windows application'
          : 'Build Android APK',
      defaultUri: vscode.Uri.file(
        join(
          require('node:os').homedir(),
          nativeFilename(project, target),
        ),
      ),
      filters: {
        [target === 'windows' ? 'Windows application' : 'Android package']: [
          extension,
        ],
      },
    });
    if (!destination) return;

    buildOutput.clear();
    buildOutput.show(true);
    const template = await host('standalone');
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title:
          target === 'windows'
            ? 'Building Windows application'
            : 'Building Android APK',
        cancellable: false,
      },
      async (progress) => {
        progress.report({
          message:
            target === 'windows'
              ? 'Compiling native executable…'
              : 'Compiling Android application…',
        });
        await buildNativeApplication(
          project,
          template,
          target,
          destination.fsPath,
          buildOutput,
        );
      },
    );
    const reveal = await vscode.window.showInformationMessage(
      'Language Lab built ' + destination.fsPath,
      'Reveal',
    );
    if (reveal === 'Reveal')
      await vscode.commands.executeCommand('revealFileInOS', destination);
  }

  async function run(uri?: vscode.Uri) {
    trusted();
    const token = ++revision;
    const project = await snapshot(uri);
    const template = await host('preview');
    if (token !== revision) return;
    active = project;
    if (!panel) {
      panel = vscode.window.createWebviewPanel(
        'languageLab.app',
        'Language Lab App',
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [],
        },
      );
      panel.onDidDispose(
        () => {
          panel = undefined;
          active = undefined;
          revision++;
        },
        null,
        context.subscriptions,
      );
      panel.webview.onDidReceiveMessage(
        (message: unknown) => {
          if (!message || typeof message !== 'object') return;
          const m = message as Record<string, unknown>;
          if (m.session !== viewId) return;
          if (m.type === 'ready') {
            previewReady = true;
            return;
          }
          if (m.type === 'run') {
            void safely(() => run(lastFile));
            return;
          }
          if (
            m.type !== 'configure' ||
            !vscode.workspace.isTrusted ||
            !active ||
            typeof m.fileId !== 'string' ||
            typeof m.name !== 'string' ||
            !/^[A-Za-z_][A-Za-z0-9_]*$/.test(m.name) ||
            !active.files.some((f) => f.id === m.fileId) ||
            (m.value !== undefined &&
              (m.value === null || !isLanguageValue(m.value)))
          )
            return;
          const values: ExportOverrides = Object.assign(
            Object.create(null),
            overrides[m.fileId] ?? {},
          );
          if (m.value === undefined) delete values[m.name];
          else values[m.name] = m.value as ExportOverrides[string];
          overrides = { ...overrides, [m.fileId]: values };
          const saved = overrides;
          saveQueue = saveQueue
            .then(() => context.workspaceState.update(key, saved))
            .catch((e) => {
              void vscode.window.showErrorMessage(
                'Unable to save Inspector configuration: ' + String(e),
              );
            });
        },
        null,
        context.subscriptions,
      );
    }
    panel.title = project.project.name;
    viewId = String(token);
    previewReady = false;
    panel.webview.html = standaloneDocument(project, template).replace(
      '<body>',
      '<body data-session="' + viewId + '">',
    );
    panel.reveal(vscode.ViewColumn.Beside, true);
  }
  function stale(uri?: vscode.Uri) {
    revision++;
    if (
      !active ||
      (uri &&
        !active.files.some((f) => f.id === pathToFileURL(uri.fsPath).href) &&
        !uri.path.endsWith('/langlab.json'))
    )
      return;
    void panel?.webview.postMessage({ type: 'stale' });
  }
  context.subscriptions.push(
    vscode.workspace.onDidRenameFiles((event) => {
      overrides = renameConfiguration(
        overrides,
        event.files
          .filter(
            (f) => f.oldUri.scheme === 'file' && f.newUri.scheme === 'file',
          )
          .map((f) => ({ from: f.oldUri.fsPath, to: f.newUri.fsPath })),
      );
      const saved = overrides;
      saveQueue = saveQueue
        .then(() => context.workspaceState.update(key, saved))
        .catch((e) => {
          void vscode.window.showErrorMessage(String(e));
        });
      stale();
    }),
    vscode.workspace.onDidChangeTextDocument((e) => stale(e.document.uri)),
    watcher.onDidChange((uri) => stale(uri)),
    watcher.onDidDelete((uri) => stale(uri)),
    watcher.onDidCreate(() => stale()),
    vscode.commands.registerCommand('langlab.run', (uri?: vscode.Uri) =>
      safely(() => run(uri)),
    ),
    vscode.commands.registerCommand('langlab.stop', () => {
      revision++;
      void panel?.webview.postMessage({ type: 'stop' });
    }),
    vscode.commands.registerCommand('langlab.buildWindows', () =>
      safely(() => nativeBuild('windows')),
    ),
    vscode.commands.registerCommand('langlab.buildAndroid', () =>
      safely(() => nativeBuild('android')),
    ),
    vscode.commands.registerCommand('langlab.exportHTML', () =>
      safely(async () => {
        trusted();
        const project = await checkedProject();
        const destination = await vscode.window.showSaveDialog({
          saveLabel: 'Export standalone HTML',
          defaultUri: vscode.Uri.file(
            join(
              require('node:os').homedir(),
              standaloneFilename(project.project.name),
            ),
          ),
          filters: { 'HTML application': ['html'] },
        });
        if (destination)
          await vscode.workspace.fs.writeFile(
            destination,
            new TextEncoder().encode(
              standaloneDocument(project, await host('standalone')),
            ),
          );
      }),
    ),
    {
      dispose() {
        panel?.dispose();
      },
    },
  );
  await client.start();
  return {
    getPreviewState: () => ({
      ready: !!panel && previewReady,
      projectId: active?.project.id,
    }),
  };
}
async function safely(action: () => Promise<void>) {
  try {
    await action();
  } catch (e) {
    void vscode.window.showErrorMessage(
      e instanceof Error ? e.message : String(e),
    );
  }
}
export async function deactivate() {
  await client?.stop();
}
