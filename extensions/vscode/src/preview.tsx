import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { deserializeProject } from '../../../src/build/standalone/model';
import { useProgramSession } from '../../../src/hooks/useProgramSession';
import { useProjectAnalysis } from '../../../src/hooks/useProjectAnalysis';
import { ProgramOutput } from '../../../src/components/ProgramOutput';
import { ValueControl } from '../../../src/components/ValueControl';
import { FieldGroups } from '../../../src/components/FieldGroups';
import type { ExportValue } from '../../../src/language/ast';
import '../../../src/index.css';
declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
const api = acquireVsCodeApi();
const vscode = {
  postMessage: (message: Record<string, unknown>) =>
    api.postMessage({ ...message, session: document.body.dataset.session }),
};
const initial = deserializeProject(
  document.getElementById('app-project')!.textContent!,
);
function Preview() {
  const [project, setProject] = useState(initial);
  const [stale, setStale] = useState(false);
  const session = useProgramSession(project);
  const analysis = useProjectAnalysis(project);
  useEffect(() => {
    session.run();
    const message = ({ data }: MessageEvent) => {
      if (data.type === 'stale') {
        session.stop();
        setStale(true);
      }
      if (data.type === 'stop') session.stop();
    };
    window.addEventListener('message', message);
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', message);
  }, []);
  function configure(fileId: string, name: string, value?: ExportValue) {
    setProject((p) => ({
      ...p,
      files: p.files.map((f) => {
        if (f.id !== fileId) return f;
        const exportOverrides = Object.assign(
          Object.create(null),
          f.exportOverrides,
        );
        if (value === undefined) delete exportOverrides[name];
        else exportOverrides[name] = value;
        return { ...f, exportOverrides };
      }),
    }));
    vscode.postMessage({ type: 'configure', fileId, name, value });
  }
  return (
    <main className="h-full overflow-y-auto p-4 text-[#c9d1d9]">
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="break-words text-lg font-semibold">
            {project.project.name}
          </h1>
          <div className="flex gap-2">
            <button
              className="min-h-11 rounded border border-[#30363d] px-4"
              onClick={() => vscode.postMessage({ type: 'run' })}
            >
              Run latest source
            </button>
            <button
              className="min-h-11 rounded border border-[#30363d] px-4"
              onClick={session.stop}
            >
              Stop
            </button>
          </div>
        </header>
        {!!analysis.fields.length && (
          <details open>
            <summary className="min-h-11 cursor-pointer py-2">
              Inspector configuration
            </summary>
            <FieldGroups fields={analysis.fields} layout="grid">
              {(field) => {
                const overrides =
                  project.files.find((f) => f.id === field.fileId)
                    ?.exportOverrides ?? {};
                const has = Object.hasOwn(overrides, field.name);
                return (
                  <ValueControl
                    key={field.fileId + field.name}
                    field={field}
                    value={has ? overrides[field.name] : field.defaultValue}
                    hint={
                      field.computedDefault
                        ? 'Computed on Run; editing sets an override.'
                        : undefined
                    }
                    onChange={(v) => configure(field.fileId!, field.name, v)}
                    onReset={
                      has
                        ? () => configure(field.fileId!, field.name)
                        : undefined
                    }
                  />
                );
              }}
            </FieldGroups>
            <button
              className="min-h-11 rounded border border-[#30363d] px-4"
              disabled={stale}
              onClick={() => session.run()}
            >
              Apply configuration / Restart
            </button>
          </details>
        )}
        <section
          aria-label="Application"
          className="rounded border border-[#30363d] p-4"
        >
          <ProgramOutput
            key={session.generation}
            snapshot={session.snapshot}
            stale={stale || session.stale}
            disabled={stale || !session.usable}
            error={session.error}
            onInput={(name, value) => {
              void session.setInput(name, value);
            }}
            onButton={session.pressButton}
            onEvent={session.sendEvent}
          />
        </section>
      </div>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Preview />);
