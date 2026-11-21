import type { NormalizedEvidence } from '@/types/research';
import type { AnswerBlock } from '@/types/database';
import type { validateReport } from './validate-report';
import { validateSupports } from './validate-report';
import { researchNote } from './research-notes';

/** A rejected comparison must not erase independently approved paragraphs. */
export function retainVerifiedDraft(parsed:ReturnType<typeof validateReport>,evidence:NormalizedEvidence[],review:unknown,forcePartial=false){
  const value=review as {approved_indices?:unknown;support_updates?:unknown};
  const total=parsed.blocks.length+parsed.source_assessments.length;
  const validDecision=Array.isArray(value?.approved_indices)&&value.approved_indices.every(i=>Number.isInteger(i)&&i>=0&&i<total)&&(value.support_updates===undefined||Array.isArray(value.support_updates));
  const approved=new Set<number>(validDecision?value.approved_indices as number[]:[]);
  const updates=Array.isArray(value?.support_updates)?value.support_updates:[];
  function proof(index:number,original:unknown,allowed:string[]){
    const check=(value:unknown)=>{
      const support=validateSupports(value,evidence);
      if(support.some(p=>!allowed.includes(p.source_ref))||allowed.some(ref=>!support.some(p=>p.source_ref===ref)))throw Error('Proof did not cover the cited sources');
      return support;
    };
    // Approval of an already valid proof keeps that exact reviewed passage.
    // Missing proof is repaired only against the full allowed-source context.
    try{return check(original);}catch{/* exact locator update required */}
    const rows=updates.filter(row=>row?.index===index);if(rows.length>1)throw Error('Ambiguous proof');
    return check(rows.length?rows[0].support:original);
  }
  let blocks:AnswerBlock[]=parsed.blocks.flatMap((block,i)=>{
    if(!approved.has(i))return[];
    try{const support=proof(i,block.support,block.source_refs);return[{...block,support,source_refs:[...new Set(support.map(s=>s.source_ref))]}];}catch{return[];}
  });
  const source_assessments=parsed.source_assessments.flatMap((row,i)=>{
    const index=parsed.blocks.length+i;if(!approved.has(index))return[];
    try{return[{...row,support:proof(index,row.support,[row.source_ref])}];}catch{return[];}
  });
  const partial=forcePartial||blocks.length+source_assessments.length<total, excerptsOnly=blocks.length===0;
  if(excerptsOnly){
    // Deterministic quotations, never rejected model prose or an invented answer.
    blocks=evidence.slice(0,6).flatMap(source=>{
      const passage=source.reading?.passages.find(p=>p.text.trim().length>=16);
      if(!passage)return[];
      let quote=passage.text.trim().slice(0,1000).replace(/[\uD800-\uDBFF]$/,'');
      if(quote.length<passage.text.trim().length){
        const end=Math.max(quote.lastIndexOf('. '),quote.lastIndexOf('? '),quote.lastIndexOf('! '));
        if(end>=200)quote=quote.slice(0,end+1);
        else{const space=quote.lastIndexOf(' ');if(space>=200)quote=quote.slice(0,space);}
      }
      return[{section:('Source evidence — '+(source.title||source.source_ref)).slice(0,100),text:'“'+quote+'”',claim_type:'background' as const,source_refs:[source.source_ref],support:[{source_ref:source.source_ref,passage_id:passage.id,quote}]}];
    });
    if(!blocks.length)throw Error('No source passages could be verified for this question.');
    blocks=[researchNote('status',evidence),...blocks,researchNote('limits',evidence),researchNote('next_steps',evidence)];
  }
  const notice=excerptsOnly?'The evidence check could not establish a complete answer. Only exact source excerpts are shown; they do not by themselves establish an answer.':partial?'Some draft statements or source comparisons could not be verified and were omitted. Only approved paragraphs and comparisons are shown.':'';
  return {...parsed,blocks,source_assessments,scope:excerptsOnly?'Source excerpts only. A complete answer has not been established.':parsed.scope,followups:excerptsOnly?[]:parsed.followups,evidence_status:excerptsOnly?'insufficient' as const:partial?'limited' as const:parsed.evidence_status,uncertainty_note:notice||parsed.uncertainty_note,verificationNotice:notice};
}
