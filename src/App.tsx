import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Code2,
  FileCode2,
  FilePlus2,
  Files,
  Play,
  RotateCcw,
  Save,
  SlidersHorizontal,
  TerminalSquare,
  Trash2,
  X
} from 'lucide-react';
import { Editor } from './Editor';
import { db, ensureStarterFile, saveOverride, withOverride, type OverrideKind, type CodeFile } from './db';
import { ValueControl } from './components/ValueControl';
import { ProgramOutput } from './components/ProgramOutput';
import { useProgramSession, errorMessage } from './hooks/useProgramSession';
import {
  inspectSource,
  type ExportField,
  type ExportValue
} from './language/runtime';

export default function App() {
  const [files, setFiles] = useState<CodeFile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(true);
  const [saved, setSaved] = useState(true);
  const saveTimer = useRef<number | null>(null);

  const activeFile = useMemo(
    () => files.find((file) => file.id === activeId) || files[0] || null,
    [files, activeId]
  );

  const program = useProgramSession(activeFile);
  const error = program.error;

  const exportAnalysis = useMemo(() => {
    if (!activeFile) return { fields: [] as ExportField[], error: null as string | null };
    try {
      return { fields: inspectSource(activeFile.content), error: null };
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to read exported values.';
      return { fields: [] as ExportField[], error: message };
    }
  }, [activeFile?.id, activeFile?.content]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const starter = await ensureStarterFile();
      const stored = await db.files.orderBy('createdAt').toArray();
      if (cancelled) return;
      setFiles(stored);
      setActiveId(starter.id);
    })().catch((caught) => setStorageError('Unable to open local files: ' + errorMessage(caught)));

    return () => { cancelled = true; };
  }, []);

  const updateCode = useCallback((content: string) => {
    if (!activeFile) return;
    const updatedAt = Date.now();
    setSaved(false);
    setFiles((current) => current.map((file) => file.id === activeFile.id ? { ...file, content, updatedAt } : file));

    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      await db.files.update(activeFile.id, { content, updatedAt });
      setSaved(true);
    }, 350);
  }, [activeFile]);

  const updateOverride = useCallback((kind: OverrideKind, name: string, value: ExportValue | undefined) => {
    if (!activeFile) return;
    const id = activeFile.id;
    setFiles((current) => current.map((file) => file.id === id ? { ...file, [kind]: withOverride(file[kind], name, value) } : file));
    void saveOverride(id, kind, name, value).catch((caught) => {
      setStorageError('Unable to save control values. Keep this page open and try editing the value again. ' + errorMessage(caught));
    });
  }, [activeFile?.id]);

  const run = () => {
    setConsoleOpen(true);
    program.run();
  };

  const updateInput = (name: string, value: ExportValue) => {
    program.setInput(name, value);
    updateOverride('inputOverrides', name, value);
  };

  const resetInputs = () => {
    if (!activeFile) return;
    setFiles((current) => current.map((file) => file.id === activeFile.id ? { ...file, inputOverrides: {} } : file));
    void db.files.update(activeFile.id, { inputOverrides: {} }).catch((caught) => setStorageError('Unable to reset saved inputs: ' + errorMessage(caught)));
    program.run({});
    setConsoleOpen(true);
  };

  const createFile = useCallback(async () => {
    const now = Date.now();
    const file: CodeFile = {
      id: crypto.randomUUID(),
      name: 'file' + (files.length + 1) + '.lang',
      content: 'print("Hello from a new file.").',
      exportOverrides: {},
      createdAt: now,
      updatedAt: now
    };

    await db.files.add(file);
    setFiles((current) => [...current, file]);
    setActiveId(file.id);
    setExplorerOpen(false);
  }, [files.length]);

  const deleteFile = useCallback(async (id: string) => {
    if (files.length <= 1) return;
    await db.files.delete(id);
    const remaining = files.filter((file) => file.id !== id);
    setFiles(remaining);
    if (activeId === id) setActiveId(remaining[0]?.id || null);
  }, [activeId, files]);

  const Explorer = ({ mobile = false }: { mobile?: boolean }) => (
    <aside className="flex h-full min-h-0 flex-col border-r border-[#21262d] bg-[#0d1117]">
      <div className="flex h-11 items-center justify-between border-b border-[#21262d] px-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8b949e]">Explorer</span>
        <div className="flex gap-1">
          <button type="button" onClick={createFile} className="grid h-8 w-8 place-items-center rounded-md text-[#8b949e] hover:bg-[#161b22] hover:text-white" aria-label="New file">
            <FilePlus2 size={16} />
          </button>
          {mobile && (
            <button type="button" onClick={() => setExplorerOpen(false)} className="grid h-8 w-8 place-items-center rounded-md text-[#8b949e] hover:bg-[#161b22] hover:text-white" aria-label="Close explorer">
              <X size={17} />
            </button>
          )}
        </div>
      </div>

      <div className="px-3 pb-2 pt-3 text-xs font-semibold text-[#8b949e]">PROJECT</div>
      <div className="ide-scrollbar min-h-0 flex-1 overflow-y-auto px-1.5">
        {files.map((file) => {
          const active = file.id === activeFile?.id;
          return (
            <div key={file.id} className={'group mb-0.5 flex items-center rounded-md ' + (active ? 'bg-[#1f6feb24] text-white' : 'text-[#b1bac4] hover:bg-[#161b22]')}>
              <button type="button" onClick={() => { setActiveId(file.id); setExplorerOpen(false); }} className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left text-[13px]">
                <FileCode2 size={15} className={active ? 'text-[#58a6ff]' : 'text-[#7d8590]'} />
                <span className="truncate">{file.name}</span>
              </button>
              {files.length > 1 && (
                <button type="button" onClick={() => deleteFile(file.id)} className="mr-1 grid h-8 w-8 place-items-center rounded text-[#6e7681] hover:bg-[#30363d] hover:text-[#f85149]" aria-label={'Delete ' + file.name}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-[#21262d] p-3 text-[11px] leading-5 text-[#6e7681]">
        Files, Inspector overrides, and program inputs are saved locally with IndexedDB.
      </div>
    </aside>
  );

  const renderInspector = ({ mobile = false }: { mobile?: boolean }) => (
    <aside className="flex h-full min-h-0 flex-col border-l border-[#21262d] bg-[#0d1117]">
      <div className="flex h-11 items-center justify-between border-b border-[#21262d] px-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={15} className="text-[#8b949e]" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8b949e]">Inspector</span>
        </div>
        {mobile && (
          <button type="button" onClick={() => setInspectorOpen(false)} className="grid h-8 w-8 place-items-center rounded-md text-[#8b949e] hover:bg-[#161b22] hover:text-white" aria-label="Close inspector">
            <X size={17} />
          </button>
        )}
      </div>

      <div className="ide-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
        {exportAnalysis.error ? (
          <div className="rounded-lg border border-[#f851493d] bg-[#f8514914] p-3 text-xs leading-5 text-[#ff7b72]">
            Fix the language error before Inspector fields can be generated.<br />
            <span className="text-[#8b949e]">{exportAnalysis.error}</span>
          </div>
        ) : exportAnalysis.fields.length === 0 ? (
          <div className="rounded-lg border border-[#21262d] bg-[#161b22] p-3 text-xs leading-5 text-[#8b949e]">
            Nothing exported yet. Add something like <span className="font-mono text-[#c9d1d9]">export integer: score = 0.</span>
          </div>
        ) : (
          <div className="space-y-4">
            {exportAnalysis.fields.map((field) => {
              const overrides = activeFile?.exportOverrides || {};
              const hasOverride = Object.prototype.hasOwnProperty.call(overrides, field.name);
              const current = hasOverride ? overrides[field.name] : field.defaultValue;

              return (
                <div key={field.name} className="rounded-lg border border-[#21262d] bg-[#0b0f14] p-3">
                  <ValueControl
                    field={field}
                    value={current}
                    onChange={(value) => updateOverride('exportOverrides', field.name, value)}
                    onReset={hasOverride ? () => updateOverride('exportOverrides', field.name, undefined) : undefined}
                    hint={field.typeName + ' · ' + (hasOverride ? 'Inspector override' : 'Code default')}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0b0f14] text-[#c9d1d9]">
      <header className="safe-top shrink-0 border-b border-[#21262d] bg-[#0b0f14]">
        <div className="flex h-[52px] items-center gap-2 px-2 sm:px-3">
          <button type="button" onClick={() => setExplorerOpen(true)} className="grid h-10 w-10 place-items-center rounded-lg text-[#8b949e] hover:bg-[#161b22] md:hidden" aria-label="Open files">
            <Files size={19} />
          </button>

          <div className="hidden h-9 w-9 place-items-center rounded-lg bg-[#1f6feb] text-white md:grid">
            <Code2 size={19} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-[#f0f6fc]">{activeFile?.name || 'Language Lab'}</div>
            <div className="flex items-center gap-1.5 text-[11px] text-[#6e7681]">
              <Save size={11} />
              {saved ? 'Saved locally' : 'Saving…'}
            </div>
          </div>

          <button type="button" onClick={() => setInspectorOpen(true)} className="grid h-10 w-10 place-items-center rounded-lg border border-[#30363d] text-[#b1bac4] hover:bg-[#161b22] lg:hidden" aria-label="Open inspector">
            <SlidersHorizontal size={17} />
          </button>

          <button type="button" onClick={run} className="flex h-10 items-center gap-2 rounded-lg bg-[#238636] px-3.5 text-sm font-semibold text-white hover:bg-[#2ea043]">
            <Play size={16} fill="currentColor" /> Run
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="hidden w-60 shrink-0 md:block"><Explorer /></div>

        <main className="flex min-w-0 flex-1 flex-col bg-[#0d1117]">
          <div className="flex h-10 shrink-0 items-end border-b border-[#21262d] bg-[#0b0f14]">
            <div className="flex h-10 min-w-0 items-center gap-2 border-r border-[#21262d] border-t-2 border-t-[#58a6ff] bg-[#0d1117] px-3 text-xs">
              <Code2 size={14} className="text-[#58a6ff]" />
              <span className="truncate">{activeFile?.name || 'Loading…'}</span>
              {!saved && <span className="h-2 w-2 rounded-full bg-[#8b949e]" />}
            </div>
          </div>

          <div className="min-h-0 flex-1">
            {activeFile ? (
              <Editor key={activeFile.id} value={activeFile.content} onChange={updateCode} onRun={run} />
            ) : (
              <div className="grid h-full place-items-center text-sm text-[#6e7681]">Opening workspace…</div>
            )}
          </div>

          <section className={'flex min-h-0 flex-col border-t border-[#21262d] bg-[#0b0f14] ' + (consoleOpen ? (program.snapshot?.inputs.length || program.snapshot?.buttons.length ? 'h-[48%] min-h-[180px]' : 'h-[30%] min-h-[150px]') : 'h-11')}>
            <div className="flex h-11 shrink-0 items-center justify-between px-3">
              <button type="button" onClick={() => setConsoleOpen((value) => !value)} className="flex h-9 items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#8b949e]">
                <TerminalSquare size={15} /> Output
              </button>
              <div className="flex items-center gap-1">
              {!!Object.keys(activeFile?.inputOverrides ?? {}).length && <button type="button" onClick={resetInputs} className="grid h-11 w-11 place-items-center rounded-md text-[#8b949e] hover:bg-[#161b22] hover:text-white" aria-label="Reset saved inputs and restart" title="Reset saved inputs and restart"><RotateCcw size={14} /></button>}
              <button type="button" onClick={program.clearOutput} className="grid h-11 w-11 place-items-center rounded-md text-[#8b949e] hover:bg-[#161b22] hover:text-white" aria-label="Clear output">
                <Trash2 size={14} />
              </button>
              </div>
            </div>

            {consoleOpen && (
              <div className="ide-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden border-t border-[#161b22] px-4 py-3">
                <ProgramOutput key={activeFile?.id + ':' + program.generation} snapshot={program.snapshot} stale={program.stale} error={error} onInput={updateInput} onButton={program.pressButton} />
              </div>
            )}
          </section>
        </main>

        <div className="hidden w-72 shrink-0 lg:block">{renderInspector({})}</div>
      </div>

      {storageError && <div role="alert" className="flex items-center justify-between gap-2 bg-[#3d1c1c] px-3 py-2 text-xs text-[#ffb4ae]">
        <span>{storageError}</span>
        <button type="button" className="min-h-11 px-2 underline" onClick={() => setStorageError(null)}>Dismiss</button>
      </div>}
      <footer className="safe-bottom flex min-h-6 shrink-0 items-center justify-between gap-3 bg-[#0d419d] px-2.5 py-1 text-[10px] text-white sm:text-[11px]">
        <span>{error ? 'Language error' : 'Ready'}</span>
        <span className="truncate">{activeFile?.name || ''} · TypeScript runtime</span>
      </footer>

      {explorerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button type="button" className="absolute inset-0 bg-black/60" onClick={() => setExplorerOpen(false)} aria-label="Close explorer" />
          <div className="absolute inset-y-0 left-0 w-[82%] max-w-[320px] shadow-2xl"><Explorer mobile /></div>
        </div>
      )}

      {inspectorOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" className="absolute inset-0 bg-black/60" onClick={() => setInspectorOpen(false)} aria-label="Close inspector" />
          <div className="absolute inset-y-0 right-0 w-[86%] max-w-[360px] shadow-2xl">{renderInspector({ mobile: true })}</div>
        </div>
      )}
    </div>
  );
}
