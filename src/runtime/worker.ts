import { RuntimeHost } from './host';
import type { WorkerRequest } from './protocol';
const host = new RuntimeHost();
self.onmessage = ({ data }: MessageEvent<WorkerRequest>) =>
  self.postMessage(host.handle(data));
