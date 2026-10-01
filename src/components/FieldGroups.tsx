import type { ReactNode } from 'react';
import type { ProgramField } from '../language/program';

/** Group metadata is presentation-only. It never changes declaration/execution order. */
export function FieldGroups({
  fields,
  layout = 'stack',
  surface = false,
  children,
}: {
  fields: ProgramField[];
  layout?: 'stack' | 'grid';
  surface?: boolean;
  children: (field: ProgramField) => ReactNode;
}) {
  const groups = new Map<string, { label?: string; fields: ProgramField[] }>();
  for (const field of fields) {
    const key = (field.fileId ?? '') + ':' + (field.hints?.group ?? '');
    if (!groups.has(key))
      groups.set(key, { label: field.hints?.group, fields: [] });
    groups.get(key)!.fields.push(field);
  }
  const className =
    layout === 'grid'
      ? 'grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] gap-4'
      : 'min-w-0 space-y-4';
  return (
    <div className="min-w-0 space-y-4">
      {[...groups].map(([key, group]) => (
        <fieldset
          key={key}
          className={
            'min-w-0 ' +
            (surface
              ? 'rounded-xl border border-[#30363d] bg-[#0d1117]/70 p-4 shadow-sm'
              : '')
          }
        >
          {group.label && (
            <legend
              className={
                'break-words text-sm font-semibold ' +
                (surface
                  ? 'mb-3 px-1 text-[#f0f6fc]'
                  : 'mb-3 text-[#8b949e]')
              }
            >
              {group.label}
            </legend>
          )}
          <div className={className}>{group.fields.map(children)}</div>
        </fieldset>
      ))}
    </div>
  );
}
