import { getCloudflareContext } from '@opennextjs/cloudflare';

export type JudgeLedger = { version: 1; codeHash: string; used: number; attempts: number; window: number; lastAttempt: number; reservations: { id: string; at: string; kind: string }[] };
type Statement = { bind(...values: unknown[]): Statement; first<T>(): Promise<T | null>; run(): Promise<{ meta: { changes: number } }> };
export type LedgerDatabase = { prepare(sql: string): Statement; withSession?(constraint: 'first-primary'): LedgerDatabase };

function validate(state: unknown, campaign: string): asserts state is JudgeLedger {
  const value = state as JudgeLedger;
  if (!value || value.version !== 1 || value.codeHash !== campaign || !Number.isInteger(value.used) || value.used < 0 || !Array.isArray(value.reservations) || value.used !== value.reservations.length || !Number.isInteger(value.attempts) || value.attempts < 0 || !Number.isFinite(value.window) || !Number.isFinite(value.lastAttempt)) throw Error('Invalid durable judge ledger');
}

// Compare-and-swap prevents overlapping Workers from granting the same capacity.
// Missing/corrupt records fail closed; this never creates or resets a campaign.
export async function updateDurableLedger<T>(database: LedgerDatabase, campaign: string, work: (ledger: JudgeLedger) => T | Promise<T>): Promise<T> {
  const db = database.withSession?.('first-primary') || database;
  for (let attempt = 0; attempt < 12; attempt++) {
    const row = await db.prepare('SELECT state, revision FROM judge_ledger WHERE campaign = ?').bind(campaign).first<{ state: string; revision: number }>();
    if (!row || !Number.isInteger(row.revision) || row.revision < 0) throw Error('Durable judge ledger is unavailable');
    const ledger: unknown = JSON.parse(row.state);
    validate(ledger, campaign);
    const result = await work(ledger);
    validate(ledger, campaign);
    const saved = await db.prepare('UPDATE judge_ledger SET state = ?, revision = revision + 1 WHERE campaign = ? AND revision = ?').bind(JSON.stringify(ledger), campaign, row.revision).run();
    if (saved.meta.changes === 1) return result;
  }
  throw Error('Durable judge ledger is busy');
}

export async function withDurableJudgeLedger<T>(campaign: string, work: (ledger: JudgeLedger) => T | Promise<T>) {
  const { env } = getCloudflareContext();
  const db = (env as unknown as { JUDGE_QUOTA?: LedgerDatabase }).JUDGE_QUOTA;
  if (!db) throw Error('Durable judge database binding is missing');
  return updateDurableLedger(db, campaign, work);
}
