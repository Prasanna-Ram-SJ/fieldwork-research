import { NextRequest, NextResponse } from 'next/server';
import { GUEST_COOKIE, GuestError, guestSession, guestIdentity, guestDatabase, reserveGuest, reserveGuestProvider } from '@/lib/guest/access';
import { withProviderBudget } from '@/lib/providers/request-budget';
import { runGuestResearch } from '@/lib/guest/research';
import { researchStream } from '@/lib/research/stream';
import { clarificationFor } from '@/lib/research/clarify';
import { readStudentBody } from '@/lib/student/http';
import { getNebiusConfig } from '@/lib/providers/nebius';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=240;
export async function POST(request:NextRequest){
  try {
    if(request.headers.get('origin')!==new URL(request.url).origin)throw new GuestError('Request origin not allowed.');
    if(process.env.PROVIDER_REQUESTS_ENABLED!=='true'||!getNebiusConfig()||!process.env.TAVILY_API_KEY)throw new GuestError('Live research is paused or not configured.',503);
    const session=guestSession(request.cookies.get(GUEST_COOKIE)?.value);
    let body;
    try { body=await readStudentBody(request,40000); }
    catch { throw new GuestError('Enter a valid question within the request size limit.',400); }
    const question=typeof body.question==='string'?body.question.trim():'';
    if(!question||question.length>1000)throw new GuestError('Enter a research question of 1–1000 characters.',400);
    if(typeof body.request_id!=='string'||!/^[a-f0-9-]{36}$/.test(body.request_id))throw new GuestError('A valid request identifier is required.',400);
    const clarification=clarificationFor(question);
    if(clarification&&body.scope_confirmed!==true)return NextResponse.json({error:clarification,needs_clarification:true},{status:422});
    const context=typeof body.recent_context==='string'?body.recent_context.slice(0,6500):'';
    const identity=guestIdentity(session.id,request.headers.get('cf-connecting-ip') || (process.env.NODE_ENV==='development'?'127.0.0.1':null));
    const db=await guestDatabase();
    const allowance=await reserveGuest(db,identity,body.request_id);
    const response=researchStream(emit=>withProviderBudget(reservation=>reserveGuestProvider(db,body.request_id,reservation),()=>runGuestResearch(question,context,emit)));
    response.headers.set('X-Guest-Remaining',String(allowance.remaining));
    return response;
  } catch(e){return NextResponse.json({error:e instanceof GuestError?e.message:'Guest research could not start. No automatic retry was made.'},{status:e instanceof GuestError?e.status:503,headers:{'Cache-Control':'no-store'}});}
}
