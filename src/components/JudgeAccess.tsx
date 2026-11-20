"use client";
import { useCallback, useEffect, useState } from 'react';
export type JudgeState = { configured: boolean; unlocked: boolean; remaining: number; limit: number };
export const lockedJudge: JudgeState = { configured: false, unlocked: false, remaining: 0, limit: 0 };
export function JudgeAccess({ onChange }: { onChange?: (state: JudgeState) => void }) {
  const [state, setState] = useState<JudgeState>(lockedJudge), [code, setCode] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const update = useCallback((next: JudgeState) => { setState(next); onChange?.(next); }, [onChange]);
  const refresh = useCallback(async () => {
    try { const r = await fetch('/api/judge/session', { cache: 'no-store' }); const data = await r.json(); if (!r.ok) throw Error(data.error); update(data); }
    catch { update(lockedJudge); setError('Judge access could not be checked. The free prepared example still works.'); }
  }, [update]);
  useEffect(() => { void refresh(); const changed = () => { void refresh(); }; window.addEventListener('fieldwork-judge-update', changed); return () => window.removeEventListener('fieldwork-judge-update', changed); }, [refresh]);
  return <details className="judge-access"><summary>{state.unlocked ? `${state.remaining} of ${state.limit} shared live actions left` : 'Have a judge access code?'}</summary>
    <p>Prepared examples, local edits and exports need no code and make no paid requests.</p>
    {state.unlocked ? <><p><strong>{state.remaining} of {state.limit} live actions remain across all judges.</strong> Each new analysis or web question uses one. Failed attempts count too; refreshing or signing in does not refill this judge allowance.</p><button className="text-button" disabled={busy} onClick={async () => { setBusy(true); try { const r = await fetch('/api/judge/session', { method: 'DELETE' }); if (!r.ok) throw Error(); update({ ...state, unlocked: false }); } catch { setError('Could not lock the session. Try again.'); } finally { setBusy(false); } }}>Lock this judge session</button></> : state.configured ? <form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { const r = await fetch('/api/judge/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) }); const data = await r.json(); if (!r.ok) throw Error(data.error); setCode(''); update(data); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}><label>Judge code<input type="password" maxLength={100} autoComplete="off" value={code} onChange={e => setCode(e.target.value)} required /></label><button className="ink-button" disabled={busy || !code.trim()}>{busy ? 'Checking code…' : 'Unlock live analysis'}</button></form> : <p>Live judge access is not currently available. You can explore every prepared result, work locally, or sign in for account research.</p>}
    {error && <p className="inline-error" role="alert">{error}</p>}
  </details>;
}
