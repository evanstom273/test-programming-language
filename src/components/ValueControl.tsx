import { isObject } from '../language/types';
import { useEffect, useId, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import {
  isLanguageValue,
  labelFor,
  type ProgramField,
} from '../language/program';
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

const controlClass =
  'min-h-11 w-full min-w-0 rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-2 text-base text-[#f0f6fc] outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff] disabled:opacity-50';

/** Keep incomplete edits locally; only valid values reach persistence or the runtime. */
export function ValueControl({
  field,
  value,
  onChange,
  onReset,
  onValidityChange,
  disabled,
  hint,
}: Props) {
  const id = useId();
  const json = field.control === 'array' || field.control === 'object';
  const displayLabel =
    field.label ?? labelFor(field.variableName ?? field.name);
  const description = [field.hints?.help, hint].filter(Boolean).join(' · ');
  const resourcePath =
    field.typeName === 'resource' && isObject(value)
      ? (Object.entries(field.assetIds ?? {}).find(
          ([, id]) => id === value.id,
        )?.[0] ?? String(value.path))
      : String(value);
  const serialized =
    field.typeName === 'resource'
      ? resourcePath
      : json
        ? JSON.stringify(value)
        : String(value);
  const [draft, setDraft] = useState(serialized);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(serialized);
    setError(null);
  }, [serialized]);
  useEffect(() => {
    onValidityChange?.(field.name, !error);
  }, [error, field.name, onValidityChange]);

  function commit(text: string) {
    setDraft(text);
    try {
      let next: ExportValue = text;
      if (field.control === 'number') {
        if (
          !text.trim() ||
          (field.typeName === 'integer' && !Number.isInteger(Number(text))) ||
          !Number.isFinite(Number(text))
        )
          throw new Error(
            field.typeName === 'integer'
              ? 'Enter a whole number.'
              : 'Enter a finite number.',
          );
        next = Number(text);
      }
      if (json) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error('Enter valid JSON.');
        }
        if (
          !isLanguageValue(parsed) ||
          parsed === null ||
          (field.control === 'array'
            ? !Array.isArray(parsed)
            : typeof parsed !== 'object' || Array.isArray(parsed))
        )
          throw new Error(
            'Use a valid JSON ' +
              (field.control === 'array' ? 'array' : 'object') +
              '.',
          );
        next = parsed;
      }
      if (
        field.hints?.color &&
        (typeof next !== 'string' || !/^#[\da-f]{6}([\da-f]{2})?$/i.test(next))
      )
        throw new Error('Enter a hex colour, such as #58a6ff.');
      if (field.typeName === 'resource') {
        const assetId = field.assetIds?.[text];
        if (!assetId) throw new Error('Choose an existing project resource.');
        next = { $type: 'resource', id: assetId, path: text };
      }
      onChange(next);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to update this value.',
      );
    }
  }

  const describedBy = error
    ? id + '-error'
    : description
      ? id + '-hint'
      : undefined;
  return (
    <div className="min-w-0">
      <div className="mb-2 flex min-h-6 items-center justify-between gap-2">
        <label
          htmlFor={id}
          className="break-words text-sm font-medium text-[#f0f6fc] [overflow-wrap:anywhere]"
        >
          {displayLabel}
        </label>
        {onReset && (
          <button
            type="button"
            onClick={() => {
              onReset();
              setError(null);
            }}
            disabled={disabled}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-[#8b949e] hover:bg-[#161b22] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#58a6ff] disabled:opacity-50"
            aria-label={'Reset ' + displayLabel + ' to default'}
          >
            <RotateCcw size={14} />
          </button>
        )}
      </div>
      {field.control === 'boolean' ? (
        <div className="flex min-h-11 items-center gap-3 rounded-md border border-[#30363d] bg-[#0d1117] px-3">
          <input
            id={id}
            type="checkbox"
            checked={value === true}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked)}
            className="h-6 w-6 accent-[#238636]"
            aria-describedby={describedBy}
          />
          <label
            htmlFor={id}
            className="flex min-h-11 flex-1 items-center text-sm"
          >
            {value === true ? 'True' : 'False'}
          </label>
        </div>
      ) : field.control === 'enum' ? (
        <select
          id={id}
          value={String(value)}
          disabled={disabled}
          onChange={(event) => commit(event.target.value)}
          className={controlClass}
          aria-describedby={describedBy}
        >
          {field.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : field.hints?.file !== undefined ? (
        <select
          id={id}
          value={resourcePath}
          disabled={disabled}
          onChange={(event) => commit(event.target.value)}
          className={controlClass}
          aria-describedby={describedBy}
        >
          {!field.assets?.includes(resourcePath) && (
            <option value={resourcePath}>
              {resourcePath || 'Choose a project file'}
            </option>
          )}
          {field.assets?.map((path) => (
            <option key={path} value={path}>
              {path}
            </option>
          ))}
        </select>
      ) : json || field.hints?.multiline ? (
        <textarea
          id={id}
          value={draft}
          disabled={disabled}
          onChange={(event) => commit(event.target.value)}
          rows={3}
          placeholder={field.hints?.placeholder}
          spellCheck={!json}
          className={controlClass + ' resize-y font-mono'}
          aria-invalid={!!error}
          aria-describedby={describedBy}
        />
      ) : (
        <input
          id={id}
          type={field.control === 'number' ? 'number' : 'text'}
          inputMode={
            field.control === 'number'
              ? field.typeName === 'float'
                ? 'decimal'
                : 'numeric'
              : 'text'
          }
          step={
            field.control === 'number'
              ? (field.hints?.range?.step ??
                (field.typeName === 'float' ? 'any' : 1))
              : undefined
          }
          placeholder={field.hints?.placeholder}
          value={draft}
          disabled={disabled}
          onChange={(event) => commit(event.target.value)}
          className={controlClass}
          aria-invalid={!!error}
          aria-describedby={describedBy}
        />
      )}
      {field.hints?.range && (
        <input
          type="range"
          aria-label={displayLabel + ' slider'}
          min={field.hints.range.minimum}
          max={field.hints.range.maximum}
          step={field.hints.range.step}
          value={Math.max(
            field.hints.range.minimum,
            Math.min(field.hints.range.maximum, Number(value)),
          )}
          disabled={disabled}
          onChange={(event) => commit(event.target.value)}
          className="mt-2 min-h-11 w-full accent-[#58a6ff]"
        />
      )}
      {field.hints?.color && (
        <input
          type="color"
          aria-label={displayLabel + ' colour picker'}
          value={String(value).slice(0, 7)}
          disabled={disabled}
          onChange={(event) =>
            commit(
              event.target.value +
                (String(value).length === 9 ? String(value).slice(7) : ''),
            )
          }
          className="mt-2 min-h-11 w-full rounded border border-[#30363d] bg-[#0d1117]"
        />
      )}
      {error ? (
        <p
          id={id + '-error'}
          role="alert"
          className="mt-2 break-words text-xs text-[#ff7b72]"
        >
          {error}
        </p>
      ) : description ? (
        <p id={id + '-hint'} className="mt-2 text-xs text-[#8b949e]">
          {description}
        </p>
      ) : null}
    </div>
  );
}
