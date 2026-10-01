import type { WorkspaceView } from '../hooks/useWorkspace';
import type { ProgramField } from '../language/program';
import { FieldGroups } from '../components/FieldGroups';
import { ValueControl } from '../components/ValueControl';
export function Inspector({
  view,
  fields,
  error,
}: {
  view: WorkspaceView;
  fields: ProgramField[];
  error: string | null;
}) {
  return (
    <>
      <p className="lab-description">
        Configure exported values across your project. Changes apply the next
        time you Run. App inputs stay separate.
      </p>
      {error ? (
        <p role="alert" className="lab-error">
          Fix the language error to show Inspector controls. {error}
        </p>
      ) : !fields.length ? (
        <div className="lab-empty">
          <h3>No exported values yet</h3>
          <p>Add a declaration to configure your program here.</p>
          <code>export integer: health = 100.</code>
        </div>
      ) : (
        <FieldGroups fields={fields}>
          {(field) => {
            const overrides =
              view.projectFiles.find((f) => f.id === field.fileId)
                ?.exportOverrides ?? {};
            const custom = Object.hasOwn(overrides, field.name);
            return (
              <div key={field.fileId + field.name} className="lab-field">
                <ValueControl
                  field={field}
                  value={custom ? overrides[field.name] : field.defaultValue}
                  onChange={(value) =>
                    view.updateOverride(
                      field.fileId!,
                      'exportOverrides',
                      field.name,
                      value,
                    )
                  }
                  onReset={
                    custom
                      ? () =>
                          view.updateOverride(
                            field.fileId!,
                            'exportOverrides',
                            field.name,
                            undefined,
                          )
                      : undefined
                  }
                  hint={
                    field.typeName +
                    ' · ' +
                    (custom
                      ? 'Inspector override'
                      : field.computedDefault
                        ? 'Computed on Run'
                        : 'Code default') +
                    ' · ' +
                    field.path
                  }
                />
              </div>
            );
          }}
        </FieldGroups>
      )}
    </>
  );
}
