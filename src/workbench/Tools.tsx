import { useEffect, useMemo, useState } from 'react';
import { FileCode2, Search, ArrowRight, CheckCircle2 } from 'lucide-react';
import type { WorkspaceView } from '../hooks/useWorkspace';
import type { Diagnostic } from '../language/diagnostics';
import type { Preferences } from './preferences';
export interface Command {
  id: string;
  label: string;
  detail?: string;
  action: () => void;
}
export function Commands({ commands }: { commands: Command[] }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const results = commands
    .filter((c) =>
      (c.label + ' ' + (c.detail ?? ''))
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .slice(0, 40);
  const active = Math.min(selected, Math.max(0, results.length - 1));
  useEffect(() => {
    document
      .getElementById('lab-command-' + active)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  return (
    <>
      <label className="lab-search">
        <Search size={18} />
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-autocomplete="list"
          aria-controls="lab-command-results"
          aria-activedescendant={
            results.length ? 'lab-command-' + active : undefined
          }
          aria-label="Search commands and files"
          placeholder="Find a file or action…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              results[active]?.action();
            }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              setSelected(
                Math.max(
                  0,
                  Math.min(
                    results.length - 1,
                    active + (e.key === 'ArrowDown' ? 1 : -1),
                  ),
                ),
              );
            }
          }}
        />
      </label>
      <div
        className="lab-results"
        role="listbox"
        id="lab-command-results"
        aria-label="Commands and files"
      >
        {results.map((c, index) => (
          <button
            role="option"
            aria-selected={index === active}
            id={'lab-command-' + index}
            tabIndex={-1}
            key={c.id}
            onClick={c.action}
          >
            <span>
              <strong>{c.label}</strong>
              {c.detail && <small>{c.detail}</small>}
            </span>
            <ArrowRight size={16} />
          </button>
        ))}
        {!results.length && (
          <p className="lab-description">No matching files or actions.</p>
        )}
      </div>
    </>
  );
}
export function ProjectSearch({
  view,
  open,
}: {
  view: WorkspaceView;
  open: (id: string, offset: number) => void;
}) {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => {
    const hits: {
      id: string;
      path: string;
      line: number;
      offset: number;
      text: string;
    }[] = [];
    if (!query.trim()) return hits;
    for (const f of view.projectFiles) {
      if (f.kind !== 'file' || f.bytes) continue;
      let offset = 0;
      for (const [index, line] of f.content.split('\n').entries()) {
        const at = line.toLowerCase().indexOf(query.toLowerCase());
        if (at >= 0)
          hits.push({
            id: f.id,
            path: f.path,
            line: index + 1,
            offset: offset + at,
            text: line.trim(),
          });
        offset += line.length + 1;
        if (hits.length >= 100) return hits;
      }
    }
    return hits;
  }, [query, view.projectFiles]);
  return (
    <>
      <label className="lab-search">
        <Search size={18} />
        <input
          autoFocus
          aria-label="Search project"
          placeholder="Search text in this project…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <p className="lab-description">
        {query
          ? `${matches.length}${matches.length === 100 ? '+' : ''} matching lines`
          : 'Find text across source files. Search is case-insensitive.'}
      </p>
      <div className="lab-results">
        {matches.map((m) => (
          <button
            key={m.id + ':' + m.line}
            onClick={() => open(m.id, m.offset)}
          >
            <FileCode2 size={18} />
            <span>
              <strong>
                {m.path}:{m.line}
              </strong>
              <small className="lab-code-result">{m.text}</small>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
export function Problems({
  diagnostics,
  view,
  open,
}: {
  diagnostics: Diagnostic[];
  view: WorkspaceView;
  open: (id: string, offset: number) => void;
}) {
  return diagnostics.length ? (
    <div className="lab-results">
      {diagnostics.map((d, i) => (
        <button
          key={i}
          onClick={() => open(d.span.fileId, d.span.start.offset)}
        >
          <span>
            <strong>{d.message}</strong>
            <small>
              {view.projectFiles.find((f) => f.id === d.span.fileId)?.path ??
                'Project'}{' '}
              · line {d.span.start.line}, column {d.span.start.column}
            </small>
          </span>
          <ArrowRight size={16} />
        </button>
      ))}
    </div>
  ) : (
    <div className="lab-empty">
      <CheckCircle2 size={32} />
      <h3>No problems found</h3>
      <p>
        Syntax and project diagnostics appear here as you type. Runtime errors
        appear in App.
      </p>
    </div>
  );
}
export function Settings({
  prefs,
  update,
}: {
  prefs: Preferences;
  update: (p: Partial<Preferences>) => void;
}) {
  return (
    <div className="lab-settings">
      <p className="lab-description">
        Editor preferences are saved on this device, separately from your
        programs.
      </p>
      <label>
        Code size
        <select
          aria-label="Code size"
          value={prefs.fontSize}
          onChange={(e) => update({ fontSize: Number(e.target.value) })}
        >
          {[14, 16, 18, 20].map((n) => (
            <option key={n} value={n}>
              {n} px
            </option>
          ))}
        </select>
      </label>
      <label>
        Wrap long lines
        <input
          type="checkbox"
          checked={prefs.wrap}
          onChange={(e) => update({ wrap: e.target.checked })}
        />
      </label>
      <label>
        Touch editing toolbar
        <input
          type="checkbox"
          checked={prefs.keys}
          onChange={(e) => update({ keys: e.target.checked })}
        />
      </label>
      <div className="lab-shortcuts">
        <h3>Keyboard shortcuts</h3>
        <p>
          <kbd>Ctrl / ⌘ + Enter</kbd> Run project
        </p>
        <p>
          <kbd>Ctrl / ⌘ + K</kbd> Commands and files
        </p>
        <p>
          <kbd>Ctrl / ⌘ + F</kbd> Find in current file
        </p>
        <p>
          <kbd>Esc</kbd> Close a panel
        </p>
      </div>
    </div>
  );
}
