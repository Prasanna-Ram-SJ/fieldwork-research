import { NextRequest, NextResponse } from 'next/server';
import { GUEST_COOKIE, GuestError, guestSession, guestIdentity, guestDatabase, guestAllowance } from '@/lib/guest/access';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
  try {
    const session=guestSession(request.cookies.get(GUEST_COOKIE)?.value,Date.now(),true);
    const identity=guestIdentity(session.id,request.headers.get('cf-connecting-ip') || (process.env.NODE_ENV==='development'?'127.0.0.1':null));
    const allowance=await guestAllowance(await guestDatabase(),identity);
    const response=NextResponse.json({enabled:true,...allowance},{headers:{'Cache-Control':'no-store'}});
    response.cookies.set(GUEST_COOKIE,session.token,{httpOnly:true,sameSite:'strict',secure:new URL(request.url).protocol==='https:',path:'/api/guest',maxAge:Math.max(0,Math.floor((session.expiry-Date.now())/1000))});
    return response;
  } catch(e){return NextResponse.json({enabled:false,error:e instanceof GuestError?e.message:'Guest access is unavailable.'},{status:e instanceof GuestError?e.status:503,headers:{'Cache-Control':'no-store'}});}
}
