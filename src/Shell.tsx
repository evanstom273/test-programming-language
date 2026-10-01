import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { receiveCliLaunch, receiveFileLaunch } from './runner/launch';
const IDE = lazy(() => import('./App'));
const Runner = lazy(() => import('./runner/Runner'));

export default function Shell() {
  const [runner, setRunner] = useState(
    () => new URLSearchParams(location.search).get('runner') === '1',
  );
  const [incoming, setIncoming] = useState<{
    id: number;
    files: Promise<File[]>;
  } | null>(null);
  const serial = useRef(0);
  function navigate(run: boolean, projectId?: string) {
    const url = new URL(location.href);
    url.searchParams.delete('launch');
    if (run) url.searchParams.set('runner', '1');
    else url.searchParams.delete('runner');
    if (projectId) url.searchParams.set('project', projectId);
    history.pushState(null, '', url);
    setRunner(run);
  }
  useEffect(() => {
    const receive = (files: Promise<File[]>) => {
      // Attach a rejection handler immediately while the lazy host loads.
      void files.catch(() => {});
      setIncoming({ id: ++serial.current, files });
      navigate(true);
    };
    const dispose = receiveFileLaunch(receive);
    const token = new URLSearchParams(location.search).get('launch');
    if (token) receive(receiveCliLaunch(token));
    const drag = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
    };
    const drop = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
      receive(Promise.resolve(Array.from(event.dataTransfer.files)));
    };
    const back = () => {
      setRunner(new URLSearchParams(location.search).get('runner') === '1');
      setIncoming(null);
    };
    window.addEventListener('dragover', drag);
    window.addEventListener('drop', drop);
    window.addEventListener('popstate', back);
    return () => {
      dispose();
      window.removeEventListener('dragover', drag);
      window.removeEventListener('drop', drop);
      window.removeEventListener('popstate', back);
    };
  }, []);
  return (
    <Suspense fallback={<p className="p-6">Opening Language Lab…</p>}>
      {runner ? (
        <Runner
          key={incoming?.id ?? 'picker'}
          incoming={incoming?.files}
          onIDE={(id) => {
            setIncoming(null);
            navigate(false, id);
          }}
        />
      ) : (
        <IDE
          onOpenRunner={() => {
            setIncoming(null);
            navigate(true);
          }}
        />
      )}
    </Suspense>
  );
}
