import { useCallback, useState } from 'react';
import type { ProgramSnapshot } from '../language/program';
import type { ExportValue } from '../language/ast';
import { ValueControl } from './ValueControl';

interface Props {
  snapshot: ProgramSnapshot | null;
  stale: boolean;
  error: string | null;
  onInput: (name: string, value: ExportValue) => void;
  onButton: (id: string) => void;
}

export function ProgramOutput({ snapshot, stale, error, onInput, onButton }: Props) {
  const [invalid, setInvalid] = useState<Set<string>>(new Set());
  const validityChanged = useCallback((name: string, valid: boolean) => {
    setInvalid((current) => {
      if (current.has(name) === !valid) return current;
      const next = new Set(current);
      if (valid) next.delete(name); else next.add(name);
      return next;
    });
  }, []);
  const interactive = !!(snapshot?.inputs.length || snapshot?.buttons.length);

  return (
    <div className="space-y-4">
      {stale && <p role="status" className="text-sm text-[#e3b341]">Source or Inspector values changed. Press Run to restart the program.</p>}
      {!!snapshot?.inputs.length && (
        <fieldset disabled={stale} className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,160px),1fr))] gap-4">
          <legend className="sr-only">Program inputs</legend>
          {snapshot.inputs.map((field) => <ValueControl key={field.name} field={field} value={snapshot.inputValues[field.name]} onChange={(value) => onInput(field.name, value)} onValidityChange={validityChanged} disabled={stale} />)}
        </fieldset>
      )}
      {!!snapshot?.buttons.length && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Program actions">
          {snapshot.buttons.map((button) => <button key={button.id} type="button" disabled={stale || invalid.size > 0} onClick={() => onButton(button.id)} className="min-h-11 max-w-full rounded-md border border-[#30363d] bg-[#21262d] px-4 py-2 text-sm font-semibold text-[#f0f6fc] [overflow-wrap:anywhere] hover:bg-[#30363d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#58a6ff] disabled:cursor-not-allowed disabled:opacity-50">{button.label}</button>)}
        </div>
      )}
      {invalid.size > 0 && <p className="text-xs text-[#ff7b72]">Fix the highlighted inputs before using a button.</p>}
      {error && <div role="alert" className="whitespace-pre-wrap break-words font-mono text-[13px] text-[#ff7b72]">{error}</div>}
      <div role="log" aria-label="Printed output" aria-live="polite" className={'min-w-0 whitespace-pre-wrap font-mono text-[13px] leading-6 [overflow-wrap:anywhere] ' + (interactive ? 'border-t border-[#21262d] pt-3' : '')}>
        {snapshot?.output.length ? snapshot.output.map((line, index) => <div key={index}>{line || ' '}</div>) : (
          <p className="text-[#8b949e]">{snapshot ? interactive ? 'Ready for interaction.' : 'Program finished with no output.' : 'Run your program to see output here.'}</p>
        )}
      </div>
    </div>
  );
}
