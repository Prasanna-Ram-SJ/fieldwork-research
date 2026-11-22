import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export type ProviderReservation={provider:'nebius'|'tavily';reservedUSD:number;inputUpper:number;outputCap:number;at:string;id?:string};
type Reserve=(reservation:ProviderReservation)=>Promise<void>;
type Settle=(reservation:ProviderReservation,usage:{input:number;output:number})=>Promise<void>;
const budgets=new AsyncLocalStorage<{reserve:Reserve;settle?:Settle}>();
export function withProviderBudget<T>(reserve:Reserve,work:()=>Promise<T>,settle?:Settle){return budgets.run({reserve,settle},work);}
/** Guest calls reserve pessimistic cost before dispatch; account quotas remain unchanged. */
export async function providerFetch(provider:'nebius'|'tavily',url:RequestInfo|URL,init?:RequestInit){
  const context=budgets.getStore();let reservation:ProviderReservation|undefined,streaming=false;
  if(context){
    const body=JSON.parse(typeof init?.body==='string'?init.body:'{}');
    streaming=body.stream===true;
    let inputUpper=0,outputCap=0,reservedUSD=0;
    if(provider==='nebius'){
      if(body.model!=='moonshotai/Kimi-K3.1-Pro'||!Number.isInteger(body.max_tokens)||body.max_tokens<1||body.max_tokens>8192)throw Error('Guest research cannot price this model safely. Please sign in instead.');
      inputUpper=Buffer.byteLength(JSON.stringify(body.messages))+4096;outputCap=body.max_tokens;
      // Twice the displayed $2/$10 per-million rates; UTF-8 bytes upper-bound input tokens.
      reservedUSD=(inputUpper*4+outputCap*20)/1e6;
    }else{
      if(body.search_depth!=='basic')throw Error('Guest research supports basic search only.');
      reservedUSD=0.02; // conservative upper reservation per basic search
    }
    reservation={provider,inputUpper,outputCap,reservedUSD,at:new Date().toISOString(),id:randomUUID()};
    await context.reserve(reservation);
  }
  const response=await globalThis.fetch(url,init);
  if(provider!=='nebius'||!streaming||!context?.settle||!reservation||!response.ok||!response.body)return response;
  const held=reservation,settle=context.settle,decoder=new TextDecoder();let buffer='',settled=false;
  async function inspect(){let boundary;while((boundary=buffer.match(/\r?\n\r?\n|\r\r/))){const end=boundary.index!;const frame=buffer.slice(0,end);buffer=buffer.slice(end+boundary[0].length);if(settled||!frame.includes('"usage"'))continue;const line=frame.split(/\r\n|\n|\r/).find(s=>s.startsWith('data: '));if(!line||line.includes('[DONE]'))continue;let usage;try{usage=JSON.parse(line.slice(6)).usage;}catch{continue;}
    if(!usage||!Number.isInteger(usage.prompt_tokens)||!Number.isInteger(usage.completion_tokens)||usage.prompt_tokens<0||usage.completion_tokens<0)continue;
    if(usage.prompt_tokens>held.inputUpper||usage.completion_tokens>held.outputCap)throw Error('Provider usage exceeded its reserved bound.');
    // Only a complete provider usage report can release unused exposure.
    // Storage failure leaves the original upper reservation in place.
    settled=true;try{await settle(held,{input:usage.prompt_tokens,output:usage.completion_tokens});}catch{/* keep conservative hold */}
  }}
  const watched=response.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({async transform(chunk,controller){buffer+=decoder.decode(chunk,{stream:true});if(buffer.length>1048576)throw Error('Provider stream frame exceeded its safe size.');await inspect();controller.enqueue(chunk);},async flush(){buffer+=decoder.decode();await inspect();}}));
  return new Response(watched,{status:response.status,statusText:response.statusText,headers:response.headers});
}
