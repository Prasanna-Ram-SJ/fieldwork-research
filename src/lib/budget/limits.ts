import { SupabaseClient } from '@supabase/supabase-js';
export interface BudgetLimits {
    maxMonthlyTavilyCredits: number;
    maxDailyTurnsPerUser: number;
    maxSearchesPerTurn: number;
}
function bounded(value: string | undefined, fallback: number, max: number) { const n = Number(value); return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : fallback; }
export function getBudgetLimits(): BudgetLimits { return { maxMonthlyTavilyCredits: bounded(process.env.MAX_TAVILY_CREDITS_MONTHLY, 800, 800), maxDailyTurnsPerUser: bounded(process.env.MAX_RESEARCH_TURNS_PER_USER_DAY, 10, 10), maxSearchesPerTurn: 3 }; }
export interface ReservationResult {
    allowed: boolean;
    reason?: string;
    message?: string;
    daily_used?: number;
    daily_limit?: number;
    monthly_used?: number;
    monthly_limit?: number;
}
export async function reserveBudget(supabase: SupabaseClient, userId: string, runId: string, _estimate = 3): Promise<ReservationResult> {
    const limits = getBudgetLimits();
    const { data, error } = await supabase.rpc('reserve_research_turn', { p_user_id: userId, p_research_run_id: runId, p_estimated_tavily_credits: 3, p_max_monthly_credits: limits.maxMonthlyTavilyCredits, p_max_daily_user_turns: limits.maxDailyTurnsPerUser });
    if (error || !data || typeof data.allowed !== 'boolean')
        return { allowed: false, reason: 'budget_unavailable', message: 'Usage protection is unavailable. Apply both database migrations before trying again.' };
    return data;
}
// Reservations intentionally remain at the maximum cost. Client-accessible refunds
// would allow quota bypass. Actual provider usage is recorded on research_runs.
export async function reconcileBudget(_supabase: SupabaseClient, _userId: string, _runId: string, _credits: number, _tokens?: {
    input: number;
    output: number;
}, _succeeded = true): Promise<void> { }
