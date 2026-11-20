import { createHash, createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rmdir } from 'node:fs/promises';
import * as path from 'node:path';
export const JUDGE_COOKIE = 'fieldwork-judge';
export class JudgeError extends Error { constructor(message: string, public status = 403) { super(message); } }
export function judgeConfig() {
  const codeHash = process.env.JUDGE_ACCESS_CODE_HASH || '', secret = process.env.JUDGE_SESSION_SECRET || '';
  const expires = Date.parse(process.env.JUDGE_ACCESS_EXPIRES_AT || '');
  const limit = Math.min(10, Math.max(1, Number(process.env.JUDGE_REQUEST_LIMIT) || 3));
  const backend = process.env.JUDGE_LEDGER_BACKEND === 'd1' ? 'd1' : 'filesystem';
  const ledger = backend === 'd1' ? 'd1' : process.env.JUDGE_LEDGER_PATH;
  // A shared persistent ledger is mandatory. No in-memory or per-instance fallback.
  if (!/^[a-f0-9]{64}$/.test(codeHash) || secret.length < 32 || !Number.isFinite(expires) || !ledger || (backend === 'filesystem' && !path.isAbsolute(ledger))) return null;
  return { codeHash, secret, expires, limit: Math.floor(limit), ledger, backend };
}
function same(a: string, b: string) { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }
function signature(data: string, secret: string) { return createHmac('sha256', secret).update(data).digest('base64url'); }
export function issueJudgeSession(code: unknown, now = Date.now()) {
  const config = judgeConfig();
  if (!config || now >= config.expires) throw new JudgeError('Judge access is not available. The free prepared demo still works.');
  if (typeof code !== 'string' || code.length > 100 || !same(createHash('sha256').update(code.trim()).digest('hex'), config.codeHash)) throw new JudgeError('That judge code is not valid. Check the code with the project owner.');
  const expiry = Math.min(now + 4 * 60 * 60 * 1000, config.expires);
  const data = Buffer.from(JSON.stringify({ exp: expiry, campaign: config.codeHash, nonce: randomBytes(16).toString('hex') })).toString('base64url');
  return { token: data + '.' + signature(data, config.secret), expiry };
}
export function requireJudge(token: string | undefined, now = Date.now()) {
  const config = judgeConfig();
  if (!config || now >= config.expires || !token || token.length > 1500) throw new JudgeError('Enter a valid judge code to run new live analysis.');
  const [data, sig, extra] = token.split('.');
  if (extra || !sig || !same(signature(data, config.secret), sig)) throw new JudgeError('Judge session expired or invalid. Enter your code again.');
  try { const value = JSON.parse(Buffer.from(data, 'base64url').toString()); if (value.campaign !== config.codeHash || typeof value.exp !== 'number' || value.exp <= now || value.exp > config.expires) throw Error(); }
  catch { throw new JudgeError('Judge session expired or invalid. Enter your code again.'); }
  return config;
}
type Ledger = { version: 1; codeHash: string; used: number; attempts: number; window: number; lastAttempt: number; reservations: { id: string; at: string; kind: string }[] };
async function withLedger<T>(work: (ledger: Ledger) => T | Promise<T>): Promise<T> {
  const config = judgeConfig();
  if (!config) throw new JudgeError('Live judge access is not configured.', 503);
  if (config.backend === 'd1') {
    try { const { withDurableJudgeLedger } = await import('./d1-ledger'); return await withDurableJudgeLedger(config.codeHash, work); }
    catch (e) { if (e instanceof JudgeError) throw e; throw new JudgeError('Judge usage protection is unavailable. Prepared examples remain accessible.', 503); }
  }
  const lock = config.ledger + '.lock';
  let acquired = false;
  try {
    for (let attempt = 0; attempt < 20; attempt++) {
      try { await mkdir(lock); acquired = true; break; } catch (e: any) { if (e.code !== 'EEXIST') throw e; await new Promise(resolve => setTimeout(resolve, 30)); }
    }
    if (!acquired) throw new JudgeError('Judge usage protection is busy. Try again shortly.', 503);
    // A missing/corrupt ledger never resets the allowance. Initialize it explicitly.
    const ledger: Ledger = JSON.parse(await readFile(config.ledger, 'utf8'));
    if (ledger.version !== 1 || ledger.codeHash !== config.codeHash || !Number.isInteger(ledger.used) || ledger.used < 0 || !Array.isArray(ledger.reservations) || ledger.used !== ledger.reservations.length) throw Error('Invalid ledger');
    const result = await work(ledger);
    const temp = config.ledger + '.' + randomBytes(8).toString('hex') + '.tmp';
    await writeFile(temp, JSON.stringify(ledger), { mode: 0o600, flag: 'wx' });
    await rename(temp, config.ledger);
    return result;
  } catch (e) { if (e instanceof JudgeError) throw e; throw new JudgeError('Judge usage protection is unavailable. Prepared examples remain accessible.', 503); }
  finally { if (acquired) await rmdir(lock).catch(() => {}); }
}
export async function judgeStatus(token?: string) {
  const config = judgeConfig();
  if (!config || Date.now() >= config.expires) return { configured: false, unlocked: false, remaining: 0, limit: 0 };
  if (!token) return { configured: true, unlocked: false, remaining: 0, limit: config.limit };
  try { requireJudge(token); } catch { return { configured: true, unlocked: false, remaining: 0, limit: config.limit }; }
  return withLedger(ledger => ({ configured: true, unlocked: true, remaining: Math.max(0, config.limit - ledger.used), limit: config.limit }));
}
export async function checkCodeAttempt(now = Date.now()) {
  const allowed = await withLedger(ledger => {
    if (now - ledger.window >= 15 * 60 * 1000) { ledger.window = now; ledger.attempts = 0; }
    ledger.attempts++;
    return ledger.attempts <= 30;
  });
  if (!allowed) throw new JudgeError('Too many code attempts. Wait fifteen minutes or use the prepared demo.', 429);
}
export async function reserveJudge(token: string | undefined, kind: string, requestId: string) {
  const config = requireJudge(token);
  return withLedger(ledger => {
    if (ledger.reservations.some(r => r.id === requestId)) return { allowed: false, remaining: Math.max(0, config.limit - ledger.used), reason: 'This request was already attempted. No automatic retry was made.' };
    if (ledger.used >= config.limit) return { allowed: false, remaining: 0, reason: 'The shared judge allowance is used up. Prepared examples still work.' };
    if (Date.now() - ledger.lastAttempt < 5000) return { allowed: false, remaining: config.limit - ledger.used, reason: 'A judge action just started. Wait a few seconds before another action.' };
    ledger.used++; ledger.lastAttempt = Date.now(); ledger.reservations.push({ id: requestId, kind, at: new Date().toISOString() });
    return { allowed: true, remaining: config.limit - ledger.used, reason: '' };
  });
}
