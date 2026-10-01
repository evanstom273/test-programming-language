export interface LaunchFileHandle {
  getFile(): Promise<File>;
}
interface FileLaunchQueue {
  setConsumer(consumer: (params: { files?: LaunchFileHandle[] }) => void): void;
}
/** Feature detection is essential: this API is not universally supported on mobile. */
export function receiveFileLaunch(
  onFiles: (files: Promise<File[]>) => void,
  target: Window = window,
) {
  const queue = (target as Window & { launchQueue?: FileLaunchQueue })
    .launchQueue;
  if (!queue) return () => {};
  let active = true;
  queue.setConsumer((params) => {
    if (!active || !params.files?.length) return;
    if (params.files.length !== 1) {
      onFiles(Promise.reject(new Error('Open one .lang file at a time.')));
      return;
    }
    onFiles(Promise.all(params.files.map(async (handle) => handle.getFile())));
  });
  return () => {
    active = false;
  };
}
export async function receiveCliLaunch(token: string): Promise<File[]> {
  if (
    !['127.0.0.1', 'localhost'].includes(location.hostname) ||
    !/^[a-f0-9]{64}$/.test(token)
  )
    throw new Error(
      'Invalid local runner launch. Choose a .lang file instead.',
    );
  const response = await fetch(
    import.meta.env.BASE_URL + '__langlab__/' + token,
    { cache: 'no-store' },
  );
  if (!response.ok || !response.body)
    throw new Error(
      'The local runner is unavailable. Restart lang:open or choose a file.',
    );
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 7_000_000) {
      await reader.cancel();
      throw new Error('Launch file exceeds the size limit.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const data = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(bytes),
  );
  if (typeof data.name !== 'string' || typeof data.source !== 'string')
    throw new Error('Invalid local runner file.');
  return [new File([data.source], data.name, { type: 'text/x-language-lab' })];
}
