-- Trip plans: what a person typed and how it was read, so they can reopen
-- their recent plans, and a cache so an identical request costs nothing.
-- The posture of the accounts migration, unchanged: row level security on
-- every table, people reach only their own rows, and the cache and the
-- counters are written by the backend alone.

create table public.trip_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 400),
  -- The trip as read: passes in travel order, dates, activity, party size,
  -- and the place names that matched nothing. Conditions are not stored;
  -- the page builds them from the day's data each time a plan is opened.
  trip jsonb not null,
  data_date date not null,
  created_at timestamptz not null default now()
);

create index trip_plans_recent on public.trip_plans (user_id, created_at desc);

alter table public.trip_plans enable row level security;

create policy "people read their own trip plans"
  on public.trip_plans for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "people remove their own trip plans"
  on public.trip_plans for delete to authenticated
  using ((select auth.uid()) = user_id);

-- A plan is written only after the backend has read the text and counted
-- it against the day's limits, so nobody inserts or edits one directly.
revoke insert, update on public.trip_plans from anon, authenticated;
revoke all on public.trip_plans from anon;

-- Fifty plans a person, the oldest dropped as new ones arrive.
create function public.trim_trip_plans()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.trip_plans
  where user_id = new.user_id
    and id not in (
      select id from public.trip_plans
      where user_id = new.user_id
      order by created_at desc, id desc
      limit 50
    );
  return null;
end;
$$;

create trigger trip_plans_cap
  after insert on public.trip_plans
  for each row execute function public.trim_trip_plans();

create table public.trip_cache (
  key text primary key check (key ~ '^[0-9a-f]{64}$'),
  text text not null,
  today date not null,
  data_date date not null,
  trip jsonb not null,
  model text not null,
  created_at timestamptz not null default now()
);

alter table public.trip_cache enable row level security;

alter table public.usage_daily
  add column plans integer not null default 0;

-- One round trip, one transaction: a plan is never counted against the
-- person without also being counted against the day's budget, which it
-- shares with questions.
create function public.record_plan(
  p_user uuid,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_cost_usd numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'utc')::date;
begin
  insert into public.usage_daily (user_id, day, plans, input_tokens, output_tokens, cost_usd)
  values (p_user, today, 1, p_input_tokens, p_output_tokens, p_cost_usd)
  on conflict (user_id, day) do update set
    plans = public.usage_daily.plans + 1,
    input_tokens = public.usage_daily.input_tokens + excluded.input_tokens,
    output_tokens = public.usage_daily.output_tokens + excluded.output_tokens,
    cost_usd = public.usage_daily.cost_usd + excluded.cost_usd;

  insert into public.llm_spend_daily (day, calls, cost_usd)
  values (today, 1, p_cost_usd)
  on conflict (day) do update set
    calls = public.llm_spend_daily.calls + 1,
    cost_usd = public.llm_spend_daily.cost_usd + excluded.cost_usd;
end;
$$;

revoke execute on function public.record_plan(uuid, bigint, bigint, numeric)
  from public, anon, authenticated;
grant execute on function public.record_plan(uuid, bigint, bigint, numeric)
  to service_role;
revoke execute on function public.trim_trip_plans() from public, anon, authenticated;
