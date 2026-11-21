import { validateAnswer } from './validate-answer';
import { validateSupports } from './validate-report';
import type { validateReport } from './validate-report';
import type { NormalizedEvidence } from '@/types/research';
import type { EvidenceSupport } from '@/types/database';

export type ReportDraft=ReturnType<typeof validateReport>;
/** Structural validation is per item. Missing proof is repaired only by the
 * evidence reviewer locating an exact passage, never by accepting draft prose. */
export function prepareReportDraft(raw:unknown,evidence:NormalizedEvidence[],question:string){
  const value=(raw && typeof raw==='object' ? raw : {}) as Record<string,unknown>;
  const refs=new Set(evidence.map(e=>e.source_ref));
  let omitted=0;
  const blocks:ReportDraft['blocks']=[];
  const source_assessments:ReportDraft['source_assessments']=[];
  for(const candidate of Array.isArray(value.blocks)?value.blocks.slice(0,20):[]){
    try {
      const block=validateAnswer({blocks:[candidate],evidence_status:'limited'},refs).blocks[0];
      if(!block.source_refs.length)throw Error('No cited source');
      if(typeof candidate.section!=='string'||!candidate.section.trim()||candidate.section.length>100)throw Error('Invalid section');
      let support:EvidenceSupport[]=[];
      try {support=validateSupports(candidate.support,evidence);if(support.some(s=>!block.source_refs.includes(s.source_ref))||block.source_refs.some(ref=>!support.some(s=>s.source_ref===ref)))support=[];}catch{/* reviewer must locate missing/invalid proof */}
      blocks.push({...block,section:candidate.section.trim(),support});
    }catch{omitted++;}
  }
  const seen=new Set<string>();
  for(const row of Array.isArray(value.source_assessments)?value.source_assessments.slice(0,5):[]){
    if(!row||!refs.has(row.source_ref)||seen.has(row.source_ref)||['contribution','method','limitation'].some(k=>typeof row[k]!=='string'||!row[k].trim()||row[k].length>900)){omitted++;continue;}
    seen.add(row.source_ref);
    let support:EvidenceSupport[]=[];
    try {support=validateSupports(row.support,evidence);if(support.some(s=>s.source_ref!==row.source_ref))support=[];}catch{/* not yet verified */}
    source_assessments.push({source_ref:row.source_ref,contribution:row.contribution,method:row.method,limitation:row.limitation,support});
  }
  const status=['supported','limited','conflicting','insufficient'].includes(String(value.evidence_status))?value.evidence_status as ReportDraft['evidence_status']:'limited';
  const draft:ReportDraft={blocks,source_assessments,evidence_status:status,
    scope:typeof value.scope==='string'&&value.scope.trim()&&value.scope.length<=1200?value.scope:question.slice(0,1000),
    followups:Array.isArray(value.followups)?value.followups.filter((s):s is string=>typeof s==='string'&&s.trim().length>0&&s.length<=350).slice(0,3):[],
    uncertainty_note:typeof value.uncertainty_note==='string'?value.uncertainty_note.slice(0,2000):undefined};
  return {draft,omitted};
}

export function reportReviewInput(draft:ReportDraft,evidence:NormalizedEvidence[]){
  const statements=[...draft.blocks.map(b=>({text:[b.text,b.caveat?`Caveat: ${b.caveat}`:''].filter(Boolean).join('\n'),interpretation:b.claim_type==='inference',allowed_source_refs:b.source_refs,support:b.support})),
    ...draft.source_assessments.map(s=>({text:[s.contribution,s.method,s.limitation].join('\n'),interpretation:true,allowed_source_refs:[s.source_ref],support:s.support}))];
  const needed=new Map<string,Set<string>|null>();
  for(const statement of statements)for(const ref of statement.allowed_source_refs){
    const proofs=(statement.support||[]).filter(p=>p.source_ref===ref);
    if(!proofs.length){needed.set(ref,null);continue;}
    if(needed.has(ref)&&needed.get(ref)===null)continue;
    const ids=needed.get(ref)||new Set<string>();for(const proof of proofs)ids.add(proof.passage_id);needed.set(ref,ids);
  }
  return JSON.stringify({statements:statements.map((s,index)=>({index,...s})),sources:evidence.filter(e=>needed.has(e.source_ref)).map(e=>({source_ref:e.source_ref,title:e.title,access:e.reading?.access,note:e.reading?.note,passages:(e.reading?.passages||[]).filter(p=>needed.get(e.source_ref)===null||needed.get(e.source_ref)?.has(p.id))}))});
}
