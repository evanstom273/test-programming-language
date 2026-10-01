import InlineWorker from './worker?worker&inline';
import type { RuntimeCommand, WorkerRequest, WorkerResponse } from './protocol';
export interface WorkerPort {
  postMessage(message: WorkerRequest): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}
/** Termination interrupts synchronous JS even when it cannot process a stop message. */
export class RuntimeClient {
  private worker: WorkerPort | null = null;
  private epoch = 0;
  private serial = 0;
  private pending = new Map<
    number,
    {
      resolve: (r: WorkerResponse) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor(
    private factory: () => WorkerPort = () => new InlineWorker(),
    private timeoutMs = 5000,
  ) {}
  stop(reason = 'Program stopped.'): void {
    this.epoch++;
    this.worker?.terminate();
    this.worker = null;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
    }
    this.pending.clear();
  }
  request(command: RuntimeCommand): Promise<WorkerResponse> {
    if (this.pending.size >= 64)
      return Promise.reject(new Error('Too many pending actions.'));
    if (!this.worker) {
      this.worker = this.factory();
      this.worker.onmessage = ({ data }) => {
        if (data.epoch !== this.epoch) return;
        const p = this.pending.get(data.requestId);
        if (!p) return;
        clearTimeout(p.timer);
        this.pending.delete(data.requestId);
        p.resolve(data);
      };
      this.worker.onerror = () =>
        this.stop('Runtime worker failed. Press Run to restart.');
    }
    const requestId = ++this.serial;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          this.stop(
            'Execution timed out; worker terminated. Press Run to restart.',
          ),
        this.timeoutMs,
      );
      this.pending.set(requestId, { resolve, reject, timer });
      this.worker!.postMessage({ ...command, requestId, epoch: this.epoch });
    });
  }
}
