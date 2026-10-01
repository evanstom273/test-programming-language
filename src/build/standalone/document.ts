import type { ProjectSnapshot } from '../../workspace/model';
import { base64, serializeProject } from './model';

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
}

export function standaloneFilename(name: string) {
  return (
    (name
      .replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '-')
      .replace(/[. ]+$/g, '')
      .slice(0, 100) || 'Application') + '.html'
  );
}

/** No user text is interpolated into executable JS/CSS. The application host is
 * encoded as data so even a literal closing script tag cannot escape its block.
 */
export function standaloneDocument(
  project: ProjectSnapshot,
  host: { script: string; style: string },
): string {
  const payload = serializeProject(project)
    .replace(/</g, '\\u003c')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  const script = base64(new TextEncoder().encode(host.script));
  const style = host.style.replace(/<\/style/gi, '<\\/style');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob: data:; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none'">
<title>${escapeHtml(project.project.name)}</title>
<style>${style}</style></head><body>
<div id="root"><p role="status">Starting application…</p></div>
<noscript>This application needs JavaScript enabled in your browser.</noscript>
<script id="app-project" type="application/json">${payload}</script>
<script id="app-host" type="application/octet-stream">${script}</script>
<script>
(() => {
  const root = document.getElementById('root');
  const fail = () => { root.textContent = 'Unable to start the application. Open this HTML file in a current web browser with JavaScript and workers enabled.'; root.setAttribute('role', 'alert'); };
  try {
    const code = Uint8Array.from(atob(document.getElementById('app-host').textContent), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([code], {type: 'text/javascript'}));
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => URL.revokeObjectURL(url);
    script.onerror = () => { URL.revokeObjectURL(url); fail(); };
    document.body.appendChild(script);
  } catch { fail(); }
})();
</script></body></html>`;
}
