import { FieldGroups } from './FieldGroups';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProgramSnapshot } from '../language/program';
import { labelFor } from '../language/program';
import type { ExportValue, Value } from '../language/ast';
import { ValueControl } from './ValueControl';

interface Props {
  snapshot: ProgramSnapshot | null;
  stale: boolean;
  disabled?: boolean;
  error: string | null;
  onInput: (name: string, value: ExportValue) => void;
  onButton: (id: string) => void;
  onEvent: (name: string, args: Value[]) => void;
}

export function ProgramOutput({
  snapshot,
  stale,
  disabled,
  error,
  onInput,
  onButton,
  onEvent,
}: Props) {
  const [invalid, setInvalid] = useState<Set<string>>(new Set());
  const log = useRef<HTMLDivElement>(null);
  const validityChanged = useCallback((name: string, valid: boolean) => {
    setInvalid((current) => {
      if (current.has(name) === !valid) return current;
      const next = new Set(current);
      if (valid) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);
  const interactive = !!(snapshot?.inputs.length || snapshot?.buttons.length);
  const scene = snapshot?.scene;
  const sceneText = scene?.items.filter(
    (item) => item.kind === 'heading' || item.kind === 'paragraph',
  );
  const sceneStats = scene?.items.filter(
    (item) => item.kind === 'stat' || item.kind === 'progress',
  );

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [snapshot?.output.length, scene?.name]);

  return (
    <div className="space-y-5">
      {scene && (
        <section className="overflow-hidden rounded-2xl border border-[#30363d] bg-gradient-to-b from-[#161b22] to-[#0d1117] shadow-lg">
          <div className="border-b border-[#30363d] px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#58a6ff]">
              Active scene
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-[#f0f6fc]">
              {labelFor(scene.name)}
            </h2>
          </div>
          {!!sceneText?.length && (
            <div className="space-y-2 px-5 py-4">
              {sceneText.map((item, index) =>
                item.kind === 'heading' ? (
                  <h3 key={index} className="text-xl font-semibold text-[#f0f6fc]">
                    {item.text}
                  </h3>
                ) : (
                  <p key={index} className="max-w-3xl text-sm leading-6 text-[#b1bac4]">
                    {item.text}
                  </p>
                ),
              )}
            </div>
          )}
          {!!sceneStats?.length && (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,170px),1fr))] gap-3 border-t border-[#21262d] p-4">
              {sceneStats.map((item, index) =>
                item.kind === 'stat' ? (
                  <div key={index} className="rounded-xl border border-[#30363d] bg-[#0b0f14] p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-[#8b949e]">
                      {item.label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-[#f0f6fc]">
                      {item.value}
                    </p>
                  </div>
                ) : (
                  <div key={index} className="rounded-xl border border-[#30363d] bg-[#0b0f14] p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-[#8b949e]">
                        {item.label}
                      </p>
                      <p className="text-sm font-semibold text-[#f0f6fc]">
                        {item.value} / {item.maximum}
                      </p>
                    </div>
                    <div
                      className="mt-3 h-2 overflow-hidden rounded-full bg-[#21262d]"
                      role="progressbar"
                      aria-label={item.label}
                      aria-valuemin={0}
                      aria-valuemax={Math.max(0, item.maximum)}
                      aria-valuenow={Math.max(0, Math.min(item.maximum, item.value))}
                    >
                      <div
                        className="h-full rounded-full bg-[#2f81f7] transition-[width]"
                        style={{
                          width:
                            (item.maximum > 0
                              ? Math.max(0, Math.min(1, item.value / item.maximum)) * 100
                              : 0) + '%',
                        }}
                      />
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </section>
      )}

      {!!snapshot?.events.some((event) => event !== 'update') && (
        <div
          tabIndex={stale || disabled ? -1 : 0}
          role="group"
          aria-label="Program event surface"
          onKeyDown={(event) => {
            if (event.target === event.currentTarget && !event.repeat && !stale && !disabled)
              onEvent('keyDown', [event.key]);
          }}
          onKeyUp={(event) => {
            if (event.target === event.currentTarget && !stale && !disabled)
              onEvent('keyUp', [event.key]);
          }}
          onPointerDown={(event) => {
            if (!stale && !disabled) {
              event.currentTarget.focus();
              const rect = event.currentTarget.getBoundingClientRect();
              onEvent('pointerDown', [
                event.clientX - rect.left,
                event.clientY - rect.top,
              ]);
            }
          }}
          className="min-h-20 rounded-xl border border-[#30363d] bg-[#0d1117] p-4 text-sm text-[#8b949e] focus:outline focus:outline-2 focus:outline-[#58a6ff]"
        >
          Tap here for pointer events. Focus here for keyboard events.
        </div>
      )}

      {stale && (
        <p role="status" className="rounded-lg border border-[#9e6a03] bg-[#2b1d00] px-4 py-3 text-sm text-[#e3b341]">
          Source or Inspector values changed. Press Run to restart the program.
        </p>
      )}

      {!!snapshot?.inputs.length && (
        <fieldset disabled={stale || disabled} className="min-w-0">
          <legend className="sr-only">Program inputs</legend>
          <FieldGroups fields={snapshot.inputs} layout="grid" surface>
            {(field) => (
              <ValueControl
                key={field.name}
                field={field}
                value={snapshot.inputValues[field.name]}
                onChange={(value) => onInput(field.name, value)}
                onValidityChange={validityChanged}
                disabled={stale || disabled}
              />
            )}
          </FieldGroups>
        </fieldset>
      )}

      {!!snapshot?.buttons.length && (
        <section className="rounded-xl border border-[#30363d] bg-[#0d1117]/70 p-4">
          <h3 className="mb-3 text-sm font-semibold text-[#f0f6fc]">Actions</h3>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Program actions">
            {snapshot.buttons.map((button) => (
              <button
                key={button.id}
                type="button"
                disabled={stale || disabled || invalid.size > 0}
                onClick={() => onButton(button.id)}
                className="min-h-11 max-w-full rounded-lg border border-[#3d444d] bg-[#21262d] px-4 py-2 text-sm font-semibold text-[#f0f6fc] shadow-sm [overflow-wrap:anywhere] hover:border-[#58a6ff] hover:bg-[#30363d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#58a6ff] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {button.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {invalid.size > 0 && (
        <p className="text-xs text-[#ff7b72]">
          Fix the highlighted inputs before using a button.
        </p>
      )}
      {error && (
        <div role="alert" className="rounded-xl border border-[#f85149]/40 bg-[#2d1117] p-4 whitespace-pre-wrap break-words font-mono text-[13px] text-[#ff7b72]">
          {error}
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-[#30363d] bg-[#080c10]">
        <div className="flex items-center justify-between border-b border-[#21262d] px-4 py-3">
          <h3 className="text-sm font-semibold text-[#f0f6fc]">
            {scene ? 'Activity' : 'Output'}
          </h3>
          {scene && <span className="text-xs text-[#6e7681]">{labelFor(scene.name)}</span>}
        </div>
        <div
          ref={log}
          role="log"
          aria-label="Printed output"
          aria-live="polite"
          className="max-h-80 min-h-24 min-w-0 overflow-y-auto whitespace-pre-wrap p-4 font-mono text-[13px] leading-6 text-[#c9d1d9] [overflow-wrap:anywhere]"
        >
          {snapshot?.output.length ? (
            snapshot.output.map((line, index) => <div key={index}>{line || ' '}</div>)
          ) : (
            <p className="font-sans text-sm text-[#8b949e]">
              {snapshot
                ? interactive
                  ? 'Ready for interaction.'
                  : 'Program finished with no output.'
                : 'Run your program to see output here.'}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
