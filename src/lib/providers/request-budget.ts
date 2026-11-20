import { AsyncLocalStorage } from 'node:async_hooks';

export type ProviderReservation={provider:'nebius'|'tavily';reservedUSD:number;inputUpper:number;outputCap:number;at:string};
type Reserve=(reservation:ProviderReservation)=>Promise<void>;
const budgets=new AsyncLocalStorage<Reserve>();
export function withProviderBudget<T>(reserve:Reserve,work:()=>Promise<T>){return budgets.run(reserve,work);}
/** Guest calls reserve pessimistic cost before dispatch; account quotas remain unchanged. */
export async function providerFetch(provider:'nebius'|'tavily',url:RequestInfo|URL,init?:RequestInit){
  const reserve=budgets.getStore();
  if(reserve){
    const body=JSON.parse(typeof init?.body==='string'?init.body:'{}');
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
    await reserve({provider,inputUpper,outputCap,reservedUSD,at:new Date().toISOString()});
  }
  return globalThis.fetch(url,init);
}
