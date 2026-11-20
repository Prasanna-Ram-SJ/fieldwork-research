-- Initial Schema Migration for Research Agent
-- Adheres strictly to BACKEND_SCHEMA.md and TECHNICAL_REQUIREMENTS.md

-- 1. Profiles Table
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (user_id = auth.uid());

create policy "profiles_insert_own" on public.profiles
  for insert with check (user_id = auth.uid());

create policy "profiles_update_own" on public.profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 2. Conversations Table
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint conversations_user_id_id_key unique (id, user_id)
);

create index if not exists idx_conversations_user_last_message 
  on public.conversations (user_id, last_message_at desc);

alter table public.conversations enable row level security;

create policy "conversations_select_own" on public.conversations
  for select using (user_id = auth.uid());

create policy "conversations_insert_own" on public.conversations
  for insert with check (user_id = auth.uid());

create policy "conversations_update_own" on public.conversations
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "conversations_delete_own" on public.conversations
  for delete using (user_id = auth.uid());

-- 3. Research Runs Table (created with nullable message refs first)
create table if not exists public.research_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  user_message_id uuid,
  assistant_message_id uuid,
  status text not null check (status in (
    'queued', 'planning', 'searching', 'evaluating', 'refining', 
    'synthesizing', 'completed', 'insufficient_evidence', 'failed', 
    'quota_exhausted', 'cancelled'
  )),
  model_id text,
  query_plan jsonb,
  error_code text,
  tavily_credits_actual integer not null default 0 check (tavily_credits_actual >= 0),
  nebius_input_tokens integer,
  nebius_output_tokens integer,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  elapsed_ms integer check (elapsed_ms is null or elapsed_ms >= 0),
  constraint fk_runs_conversation foreign key (conversation_id, user_id) 
    references public.conversations(id, user_id) on delete cascade,
  constraint research_runs_user_id_id_key unique (id, user_id)
);

create index if not exists idx_research_runs_user_started 
  on public.research_runs (user_id, started_at desc);

create index if not exists idx_research_runs_conversation_started 
  on public.research_runs (conversation_id, started_at desc);

alter table public.research_runs enable row level security;

create policy "runs_select_own" on public.research_runs
  for select using (user_id = auth.uid());

create policy "runs_insert_own" on public.research_runs
  for insert with check (user_id = auth.uid());

create policy "runs_update_own" on public.research_runs
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "runs_delete_own" on public.research_runs
  for delete using (user_id = auth.uid());

-- 4. Messages Table
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  research_run_id uuid,
  role text not null check (role in ('user', 'assistant')),
  content jsonb not null,
  created_at timestamptz not null default now(),
  constraint fk_messages_conversation foreign key (conversation_id, user_id) 
    references public.conversations(id, user_id) on delete cascade,
  constraint fk_messages_run foreign key (research_run_id, user_id) 
    references public.research_runs(id, user_id) on delete cascade,
  constraint messages_id_user_run_key unique (id, user_id, research_run_id)
);

create index if not exists idx_messages_conversation_created 
  on public.messages (conversation_id, created_at asc);

create index if not exists idx_messages_run_role 
  on public.messages (research_run_id, role);

alter table public.messages enable row level security;

create policy "messages_select_own" on public.messages
  for select using (user_id = auth.uid());

create policy "messages_insert_own" on public.messages
  for insert with check (user_id = auth.uid());

create policy "messages_update_own" on public.messages
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "messages_delete_own" on public.messages
  for delete using (user_id = auth.uid());

-- Add back-references from research_runs to messages
alter table public.research_runs 
  add constraint fk_runs_user_message 
  foreign key (user_message_id) references public.messages(id) on delete set null;

alter table public.research_runs 
  add constraint fk_runs_assistant_message 
  foreign key (assistant_message_id) references public.messages(id) on delete set null;

-- 5. Research Events Table (Durable trace for SSE and reload)
create table if not exists public.research_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  research_run_id uuid not null,
  sequence_no integer not null check (sequence_no > 0),
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint fk_events_run foreign key (research_run_id, user_id) 
    references public.research_runs(id, user_id) on delete cascade,
  constraint uq_events_run_sequence unique (research_run_id, sequence_no)
);

create index if not exists idx_events_run_seq 
  on public.research_events (research_run_id, sequence_no asc);

alter table public.research_events enable row level security;

create policy "events_select_own" on public.research_events
  for select using (user_id = auth.uid());

create policy "events_insert_own" on public.research_events
  for insert with check (user_id = auth.uid());

create policy "events_delete_own" on public.research_events
  for delete using (user_id = auth.uid());

-- 6. Sources Table
create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  research_run_id uuid not null,
  source_ref text not null,
  original_url text not null,
  canonical_url text not null,
  title text not null,
  domain text not null,
  published_at timestamptz,
  snippet text not null,
  tavily_score real,
  query_text text not null,
  selected boolean not null default true,
  created_at timestamptz not null default now(),
  constraint fk_sources_run foreign key (research_run_id, user_id) 
    references public.research_runs(id, user_id) on delete cascade,
  constraint uq_sources_run_ref unique (research_run_id, source_ref),
  constraint uq_sources_run_canonical unique (research_run_id, canonical_url),
  constraint sources_id_user_run_key unique (id, user_id, research_run_id)
);

create index if not exists idx_sources_run_selected 
  on public.sources (research_run_id, selected);

alter table public.sources enable row level security;

create policy "sources_select_own" on public.sources
  for select using (user_id = auth.uid());

create policy "sources_insert_own" on public.sources
  for insert with check (user_id = auth.uid());

create policy "sources_update_own" on public.sources
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "sources_delete_own" on public.sources
  for delete using (user_id = auth.uid());

-- 7. Citations Table
create table if not exists public.citations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  research_run_id uuid not null,
  message_id uuid not null,
  source_id uuid not null,
  claim_index integer not null check (claim_index >= 0),
  created_at timestamptz not null default now(),
  constraint fk_citations_run foreign key (research_run_id, user_id) 
    references public.research_runs(id, user_id) on delete cascade,
  constraint fk_citations_message foreign key (message_id, user_id, research_run_id) 
    references public.messages(id, user_id, research_run_id) on delete cascade,
  constraint fk_citations_source foreign key (source_id, user_id, research_run_id) 
    references public.sources(id, user_id, research_run_id) on delete cascade,
  constraint uq_citations_message_claim_source unique (message_id, claim_index, source_id)
);

alter table public.citations enable row level security;

create policy "citations_select_own" on public.citations
  for select using (user_id = auth.uid());

create policy "citations_insert_own" on public.citations
  for insert with check (user_id = auth.uid());

create policy "citations_delete_own" on public.citations
  for delete using (user_id = auth.uid());

-- 8. Usage Events Table (auditable quota and budget ledger)
create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  research_run_id uuid not null,
  service text not null check (service in ('nebius', 'tavily')),
  operation text not null check (operation in ('planner', 'search', 'refinement', 'synthesis')),
  units integer not null check (units >= 0),
  status text not null check (status in ('reserved', 'succeeded', 'failed', 'released')),
  provider_request_id text,
  created_at timestamptz not null default now(),
  constraint fk_usage_run foreign key (research_run_id, user_id) 
    references public.research_runs(id, user_id) on delete cascade
);

create index if not exists idx_usage_service_created 
  on public.usage_events (service, created_at);

create index if not exists idx_usage_user_created 
  on public.usage_events (user_id, created_at);

alter table public.usage_events enable row level security;

create policy "usage_select_own" on public.usage_events
  for select using (user_id = auth.uid());

create policy "usage_insert_own" on public.usage_events
  for insert with check (user_id = auth.uid());

create policy "usage_update_own" on public.usage_events
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 9. Atomic Quota and Budget Reservation RPC
-- Ensures atomic checks against global monthly cap and per-user daily turn cap
create or replace function public.reserve_research_turn(
  p_user_id uuid,
  p_research_run_id uuid,
  p_estimated_tavily_credits integer default 3,
  p_max_monthly_credits integer default 800,
  p_max_daily_user_turns integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_daily_turns_used integer;
  v_monthly_credits_used integer;
  v_now_utc timestamptz := timezone('UTC', now());
  v_month_start timestamptz := date_trunc('month', v_now_utc);
  v_day_start timestamptz := date_trunc('day', v_now_utc);
begin
  -- Enforce user authentication
  if auth.uid() is null or auth.uid() <> p_user_id then
    return jsonb_build_object(
      'allowed', false, 
      'reason', 'unauthorized', 
      'message', 'User identity mismatch or unauthenticated'
    );
  end if;

  -- 1. Check user daily turn quota (5 turns per UTC day)
  select count(distinct research_run_id)
  into v_daily_turns_used
  from public.usage_events
  where user_id = p_user_id
    and created_at >= v_day_start
    and status in ('reserved', 'succeeded');

  if v_daily_turns_used >= p_max_daily_user_turns then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'daily_turn_limit_reached',
      'message', format('Daily limit of %s research turns reached. Resets at UTC midnight.', p_max_daily_user_turns),
      'daily_used', v_daily_turns_used,
      'daily_limit', p_max_daily_user_turns
    );
  end if;

  -- 2. Check global monthly Tavily credit cap (800 credits / calendar month)
  select coalesce(sum(units), 0)
  into v_monthly_credits_used
  from public.usage_events
  where service = 'tavily'
    and created_at >= v_month_start
    and status in ('reserved', 'succeeded');

  if (v_monthly_credits_used + p_estimated_tavily_credits) > p_max_monthly_credits then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'monthly_budget_exhausted',
      'message', format('Global application budget cap reached (%s/%s credits). Resets next month.', v_monthly_credits_used, p_max_monthly_credits),
      'monthly_used', v_monthly_credits_used,
      'monthly_limit', p_max_monthly_credits
    );
  end if;

  -- 3. Reserve units atomically in usage_events
  insert into public.usage_events (
    user_id,
    research_run_id,
    service,
    operation,
    units,
    status
  ) values (
    p_user_id,
    p_research_run_id,
    'tavily',
    'search',
    p_estimated_tavily_credits,
    'reserved'
  );

  return jsonb_build_object(
    'allowed', true,
    'daily_used', v_daily_turns_used + 1,
    'daily_limit', p_max_daily_user_turns,
    'monthly_used', v_monthly_credits_used + p_estimated_tavily_credits,
    'monthly_limit', p_max_monthly_credits
  );
end;
$$;

-- 10. Reconcile Usage RPC
-- Adjusts reserved credits to actual credits or releases reservations on failure
create or replace function public.reconcile_research_usage(
  p_user_id uuid,
  p_research_run_id uuid,
  p_actual_tavily_credits integer,
  p_nebius_input_tokens integer default null,
  p_nebius_output_tokens integer default null,
  p_status text default 'succeeded'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Unauthorized';
  end if;

  -- Update reserved Tavily usage row
  update public.usage_events
  set units = p_actual_tavily_credits,
      status = case when p_status = 'succeeded' then 'succeeded' else 'failed' end
  where research_run_id = p_research_run_id
    and user_id = p_user_id
    and service = 'tavily'
    and status = 'reserved';

  -- Record Nebius token usage if provided
  if p_nebius_input_tokens is not null or p_nebius_output_tokens is not null then
    insert into public.usage_events (
      user_id,
      research_run_id,
      service,
      operation,
      units,
      status
    ) values (
      p_user_id,
      p_research_run_id,
      'nebius',
      'synthesis',
      coalesce(p_nebius_input_tokens, 0) + coalesce(p_nebius_output_tokens, 0),
      case when p_status = 'succeeded' then 'succeeded' else 'failed' end
    );
  end if;
end;
$$;
