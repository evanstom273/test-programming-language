import { useEffect } from 'react';
import type { ProjectSnapshot } from '../../workspace/model';
import { useProgramSession } from '../../hooks/useProgramSession';
import { ProgramOutput } from '../../components/ProgramOutput';

const action =
  'min-h-11 rounded-md border border-[#30363d] bg-[#21262d] px-4 py-2 text-sm text-[#f0f6fc] hover:bg-[#30363d] disabled:opacity-50';

/** Application-only host. No IDE navigation, source picker, database or setup. */
export function StandaloneApp({ project }: { project: ProjectSnapshot }) {
  const session = useProgramSession(project);
  useEffect(() => {
    session.run();
  }, []);
  return (
    <main className="h-full overflow-y-auto overflow-x-hidden bg-[#0b0f14] p-4 text-[#c9d1d9] sm:p-6">
      <div className="mx-auto max-w-4xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="min-w-0 break-words text-xl font-semibold text-[#f0f6fc]">
            {project.project.name}
          </h1>
          <div className="flex flex-wrap gap-2">
            <button className={action} onClick={() => session.run()}>
              Restart
            </button>
            <button
              className={action}
              disabled={
                session.status === 'idle' || session.status === 'stopped'
              }
              onClick={session.stop}
            >
              Stop
            </button>
          </div>
        </header>
        <section
          aria-label="Application"
          className="min-w-0 rounded-lg border border-[#30363d] p-4"
        >
          <ProgramOutput
            key={session.generation}
            snapshot={session.snapshot}
            stale={false}
            disabled={!session.usable}
            error={
              session.error?.replaceAll('Press Run', 'Press Restart') ?? null
            }
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
