import { useEffect, useRef, useState } from 'react';
import type { ProjectSnapshot } from '../workspace/model';
import type { ExportValue } from '../language/ast';
import { useProgramSession } from '../hooks/useProgramSession';
import { useProjectAnalysis } from '../hooks/useProjectAnalysis';
import { ProgramOutput } from '../components/ProgramOutput';
import { ValueControl } from '../components/ValueControl';
import { FieldGroups } from '../components/FieldGroups';
import { LANG_ACCEPT, openSourceFile } from './sourceFile';

const buttonClass =
  'min-h-11 rounded-md border border-[#30363d] bg-[#21262d] px-3 py-2 text-sm text-[#f0f6fc] hover:bg-[#30363d] disabled:opacity-40';
export default function Runner({
  incoming,
  onIDE,
}: {
  incoming?: Promise<File[]>;
  onIDE: (projectId?: string) => void;
}) {
  const [project, setProject] = useState<ProjectSnapshot | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [exporting, setExporting] = useState(false);
  const serial = useRef(0);
  const picker = useRef<HTMLInputElement>(null);
  const program = useProgramSession(project);
  const analysis = useProjectAnalysis(project);
  async function open(files: Promise<File[]>) {
    const token = ++serial.current;
    program.stop();
    setProject(null);
    setFileError(null);
    setSaved(false);
    setLoading(true);
    try {
      const selected = await files;
      if (selected.length !== 1)
        throw new Error(
          'Open one .lang file at a time. Use the IDE for project ZIPs.',
        );
      const snapshot = await openSourceFile(selected[0]);
      if (token !== serial.current) return;
      setProject(snapshot);
      program.run(snapshot);
    } catch (error) {
      if (token === serial.current)
        setFileError(error instanceof Error ? error.message : String(error));
    } finally {
      if (token === serial.current) setLoading(false);
    }
  }
  useEffect(() => {
    if (incoming) void open(incoming);
    return () => {
      serial.current++;
    };
  }, [incoming]);
  function override(
    fileId: string,
    kind: 'exportOverrides' | 'inputOverrides',
    name: string,
    value?: ExportValue,
  ) {
    setProject((current) =>
      current
        ? {
            ...current,
            files: current.files.map((file) => {
              if (file.id !== fileId) return file;
              const overrides = { ...file[kind] };
              if (value === undefined) delete overrides[name];
              else overrides[name] = value;
              return { ...file, [kind]: overrides };
            }),
          }
        : null,
    );
  }
  function input(name: string, value: ExportValue) {
    const field = program.snapshot?.inputs.find((f) => f.name === name);
    if (!field?.fileId) return;
    void program.setInput(name, value).then((valid) => {
      if (valid)
        override(
          field.fileId!,
          'inputOverrides',
          field.variableName ?? field.name,
          value,
        );
    });
  }
  async function save() {
    if (!project || saving || saved || program.pendingInputs) return;
    const snapshot = structuredClone(project);
    const token = serial.current;
    setSaving(true);
    setFileError(null);
    try {
      const { workspace } = await import('../workspace/store');
      await workspace.importSnapshot(snapshot);
      if (token === serial.current) setSaved(true);
    } catch (error) {
      if (token === serial.current)
        setFileError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }
  return (
    <main className="safe-top safe-bottom h-full overflow-y-auto overflow-x-hidden bg-[#0b0f14] p-4 text-[#c9d1d9] sm:p-6">
      <div className="mx-auto max-w-4xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-[#f0f6fc]">
              Language Lab Runner
            </h1>
            <p className="break-words text-sm text-[#8b949e]">
              {project?.project.entry ?? 'Run a .lang file from your device'}
            </p>
          </div>
          <button
            className={buttonClass}
            disabled={saving}
            onClick={() => onIDE(saved ? project?.project.id : undefined)}
          >
            {saved ? 'Open saved project in IDE' : 'Back to IDE'}
          </button>
        </header>
        <div className="flex flex-wrap gap-2">
          <input
            ref={picker}
            type="file"
            accept={LANG_ACCEPT}
            className="sr-only"
            aria-label="Open .lang file"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = '';
              if (files.length) void open(Promise.resolve(files));
            }}
          />
          <button
            className={buttonClass}
            onClick={() => {
              if (picker.current) {
                picker.current.accept = LANG_ACCEPT;
                picker.current.click();
              }
            }}
            disabled={saving}
          >
            Open / Run .lang File
          </button>
          <button
            className={buttonClass}
            disabled={saving}
            onClick={() => {
              if (picker.current) {
                picker.current.accept = '';
                picker.current.click();
              }
            }}
          >
            Browse all files
          </button>
          {project && (
            <>
              <button
                className={buttonClass + ' !bg-[#238636]'}
                disabled={program.pendingInputs > 0 || saving}
                onClick={() => program.run()}
              >
                Run
              </button>
              <button
                className={buttonClass}
                disabled={
                  program.status === 'idle' || program.status === 'stopped'
                }
                onClick={program.stop}
              >
                Stop
              </button>
              <button
                className={buttonClass}
                disabled={!program.usable}
                onClick={program.clearOutput}
              >
                Clear output
              </button>
              <button
                className={buttonClass}
                disabled={exporting || saving}
                onClick={() => {
                  const snapshot = structuredClone(project);
                  const token = serial.current;
                  setExporting(true);
                  setFileError(null);
                  void import('../build/standalone/download')
                    .then(({ downloadStandalone }) =>
                      downloadStandalone(snapshot),
                    )
                    .catch((error) => {
                      if (token === serial.current)
                        setFileError(
                          error instanceof Error
                            ? error.message
                            : String(error),
                        );
                    })
                    .finally(() => setExporting(false));
                }}
              >
                {exporting ? 'Preparing HTML…' : 'Download standalone HTML'}
              </button>
              <button
                className={buttonClass}
                disabled={saving || saved || program.pendingInputs > 0}
                onClick={() => void save()}
              >
                {saving
                  ? 'Saving…'
                  : saved
                    ? 'Project copy saved'
                    : 'Save as project'}
              </button>
            </>
          )}
        </div>
        <p className="text-sm text-[#8b949e]">
          {loading
            ? 'Opening file…'
            : saved
              ? 'A project copy was saved. Further runner changes stay temporary.'
              : 'Files run temporarily. Nothing is added to your project library until you choose Save as project.'}{' '}
          {!project && 'Choose a file above or drop one here.'}
        </p>
        {!!analysis.fields.length && project && (
          <details className="rounded-lg border border-[#30363d] p-3">
            <summary className="min-h-11 cursor-pointer py-2 font-medium text-[#f0f6fc]">
              Program settings (exports)
            </summary>
            <p className="mb-3 text-xs text-[#8b949e]">
              Uses code defaults. Changes are temporary configuration overrides;
              press Run to apply.
            </p>
            <FieldGroups fields={analysis.fields} layout="grid">
              {(field) => {
                const overrides =
                  project.files.find((f) => f.id === field.fileId)
                    ?.exportOverrides ?? {};
                const hasOverride = Object.hasOwn(overrides, field.name);
                return (
                  <ValueControl
                    key={field.fileId + ':' + field.name}
                    field={field}
                    value={
                      hasOverride ? overrides[field.name] : field.defaultValue
                    }
                    hint={
                      field.computedDefault && !hasOverride
                        ? 'Computed on Run; editing sets an override.'
                        : undefined
                    }
                    onChange={(value) =>
                      override(
                        field.fileId!,
                        'exportOverrides',
                        field.name,
                        value,
                      )
                    }
                    onReset={
                      hasOverride
                        ? () =>
                            override(
                              field.fileId!,
                              'exportOverrides',
                              field.name,
                            )
                        : undefined
                    }
                  />
                );
              }}
            </FieldGroups>
          </details>
        )}
        <section
          aria-label="Running application"
          className="min-w-0 rounded-lg border border-[#30363d] p-4"
        >
          <ProgramOutput
            key={(project?.project.id ?? '') + ':' + program.generation}
            snapshot={program.snapshot}
            stale={program.stale}
            disabled={!program.usable || saving}
            error={
              fileError ?? (project ? (program.error ?? analysis.error) : null)
            }
            onInput={input}
            onButton={program.pressButton}
            onEvent={program.sendEvent}
          />
        </section>
        {project && (
          <details className="min-w-0">
            <summary className="min-h-11 cursor-pointer py-2 text-sm">
              View source
            </summary>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-[#0d1117] p-3 text-xs">
              {project.files[0].content}
            </pre>
          </details>
        )}
        <p className="text-xs text-[#8b949e]">
          A single-file run includes only that file. Imports and external assets
          need a project containing those files. Open project ZIPs in the IDE.
        </p>
      </div>
    </main>
  );
}
