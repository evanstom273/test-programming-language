import { useState } from 'react';
import {
  Globe,
  FolderArchive,
  Monitor,
  Smartphone,
  Download,
} from 'lucide-react';
import type { ProjectSnapshot } from '../workspace/model';
import { errorMessage } from '../hooks/useProgramSession';

type Target = 'html' | 'source' | 'windows' | 'android';
const targets = [
  {
    id: 'html' as const,
    title: 'Standalone HTML',
    icon: Globe,
    description:
      'Your complete running app in one file. Open it in a browser, without the IDE.',
    action: 'Download HTML',
  },
  {
    id: 'source' as const,
    title: 'Project ZIP',
    icon: FolderArchive,
    description:
      'Source files, assets and project metadata. Keep a backup or import it on another device.',
    action: 'Download project ZIP',
  },
  {
    id: 'windows' as const,
    title: 'Windows EXE',
    icon: Monitor,
    description:
      'Download a Tauri build kit. Compile on Windows or use the included GitHub Actions workflow to get an unsigned EXE.',
    action: 'Download Windows build kit',
  },
  {
    id: 'android' as const,
    title: 'Android APK',
    icon: Smartphone,
    description:
      'Download a Tauri build kit. The included GitHub Actions workflow produces an ARM64 debug APK for testing on your phone.',
    action: 'Download Android build kit',
  },
];
export function ExportPanel({
  snapshot,
}: {
  snapshot: ProjectSnapshot | null;
}) {
  const [busy, setBusy] = useState<Target | null>(null),
    [error, setError] = useState<string | null>(null),
    [done, setDone] = useState<Target | null>(null);
  async function build(target: Target) {
    if (!snapshot || busy) return;
    const project = structuredClone(snapshot);
    setBusy(target);
    setError(null);
    setDone(null);
    try {
      const { downloadBlob, downloadStandalone, standaloneHTML } = await import(
        '../build/standalone/download'
      );
      if (target === 'html') await downloadStandalone(project);
      else {
        const bytes =
          target === 'source'
            ? (await import('../workspace/archive')).exportProject(project)
            : (await import('../build/native/kit')).nativeBuildKit(
                project,
                await standaloneHTML(project),
                target,
              );
        const name =
          project.project.name
            .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
            .slice(0, 100) || 'Application';
        downloadBlob(
          name + (target === 'source' ? '' : `-${target}-build-kit`) + '.zip',
          new Blob([new Uint8Array(bytes).buffer], { type: 'application/zip' }),
        );
      }
      setDone(target);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }
  return (
    <>
      <p className="lab-description">
        Export <strong>{snapshot?.project.name ?? 'your project'}</strong>.
        Downloads use the current source, including edits just made.
      </p>
      <div className="lab-export-options">
        {targets.map(({ id, title, icon: Icon, description, action }) => (
          <section key={id}>
            <Icon size={23} />
            <div>
              <h3>
                {title}
                {(id === 'windows' || id === 'android') && (
                  <small>Build kit</small>
                )}
              </h3>
              <p>{description}</p>
              <button
                className="lab-button"
                disabled={!snapshot || !!busy}
                onClick={() => void build(id)}
              >
                <Download size={16} />
                {busy === id ? 'Preparing…' : action}
              </button>
            </div>
          </section>
        ))}
      </div>
      <p className="lab-description">
        HTML and native kits include Inspector configuration. Saved app inputs
        and running state are never included. Source ZIPs contain no control
        overrides.
      </p>
      {(done === 'windows' || done === 'android') && (
        <div role="status" className="lab-export-help">
          <h3>Next: build the {done === 'windows' ? 'EXE' : 'APK'}</h3>
          <ol>
            <li>
              Extract the ZIP and commit its contents to a GitHub repository,
              including <code>.github/workflows/build.yml</code>.
            </li>
            <li>
              Open the repository’s Actions tab and run the included build
              workflow.
            </li>
            <li>
              Download the completed build artifact. The ZIP’s README also
              explains local builds.
            </li>
          </ol>
          <p>
            {done === 'android'
              ? 'The APK is a debug test build, not a Play Store release.'
              : 'The EXE is unsigned and requires Windows WebView2.'}{' '}
            Internet access and your GitHub account are needed for CI builds.
          </p>
        </div>
      )}
      {done && (done === 'html' || done === 'source') && (
        <p role="status">Download prepared. Check your browser’s downloads.</p>
      )}
      {error && (
        <p role="alert" className="lab-error">
          {error}
        </p>
      )}
    </>
  );
}
