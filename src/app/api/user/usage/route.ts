import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getBudgetLimits } from '@/lib/budget/limits';
import { getNebiusConfig } from '@/lib/providers/nebius';

export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limits = getBudgetLimits();
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  // Daily turns for this user
  const { data: userEvents } = await supabase
    .from('budget_reservations')
    .select('run_id')
    .eq('user_id', user.id)
    .gte('created_at', dayStart)
    ;

  const distinctRuns = new Set((userEvents || []).map((e: any) => e.run_id));

  // Monthly Tavily credits across all users
  const { data: monthlyEvents } = await supabase
    .from('budget_reservations')
    .select('units')
    
    .gte('created_at', monthStart)
    ;

  const totalMonthlyCredits = (monthlyEvents || []).reduce((acc: number, row: any) => acc + (row.units || 0), 0);

  // User profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  const nebiusConfig = getNebiusConfig();
  const hasTavilyKey = Boolean(process.env.TAVILY_API_KEY);

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      display_name: profile?.display_name || user.user_metadata?.full_name || user.email?.split('@')[0],
      avatar_url: profile?.avatar_url || user.user_metadata?.avatar_url,
    },
    usage: {
      daily_turns_used: distinctRuns.size,
      daily_turns_limit: limits.maxDailyTurnsPerUser,
      monthly_credits_used: totalMonthlyCredits,
      monthly_credits_limit: limits.maxMonthlyTavilyCredits,
    },
    providers: {
      nebius_configured: Boolean(nebiusConfig?.apiKey),
      nebius_model: nebiusConfig?.model || null,
      tavily_configured: hasTavilyKey,
    },
  });
}

