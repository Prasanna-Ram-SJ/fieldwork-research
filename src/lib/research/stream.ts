import type { SSETraceEvent } from '@/types/research';

/** Native web streams work in Node and workerd; heartbeat comments prevent idle disconnects. */
export function researchStream(work: (emit: (event:SSETraceEvent)=>Promise<void>)=>Promise<void>) {
  const encoder=new TextEncoder();
  let closed=false, heartbeat:ReturnType<typeof setInterval>;
  const stream=new ReadableStream<Uint8Array>({
    start(controller) {
      const emit=async(event:SSETraceEvent)=>{
        if(closed) throw new Error('Research client disconnected.');
        controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
      };
      controller.enqueue(encoder.encode(': connected\n\n'));
      heartbeat=setInterval(()=>{if(!closed)controller.enqueue(encoder.encode(': working\n\n'));},15000);
      heartbeat.unref?.();
      void work(emit).catch(async()=>{
        if(!closed)await emit({research_run_id:'',sequence:999,timestamp:new Date().toISOString(),type:'provider_error',payload:{error_code:'research_execution_error',message:'Research could not finish. No automatic retry was made.'}});
      }).finally(()=>{clearInterval(heartbeat);if(!closed){closed=true;controller.close();}});
    },
    cancel(){closed=true;clearInterval(heartbeat);},
  });
  return new Response(stream,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no'}});
}
