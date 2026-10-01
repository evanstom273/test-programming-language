import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Code2, FileCode2, FilePlus2, Files, Play, Save, TerminalSquare, Trash2, X } from 'lucide-react';
import { Editor } from './Editor';
import { db, ensureStarterFile, type CodeFile } from './db';
import { LanguageError } from './language/lexer';
import { runSource } from './language/runtime';

export default function App() {
  const [files, setFiles] = useState<CodeFile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [output, setOutput] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(true);
  const [saved, setSaved] = useState(true);
  const saveTimer = useRef<number | null>(null);

  const activeFile = useMemo(
    () => files.find((file) => file.id === activeId) || files[0] || null,
    [files, activeId]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const starter = await ensureStarterFile();
      const stored = await db.files.orderBy('createdAt').toArray();
      if (cancelled) return;
      setFiles(stored);
      setActiveId(starter.id);
    })();

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

  const run = useCallback(() => {
    if (!activeFile) return;
    setError(null);
    setConsoleOpen(true);

    try {
      const result = runSource(activeFile.content);
      setOutput(result.output.length ? result.output : ['Program finished with no output.']);
    } catch (caught) {
      if (caught instanceof LanguageError) {
        setError('Line ' + caught.line + ', column ' + caught.column + '\n' + caught.message);
      } else {
        setError(caught instanceof Error ? caught.message : 'Unknown runtime error.');
      }
    }
  }, [activeFile]);

  const createFile = useCallback(async () => {
    const now = Date.now();
    const file: CodeFile = {
      id: crypto.randomUUID(),
      name: 'file' + (files.length + 1) + '.lang',
      content: 'print("Hello from a new file.").',
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
        Files are saved locally with IndexedDB.
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

          <section className={'flex min-h-0 flex-col border-t border-[#21262d] bg-[#0b0f14] ' + (consoleOpen ? 'h-[30%] min-h-[150px]' : 'h-10')}>
            <div className="flex h-10 shrink-0 items-center justify-between px-3">
              <button type="button" onClick={() => setConsoleOpen((value) => !value)} className="flex h-9 items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#8b949e]">
                <TerminalSquare size={15} /> Output
              </button>
              <button type="button" onClick={() => { setOutput([]); setError(null); }} className="grid h-8 w-8 place-items-center rounded-md text-[#6e7681] hover:bg-[#161b22] hover:text-white" aria-label="Clear output">
                <Trash2 size={14} />
              </button>
            </div>

            {consoleOpen && (
              <div className="ide-scrollbar min-h-0 flex-1 overflow-auto border-t border-[#161b22] px-4 py-3 font-mono text-[13px] leading-6">
                {error ? (
                  <div className="whitespace-pre-wrap text-[#ff7b72]">{error}</div>
                ) : output.length ? (
                  output.map((line, index) => <div key={String(index) + line} className="whitespace-pre-wrap">{line || ' '}</div>)
                ) : (
                  <div className="text-[#6e7681]">Run your program to see output here.</div>
                )}
              </div>
            )}
          </section>
        </main>
      </div>

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
    </div>
  );
}
