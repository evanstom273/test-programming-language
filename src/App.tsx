import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  Code2,
  Files,
  Play,
  Square,
  SlidersHorizontal,
  TerminalSquare,
  Trash2,
  RotateCcw,
  Search,
  Download,
  Settings2,
  PanelLeftClose,
  Columns2,
  X,
  Command as CommandIcon,
  CircleAlert,
} from 'lucide-react';
import { useWorkspace } from './hooks/useWorkspace';
import { useProjectAnalysis } from './hooks/useProjectAnalysis';
import { useProgramSession } from './hooks/useProgramSession';
import { ProjectExplorer } from './components/ProjectExplorer';
import { ProgramOutput } from './components/ProgramOutput';
import { Editor, type EditorHandle } from './Editor';
import type { ExportValue } from './language/runtime';
import { Dialog } from './workbench/Dialog';
import { Inspector } from './workbench/Inspector';
import {
  Commands,
  Problems,
  ProjectSearch,
  Settings,
  type Command,
} from './workbench/Tools';
import { TouchKeys } from './workbench/TouchKeys';
import {
  usePreferences,
  useViewport,
  type Layout,
} from './workbench/preferences';
import { ExportPanel } from './workbench/ExportPanel';

type Panel =
  | 'Explorer'
  | 'Inspector'
  | 'Search project'
  | 'Commands'
  | 'Problems'
  | 'Settings'
  | 'Export project';
export default function App({ onOpenRunner }: { onOpenRunner: () => void }) {
  const view = useWorkspace();
  const { activeFile, saved } = view;
  const program = useProgramSession(view.snapshot);
  const analysis = useProjectAnalysis(view.snapshot);
  const [prefs, updatePrefs] = usePreferences();
  const viewport = useViewport();
  const wide = viewport.width >= 700;
  const layout: Layout =
    prefs.layout === 'split' && !wide ? 'code' : prefs.layout;
  const [panel, setPanel] = useState<Panel | null>(null);
  const [sidebar, setSidebar] = useState(true);
  const [tabs, setTabs] = useState<string[]>([]);
  const editor = useRef<EditorHandle>(null);
  const workarea = useRef<HTMLDivElement>(null);
  const pendingLocation = useRef<{ id: string; offset: number } | null>(null);
  const visibleTabs = tabs.filter((id) =>
    view.projectFiles.some((f) => f.id === id && f.kind === 'file'),
  );
  if (activeFile?.kind === 'file' && !visibleTabs.includes(activeFile.id))
    visibleTabs.push(activeFile.id);

  useEffect(() => {
    if (activeFile?.kind === 'file')
      setTabs((ids) =>
        ids.includes(activeFile.id) ? ids : [...ids, activeFile.id],
      );
  }, [activeFile?.id]);
  useEffect(() => {
    const target = pendingLocation.current;
    if (target && target.id === activeFile?.id) {
      editor.current?.reveal(target.offset);
      pendingLocation.current = null;
    }
  }, [activeFile?.id, panel]);
  const chooseLayout = (next: Layout) => updatePrefs({ layout: next });
  function run() {
    if (view.busy || program.pendingInputs > 0) return;
    program.run();
    if (layout !== 'split') chooseLayout('app');
  }
  function openFile(id: string, offset?: number) {
    if (offset !== undefined) pendingLocation.current = { id, offset };
    view.setActiveId(id);
    setPanel(null);
    if (layout === 'app') chooseLayout('code');
    if (id === activeFile?.id && offset !== undefined) {
      requestAnimationFrame(() => editor.current?.reveal(offset));
      pendingLocation.current = null;
    }
  }
  const explorerView = {
    ...view,
    setActiveId: ((next) => {
      const id =
        typeof next === 'function' ? next(activeFile?.id ?? null) : next;
      view.setActiveId(id);
      if (layout === 'app') chooseLayout('code');
    }) as typeof view.setActiveId,
  };
  function closeTab(id: string) {
    if (visibleTabs.length < 2) return;
    const remaining = visibleTabs.filter((t) => t !== id);
    setTabs((ids) => ids.filter((t) => t !== id));
    if (id === activeFile?.id) view.setActiveId(remaining.at(-1)!);
  }
  const updateInput = (name: string, value: ExportValue) => {
    const field = program.snapshot?.inputs.find((f) => f.name === name);
    if (!field?.fileId) return;
    void program.setInput(name, value).then((valid) => {
      if (valid)
        void view.updateOverride(
          field.fileId!,
          'inputOverrides',
          field.variableName ?? field.name,
          value,
        );
    });
  };
  const commands: Command[] = [
    {
      id: 'run',
      label: 'Run project',
      detail: 'Ctrl / ⌘ + Enter',
      action: () => {
        setPanel(null);
        run();
      },
    },
    {
      id: 'stop',
      label: 'Stop program',
      action: () => {
        program.stop();
        setPanel(null);
      },
    },
    ...(
      [
        'Explorer',
        'Inspector',
        'Search project',
        'Problems',
        'Settings',
        'Export project',
      ] as Panel[]
    ).map((p) => ({ id: p, label: p, action: () => setPanel(p) })),
    ...view.projectFiles
      .filter((f) => f.kind === 'file')
      .map((f) => ({
        id: f.id,
        label: f.path,
        detail: 'Open file',
        action: () => openFile(f.id),
      })),
  ];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPanel('Commands');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const status = program.stale
    ? 'Run to apply changes'
    : program.error
      ? 'Runtime error'
      : program.status === 'running'
        ? 'Running…'
        : program.status === 'stopped'
          ? 'Stopped'
          : program.snapshot
            ? 'Active'
            : 'Ready';
  function resizeSplit(clientX: number) {
    const rect = workarea.current?.getBoundingClientRect();
    if (!rect) return;
    updatePrefs({
      split: Math.max(
        35,
        Math.min(65, (100 * (clientX - rect.left)) / rect.width),
      ),
    });
  }
  return (
    <div className="lab-shell" style={{ height: viewport.height }}>
      <header className="lab-header safe-top">
        <div className="lab-brand">
          <Code2 size={21} />
          <span>Language Lab</span>
        </div>
        <div className="lab-project-title">
          <strong>{view.project?.name ?? 'Loading workspace…'}</strong>
          <small>
            <span className={saved ? 'lab-saved-dot' : 'lab-saving-dot'} />
            {saved ? 'Saved locally' : 'Saving…'}
          </small>
        </div>
        <button
          className="lab-icon lab-desktop-tool"
          aria-label="Open commands"
          title="Commands (Ctrl / ⌘ + K)"
          onClick={() => setPanel('Commands')}
        >
          <CommandIcon size={19} />
        </button>
        <button
          className="lab-icon"
          aria-label="Open settings"
          title="Editor settings"
          onClick={() => setPanel('Settings')}
        >
          <Settings2 size={19} />
        </button>
        <button
          className="lab-run"
          onClick={run}
          disabled={!view.project || view.busy || program.pendingInputs > 0}
        >
          <Play size={16} fill="currentColor" />
          Run
        </button>
        <button
          className="lab-icon lab-stop"
          aria-label="Stop"
          title="Stop program"
          disabled={program.status === 'idle' || program.status === 'stopped'}
          onClick={program.stop}
        >
          <Square size={16} />
        </button>
      </header>
      <nav className="lab-toolbar" aria-label="Workspace tools">
        <button
          className="lab-tool lab-files-toggle"
          aria-label="Open files"
          onClick={() => setPanel('Explorer')}
        >
          <Files size={17} />
          <span>Files</span>
        </button>
        <button
          className="lab-icon lab-sidebar-toggle"
          aria-label={sidebar ? 'Hide file sidebar' : 'Show file sidebar'}
          onClick={() => setSidebar(!sidebar)}
        >
          <PanelLeftClose size={17} />
        </button>
        <div className="lab-view-switch" aria-label="Workspace view">
          <button
            aria-pressed={layout === 'code'}
            onClick={() => chooseLayout('code')}
          >
            <Code2 size={16} />
            Code
          </button>
          <button
            aria-pressed={layout === 'app'}
            onClick={() => chooseLayout('app')}
          >
            <TerminalSquare size={16} />
            App
          </button>
          <button
            aria-pressed={layout === 'split'}
            disabled={!wide}
            title={
              wide
                ? 'Code and app together'
                : 'Side by side needs a wider screen. Unfold or rotate your phone.'
            }
            onClick={() => chooseLayout('split')}
          >
            <Columns2 size={16} />
            <span>Side by side</span>
          </button>
        </div>
        <div className="lab-toolbar-spacer" />
        <button
          className="lab-tool lab-desktop-tool"
          aria-label="Open project search"
          onClick={() => setPanel('Search project')}
        >
          <Search size={17} />
          <span>Search</span>
        </button>
        <button
          className="lab-tool lab-desktop-tool"
          aria-label="Open inspector"
          onClick={() => setPanel('Inspector')}
        >
          <SlidersHorizontal size={17} />
          <span>Inspector</span>
        </button>
        <button
          className="lab-tool lab-desktop-tool"
          aria-label="Open export"
          onClick={() => setPanel('Export project')}
        >
          <Download size={17} />
          <span>Export</span>
        </button>
      </nav>
      <div className="lab-workspace">
        {sidebar && (
          <div className="lab-sidebar">
            <ProjectExplorer onOpenRunner={onOpenRunner} view={explorerView} />
          </div>
        )}
        <main
          ref={workarea}
          className={'lab-workarea lab-layout-' + layout}
          style={{ '--code-share': prefs.split + '%' } as CSSProperties}
        >
          <section
            className="lab-code-pane"
            aria-label="Code editor"
            hidden={layout === 'app'}
          >
            <div className="lab-tabs" role="tablist" aria-label="Open files">
              {visibleTabs.map((id) => {
                const f = view.projectFiles.find((f) => f.id === id)!;
                return (
                  <div
                    className={
                      'lab-tab' +
                      (id === activeFile?.id ? ' lab-tab-active' : '')
                    }
                    key={id}
                  >
                    <button
                      role="tab"
                      tabIndex={id === activeFile?.id ? 0 : -1}
                      onKeyDown={(e) => {
                        const index = visibleTabs.indexOf(id);
                        const next =
                          e.key === 'ArrowRight'
                            ? (index + 1) % visibleTabs.length
                            : e.key === 'ArrowLeft'
                              ? (index - 1 + visibleTabs.length) %
                                visibleTabs.length
                              : e.key === 'Home'
                                ? 0
                                : e.key === 'End'
                                  ? visibleTabs.length - 1
                                  : -1;
                        if (next >= 0) {
                          e.preventDefault();
                          openFile(visibleTabs[next]);
                          requestAnimationFrame(() =>
                            (
                              document.querySelector(
                                '.lab-tabs [aria-selected="true"]',
                              ) as HTMLElement
                            )?.focus(),
                          );
                        }
                      }}
                      aria-selected={id === activeFile?.id}
                      title={f.path}
                      onClick={() => openFile(id)}
                    >
                      <Code2 size={14} />
                      {f.name}
                    </button>
                    {visibleTabs.length > 1 && (
                      <button
                        aria-label={'Close tab ' + f.path}
                        onClick={() => closeTab(id)}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="lab-breadcrumb" title={activeFile?.path}>
              {activeFile?.path ?? 'Select a file'}
            </div>
            <div className="lab-editor">
              {activeFile?.kind === 'file' && !activeFile.bytes ? (
                <Editor
                  ref={editor}
                  documentId={activeFile.id}
                  value={activeFile.content}
                  onChange={view.updateCode}
                  onRun={run}
                  fontSize={prefs.fontSize}
                  wrap={prefs.wrap}
                  diagnostics={analysis.diagnostics.filter(
                    (d) => d.span.fileId === activeFile.id,
                  )}
                />
              ) : (
                <div className="lab-empty">
                  <Files size={30} />
                  <h3>
                    {activeFile?.bytes
                      ? 'Binary asset'
                      : 'Choose a source file'}
                  </h3>
                  <p>
                    {activeFile?.bytes
                      ? 'Download or manage this asset in Files.'
                      : 'Open Files to choose or create a program.'}
                  </p>
                  <button
                    className="lab-button"
                    onClick={() => setPanel('Explorer')}
                  >
                    Browse files
                  </button>
                </div>
              )}
            </div>
            {prefs.keys && activeFile?.kind === 'file' && !activeFile.bytes && (
              <TouchKeys editor={editor} />
            )}
          </section>
          {layout === 'split' && (
            <div
              className="lab-resizer"
              role="separator"
              aria-label="Resize code and app"
              aria-orientation="vertical"
              aria-valuemin={35}
              aria-valuemax={65}
              aria-valuenow={Math.round(prefs.split)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                  e.preventDefault();
                  updatePrefs({
                    split: Math.max(
                      35,
                      Math.min(
                        65,
                        prefs.split + (e.key === 'ArrowLeft' ? -2 : 2),
                      ),
                    ),
                  });
                }
              }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                resizeSplit(e.clientX);
              }}
              onPointerMove={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId))
                  resizeSplit(e.clientX);
              }}
              onPointerUp={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId))
                  e.currentTarget.releasePointerCapture(e.pointerId);
              }}
            />
          )}
          <section
            className="lab-app-pane"
            aria-label="Running app"
            hidden={layout === 'code'}
          >
            <div className="lab-pane-header">
              <span>
                <TerminalSquare size={16} />
                App <small>{status}</small>
              </span>
              <div>
                {view.projectFiles.some(
                  (f) => Object.keys(f.inputOverrides ?? {}).length > 0,
                ) && (
                  <button
                    className="lab-icon"
                    aria-label="Reset saved inputs and restart"
                    onClick={() => {
                      void view.resetInputs().then((s) => {
                        if (s) program.run(s);
                      });
                    }}
                  >
                    <RotateCcw size={16} />
                  </button>
                )}
                <button
                  className="lab-icon"
                  aria-label="Clear output"
                  onClick={program.clearOutput}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            <div className="lab-output ide-scrollbar">
              {!program.snapshot && !program.error ? (
                <div className="lab-empty">
                  <Play size={32} />
                  <h2>Your app lives here</h2>
                  <p>
                    Run your project to see its controls, scenes and output.
                  </p>
                  <button
                    className="lab-button"
                    disabled={!view.project || view.busy}
                    onClick={run}
                  >
                    Run project
                  </button>
                  <small>Ctrl / ⌘ + Enter</small>
                </div>
              ) : (
                <ProgramOutput
                  key={view.project?.id + ':' + program.generation}
                  snapshot={program.snapshot}
                  stale={program.stale}
                  disabled={!program.usable}
                  error={program.error}
                  onInput={updateInput}
                  onButton={program.pressButton}
                  onEvent={program.sendEvent}
                />
              )}
            </div>
          </section>
        </main>
      </div>
      {view.storageError && !panel && (
        <div role="alert" className="lab-storage-error">
          <span>{view.storageError}</span>
          <button onClick={() => view.setStorageError(null)}>Dismiss</button>
        </div>
      )}
      <footer className="lab-status">
        <button aria-label="Open problems" onClick={() => setPanel('Problems')}>
          <CircleAlert size={14} />
          {analysis.diagnostics.length
            ? `${analysis.diagnostics.length} problem${analysis.diagnostics.length === 1 ? '' : 's'}`
            : 'No problems'}
        </button>
        <span>{status}</span>
        <button
          className="lab-status-commands"
          onClick={() => setPanel('Commands')}
        >
          Commands <kbd>⌘ / Ctrl K</kbd>
        </button>
      </footer>
      <nav className="lab-mobile-dock safe-bottom" aria-label="Mobile tools">
        <button
          aria-label="Open project search"
          onClick={() => setPanel('Search project')}
        >
          <Search size={20} />
          Search
        </button>
        <button
          aria-label="Open inspector"
          onClick={() => setPanel('Inspector')}
        >
          <SlidersHorizontal size={20} />
          Inspector
        </button>
        <button aria-label="Open commands" onClick={() => setPanel('Commands')}>
          <CommandIcon size={20} />
          Commands
        </button>
        <button
          aria-label="Open export"
          onClick={() => setPanel('Export project')}
        >
          <Download size={20} />
          Export
        </button>
      </nav>
      {panel && (
        <Dialog
          title={panel}
          close={() => setPanel(null)}
          wide={panel === 'Search project' || panel === 'Export project'}
        >
          {view.storageError && (
            <p role="alert" className="lab-error">
              {view.storageError}
            </p>
          )}
          {panel === 'Explorer' && (
            <ProjectExplorer
              onOpenRunner={onOpenRunner}
              view={explorerView}
              close={() => setPanel(null)}
            />
          )}
          {panel === 'Inspector' && (
            <Inspector
              view={view}
              fields={analysis.fields}
              error={analysis.error}
            />
          )}
          {panel === 'Commands' && <Commands commands={commands} />}
          {panel === 'Search project' && (
            <ProjectSearch view={view} open={openFile} />
          )}
          {panel === 'Problems' && (
            <Problems
              view={view}
              diagnostics={analysis.diagnostics}
              open={openFile}
            />
          )}
          {panel === 'Settings' && (
            <Settings prefs={prefs} update={updatePrefs} />
          )}
          {panel === 'Export project' && (
            <ExportPanel snapshot={view.snapshot} />
          )}
        </Dialog>
      )}
    </div>
  );
}
