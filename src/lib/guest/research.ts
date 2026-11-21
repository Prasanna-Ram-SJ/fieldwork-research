import { randomUUID } from 'node:crypto';
import { conductResearch } from '@/lib/research/pipeline';
import { synthesizeReport } from '@/lib/research/report-synthesizer';
import { getNebiusConfig } from '@/lib/providers/nebius';
import { inferenceErrorMessage } from '@/lib/providers/provider-errors';
import type { SSEEventType, SSETraceEvent } from '@/types/research';

export async function runGuestResearch(question:string, recentContext:string, emit:(event:SSETraceEvent)=>Promise<void>) {
  const run=randomUUID(),start=Date.now(); let sequence=0;
  const send=(type:SSEEventType,payload:Record<string,unknown>)=>emit({research_run_id:run,sequence:++sequence,timestamp:new Date().toISOString(),type,payload});
  try {
    await send('run_started',{question,model_id:getNebiusConfig()?.model,guest:true});
    // The same planning, original-source reading, coverage and verified report
    // pipeline as an account user; only account persistence is omitted.
    const result=await conductResearch(question,recentContext,[],send);
    if(!result.evidence.length){await send('insufficient_evidence',{message:'The searches did not find enough usable evidence. No answer was fabricated.'});return;}
    await send('evidence_selected',{selected_sources_count:result.evidence.length,sources:result.evidence.map(e=>({source_ref:e.source_ref,title:e.title,domain:e.domain,original_url:e.original_url,published_at:e.published_at,snippet_preview:e.snippet,reading:e.reading}))});
    await send('synthesis_started',{model_id:getNebiusConfig()?.model,evidence_count:result.evidence.length});
    const synthesis=await synthesizeReport(question,result.evidence,{plan:result.plan,coverage:result.coverage,queries:result.queries,stopReason:result.stopReason},recentContext,()=>send('verification_started',{message:'Checking report statements and quotations against the cited passages.'}));
    await send('answer_completed',{assistant_message_id:randomUUID(),answer:synthesis.output,elapsed_ms:Date.now()-start,tavily_credits:result.actualTavilyCredits,tokens:{input:result.inputTokens+synthesis.inputTokens,output:result.outputTokens+synthesis.outputTokens},token_usage_complete:synthesis.usageComplete,guest:true});
  } catch(e) {
    const error=e as {message?:string;status?:number};
    const message=inferenceErrorMessage(error)||(error.message==='Connection error.'?'The AI service could not be reached. No automatic retry was made.':error.message || 'Guest research could not finish.');
    await send('provider_error',{error_code:'guest_research_failed',message});
  }
}
