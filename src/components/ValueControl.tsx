import { useEffect, useId, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { isLanguageValue, labelFor, type ProgramField } from '../language/program';
import type { ExportValue } from '../language/ast';

interface Props {
  field: ProgramField;
  value: ExportValue;
  onChange: (value: ExportValue) => void;
  onReset?: () => void;
  onValidityChange?: (name: string, valid: boolean) => void;
  disabled?: boolean;
  hint?: string;
}

const controlClass = 'min-h-11 w-full min-w-0 rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-2 text-base text-[#f0f6fc] outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff] disabled:opacity-50';

/** Keep incomplete edits locally; only valid values reach persistence or the runtime. */
export function ValueControl({ field, value, onChange, onReset, onValidityChange, disabled, hint }: Props) {
  const id = useId();
  const serialized = field.control === 'array' ? JSON.stringify(value) : String(value);
  const [draft, setDraft] = useState(serialized);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setDraft(serialized); setError(null); }, [serialized]);
  useEffect(() => { onValidityChange?.(field.name, !error); }, [error, field.name, onValidityChange]);

  function commit(text: string) {
    setDraft(text);
    try {
      let next: ExportValue = text;
      if (field.control === 'number') {
        if (!text.trim() || !Number.isInteger(Number(text)) || !Number.isFinite(Number(text))) throw new Error('Enter a whole number.');
        next = Number(text);
      }
      if (field.control === 'array') {
        let parsed: unknown;
        try { parsed = JSON.parse(text); } catch { throw new Error('Enter a valid JSON array, such as ["one", "two"].'); }
        if (!Array.isArray(parsed) || !isLanguageValue(parsed)) throw new Error('Use an array of numbers, text, booleans, null, or arrays.');
        next = parsed;
      }
      onChange(next);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update this value.');
    }
  }

  const describedBy = error ? id + '-error' : hint ? id + '-hint' : undefined;
  return (
    <div className="min-w-0">
      <div className="mb-2 flex min-h-6 items-center justify-between gap-2">
        <label htmlFor={id} className="break-words text-sm font-medium text-[#f0f6fc] [overflow-wrap:anywhere]">{labelFor(field.name)}</label>
        {onReset && <button type="button" onClick={() => { onReset(); setError(null); }} disabled={disabled} className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-[#8b949e] hover:bg-[#161b22] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#58a6ff] disabled:opacity-50" aria-label={'Reset ' + labelFor(field.name) + ' to default'}><RotateCcw size={14} /></button>}
      </div>
      {field.control === 'boolean' ? (
        <div className="flex min-h-11 items-center gap-3 rounded-md border border-[#30363d] bg-[#0d1117] px-3">
          <input id={id} type="checkbox" checked={value === true} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="h-6 w-6 accent-[#238636]" aria-describedby={describedBy} />
          <label htmlFor={id} className="flex min-h-11 flex-1 items-center text-sm">{value === true ? 'True' : 'False'}</label>
        </div>
      ) : field.control === 'enum' ? (
        <select id={id} value={String(value)} disabled={disabled} onChange={(event) => commit(event.target.value)} className={controlClass} aria-describedby={describedBy}>
          {field.options?.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : field.control === 'array' ? (
        <textarea id={id} value={draft} disabled={disabled} onChange={(event) => commit(event.target.value)} rows={3} spellCheck={false} className={controlClass + ' resize-y font-mono'} aria-invalid={!!error} aria-describedby={describedBy} />
      ) : (
        <input id={id} type={field.control === 'number' ? 'number' : 'text'} inputMode={field.control === 'number' ? 'numeric' : 'text'} step={field.control === 'number' ? 1 : undefined} value={draft} disabled={disabled} onChange={(event) => commit(event.target.value)} className={controlClass} aria-invalid={!!error} aria-describedby={describedBy} />
      )}
      {error ? <p id={id + '-error'} role="alert" className="mt-2 break-words text-xs text-[#ff7b72]">{error}</p> : hint ? <p id={id + '-hint'} className="mt-2 text-xs text-[#8b949e]">{hint}</p> : null}
    </div>
  );
}
