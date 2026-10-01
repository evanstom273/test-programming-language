import type { ReactNode } from 'react';
import type { ProgramField } from '../language/program';
/** Group metadata is presentation-only. It never changes declaration/execution order. */
export function FieldGroups({
  fields,
  layout = 'stack',
  children,
}: {
  fields: ProgramField[];
  layout?: 'stack' | 'grid';
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
      ? 'grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,160px),1fr))] gap-4'
      : 'min-w-0 space-y-4';
  return (
    <div className="min-w-0 space-y-4">
      {[...groups].map(([key, group]) => (
        <fieldset key={key} className="min-w-0">
          {group.label && (
            <legend className="mb-3 break-words text-sm font-semibold text-[#8b949e]">
              {group.label}
            </legend>
          )}
          <div className={className}>{group.fields.map(children)}</div>
        </fieldset>
      ))}
    </div>
  );
}
