-- Raise daily research from 5 to 10. Existing reservations and the 800-credit shared monthly cap are preserved.
create or replace function public.reserve_research_turn(p_user_id uuid,p_research_run_id uuid,p_estimated_tavily_credits integer default 3,p_max_monthly_credits integer default 800,p_max_daily_user_turns integer default 10)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_daily integer; v_monthly integer;
 v_day timestamptz := date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
 v_month timestamptz := date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
 v_daily_limit integer := greatest(1,least(coalesce(p_max_daily_user_turns,10),10));
 v_month_limit integer := greatest(1,least(coalesce(p_max_monthly_credits,800),800));
begin
 if auth.uid() is null or auth.uid() <> p_user_id then raise exception 'Unauthorized'; end if;
 if not exists(select 1 from public.research_runs where id=p_research_run_id and user_id=p_user_id) then raise exception 'Unknown research run'; end if;
 -- Serialize the shared budget check and reservation across all users.
 perform pg_advisory_xact_lock(6433821029);
 if exists(select 1 from public.budget_reservations where run_id=p_research_run_id) then
  return jsonb_build_object('allowed',false,'reason','already_reserved','message','This research run has already reserved capacity.');
 end if;
 select count(*) into v_daily from public.budget_reservations where user_id=p_user_id and created_at>=v_day;
 select coalesce(sum(units),0) into v_monthly from public.budget_reservations where created_at>=v_month;
 if v_daily>=v_daily_limit then return jsonb_build_object('allowed',false,'reason','daily_limit','message','Daily research allowance reached. Resets at 00:00 UTC.'); end if;
 if v_monthly+3>v_month_limit then return jsonb_build_object('allowed',false,'reason','monthly_limit','message','Monthly search capacity is exhausted. Resets on the first of the month at 00:00 UTC.'); end if;
 insert into public.budget_reservations(run_id,user_id) values(p_research_run_id,p_user_id);
 return jsonb_build_object('allowed',true,'daily_used',v_daily+1,'daily_limit',v_daily_limit);
end;
$$;
revoke all on function public.reserve_research_turn(uuid,uuid,integer,integer,integer) from public,anon;
grant execute on function public.reserve_research_turn(uuid,uuid,integer,integer,integer) to authenticated;
