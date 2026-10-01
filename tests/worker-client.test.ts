import { describe, expect, it, vi } from 'vitest';
import { RuntimeClient, type WorkerPort } from '../src/runtime/client';
import type { WorkerRequest, WorkerResponse } from '../src/runtime/protocol';
class Port implements WorkerPort {
  onmessage: WorkerPort['onmessage']=null; onerror: WorkerPort['onerror']=null;
  sent: WorkerRequest[]=[]; terminated=false;
  postMessage(message: WorkerRequest){this.sent.push(message);}
  terminate(){this.terminated=true;}
  reply(request: WorkerRequest){this.onmessage?.({data:{epoch:request.epoch,requestId:request.requestId,diagnostics:[]}} as unknown as MessageEvent<WorkerResponse>);}
}
describe('worker lifecycle and epochs',()=>{
  it('hard terminates on Stop and ignores stale messages after recreating a worker',async()=>{
    const ports:Port[]=[]; const client=new RuntimeClient(()=>{const p=new Port();ports.push(p);return p;});
    const old=client.request({type:'clear'}); const rejected=expect(old).rejects.toThrow(/stopped/);
    client.stop(); await rejected; expect(ports[0].terminated).toBe(true);
    const next=client.request({type:'clear'}); let resolved=false; void next.then(()=>{resolved=true;});
    ports[0].reply(ports[0].sent[0]); await Promise.resolve(); expect(resolved).toBe(false);
    ports[1].reply(ports[1].sent[0]); await next; expect(resolved).toBe(true); client.stop();
  });
  it('terminates stalled execution by watchdog and rejects every pending action',async()=>{
    vi.useFakeTimers(); const port=new Port(); const client=new RuntimeClient(()=>port,100);
    const pending=client.request({type:'clear'}); const rejected=expect(pending).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(101); await rejected; expect(port.terminated).toBe(true); vi.useRealTimers();
  });
  it('cleans up requests on errors and bounds queued actions',async()=>{
    const port=new Port(); const client=new RuntimeClient(()=>port);
    const pending=Array.from({length:64},()=>client.request({type:'clear'}).catch(e=>e));
    await expect(client.request({type:'clear'})).rejects.toThrow(/Too many/);
    port.onerror?.({} as ErrorEvent); expect(port.terminated).toBe(true);
    expect((await Promise.all(pending)).every(e=>e instanceof Error)).toBe(true);
  });
});
