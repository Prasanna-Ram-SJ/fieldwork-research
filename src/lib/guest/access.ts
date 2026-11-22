import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { LedgerDatabase } from '@/lib/judge/d1-ledger';
import type { ProviderReservation } from '@/lib/providers/request-budget';

export const GUEST_COOKIE = 'fieldwork-guest-research';
export class GuestError extends Error { constructor(message: string, public status = 403) { super(message); } }
export const GUEST_DAILY_LIMIT = 10;
const NETWORK_DAILY_LIMIT = 20;
export function guestConfig() {
  const secret = process.env.GUEST_SESSION_SECRET || process.env.JUDGE_SESSION_SECRET || '';
  if (process.env.GUEST_RESEARCH_ENABLED !== 'true' || secret.length < 32) throw new GuestError('Guest research is not available yet. Please sign in to research.', 503);
  const total = Math.min(100, Math.max(1, Math.floor(Number(process.env.MAX_GUEST_REQUESTS_TOTAL) || 100)));
  return { secret, total };
}
function digest(value: string) { return createHmac('sha256', guestConfig().secret).update(value).digest('base64url'); }
function equal(a: string, b: string) { const x=Buffer.from(a), y=Buffer.from(b); return x.length===y.length && timingSafeEqual(x,y); }
export function guestSession(token?: string, now = Date.now(), create = false) {
  guestConfig();
  if (token && token.length < 600) {
    const [data, signature, extra] = token.split('.');
    if (!extra && signature && equal(digest('guest-session:v1:' + data), signature)) {
      try { const value=JSON.parse(Buffer.from(data,'base64url').toString());
        if (typeof value.id==='string' && /^[\w-]{36}$/.test(value.id) && Number.isFinite(value.exp) && value.exp>now && value.exp<=now+7*86400000) return { id:value.id as string, token, expiry:value.exp as number };
      } catch { /* invalid session */ }
    }
  }
  if (!create) throw new GuestError('Open Workspace to start a guest session, then submit your question again.');
  const expiry=now+7*86400000, id=randomUUID(), data=Buffer.from(JSON.stringify({id,exp:expiry})).toString('base64url');
  return {id,expiry,token:data+'.'+digest('guest-session:v1:'+data)};
}
export async function guestDatabase(): Promise<LedgerDatabase> {
  try { const {env}=await getCloudflareContext({async:true});
    const db=(env as unknown as {JUDGE_QUOTA?:LedgerDatabase}).JUDGE_QUOTA;
    if (db) return db.withSession?.('first-primary') || db;
  } catch { /* no volatile or filesystem quota fallback */ }
  throw new GuestError('Guest usage protection is unavailable. Please sign in or try again later.',503);
}
export function guestIdentity(id: string, ip: string | null, now = Date.now()) {
  if (!ip) throw new GuestError('Guest access could not verify this connection. Please sign in instead.',503);
  return { visitor:digest('guest-visitor:v1:'+id), network:digest('guest-network:v1:'+new Date(now).toISOString().slice(0,10)+':'+ip) };
}
export async function guestAllowance(db: LedgerDatabase, identity: {visitor:string;network:string}, now=Date.now()) {
  const day=new Date(now).toISOString().slice(0,10)+'T00:00:00.000Z', limit=guestConfig().total;
  const counts=await db.prepare(`SELECT COUNT(*) AS total,
    COALESCE(SUM(visitor_hash = ? AND created_at >= ?),0) AS visitor,
    COALESCE(SUM(network_hash = ? AND created_at >= ?),0) AS network
    FROM guest_research_reservations`).bind(identity.visitor,day,identity.network,day).first<{total:number;visitor:number;network:number}>();
  if (!counts || ![counts.total,counts.visitor,counts.network].every(Number.isInteger)) throw new GuestError('Guest usage protection is unavailable.',503);
  return {remaining:Math.max(0,Math.min(GUEST_DAILY_LIMIT-counts.visitor,NETWORK_DAILY_LIMIT-counts.network,limit-counts.total)),daily_limit:GUEST_DAILY_LIMIT,pool_remaining:Math.max(0,limit-counts.total)};
}
export async function reserveGuest(db: LedgerDatabase, identity: {visitor:string;network:string}, requestId:string, now=Date.now()) {
  const day=new Date(now).toISOString().slice(0,10)+'T00:00:00.000Z';
  // One atomic SQL statement covers duplicates, concurrent requests and all caps.
  const result=await db.prepare(`INSERT INTO guest_research_reservations(request_id,visitor_hash,network_hash,created_at)
    SELECT ?,?,?,? WHERE
    (SELECT COUNT(*) FROM guest_research_reservations) < ? AND
    (SELECT COUNT(*) FROM guest_research_reservations WHERE visitor_hash=? AND created_at>=?) < ? AND
    (SELECT COUNT(*) FROM guest_research_reservations WHERE network_hash=? AND created_at>=?) < ? AND
    NOT EXISTS(SELECT 1 FROM guest_research_reservations WHERE request_id=?) AND
    NOT EXISTS(SELECT 1 FROM guest_research_reservations WHERE visitor_hash=? AND created_at>=?)`)
    .bind(requestId,identity.visitor,identity.network,new Date(now).toISOString(),guestConfig().total,
      identity.visitor,day,GUEST_DAILY_LIMIT,identity.network,day,NETWORK_DAILY_LIMIT,requestId,identity.visitor,new Date(now-20000).toISOString()).run();
  const allowance=await guestAllowance(db,identity,now);
  if (result.meta.changes!==1) throw new GuestError(allowance.remaining ? 'Wait a moment before another guest question. Each request can run only once.' : 'Guest allowance reached. Sign in for your account allowance. Guest daily limits reset at 00:00 UTC; the shared preview pool is finite.',429);
  return allowance;
}
export async function reserveGuestProvider(db:LedgerDatabase,requestId:string,reservation:ProviderReservation){
  const amount=reservation.reservedUSD;
  if(!Number.isFinite(amount)||amount<=0||amount>1)throw new GuestError('This question exceeds the guest research budget. Please ask a narrower question.',429);
  const result=await db.prepare(`UPDATE guest_research_reservations SET reserved_usd=reserved_usd+?, cost_events=json_insert(cost_events,'$[#]',json(?)) WHERE request_id=? AND reserved_usd+?<=1`)
    .bind(amount,JSON.stringify(reservation),requestId,amount).run();
  if(result.meta.changes!==1)throw new GuestError('This question reached the guest research budget. No further provider request was made. Please ask a narrower question.',429);
}

/** Replace one completed call's pessimistic exposure with its reported usage,
 * at the same doubled model rates. Unknown/failed calls are never refunded. */
export async function settleGuestProvider(db:LedgerDatabase,requestId:string,reservation:ProviderReservation,usage:{input:number;output:number}){
  if(reservation.provider!=='nebius'||!reservation.id)return;
  const amount=(usage.input*4+usage.output*20)/1e6;
  if(!Number.isFinite(amount)||amount<0||amount>reservation.reservedUSD)throw Error('Invalid provider usage reconciliation.');
  const row=await db.prepare("SELECT CAST(j.key AS INTEGER) AS position, json_extract(j.value,'$.reservedUSD') AS held FROM guest_research_reservations r, json_each(r.cost_events) j WHERE r.request_id=? AND json_extract(j.value,'$.id')=? AND json_extract(j.value,'$.settled') IS NULL LIMIT 1").bind(requestId,reservation.id).first<{position:number;held:number}>();
  if(!row||row.held!==reservation.reservedUSD||!Number.isSafeInteger(row.position))return;
  const base=`$[${row.position}]`;
  await db.prepare("UPDATE guest_research_reservations SET reserved_usd=ROUND(reserved_usd-?+?,6), cost_events=json_set(cost_events,?,1,?,?,?, ?,?,?) WHERE request_id=? AND json_extract(cost_events,?) IS NULL").bind(row.held,amount,base+'.settled',base+'.actualUSD',amount,base+'.inputTokens',usage.input,base+'.outputTokens',usage.output,requestId,base+'.settled').run();
}
