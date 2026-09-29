-- Accounts, saved passes, and the ledgers behind the pass question box.
-- Every table has row level security on. People can read and change only
-- their own rows; usage, spend and the answer cache are written by the
-- backend alone.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'plus')),
  activities text[] not null default '{}',
  camping boolean not null default false,
  home_lat double precision,
  home_lon double precision,
  max_drive_mi integer check (max_drive_mi is null or max_drive_mi between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "people read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "people update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- The plan is what someone pays for; it must never be theirs to edit. Row
-- level security cannot see columns, so the grant does that job.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (activities, camping, home_lat, home_lon, max_drive_mi)
  on public.profiles to authenticated;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.saved_passes (
  user_id uuid not null references auth.users (id) on delete cascade,
  pass_slug text not null check (pass_slug ~ '^[a-z0-9-]{1,80}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, pass_slug)
);

alter table public.saved_passes enable row level security;

create policy "people read their own saved passes"
  on public.saved_passes for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "people save passes for themselves"
  on public.saved_passes for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "people remove their own saved passes"
  on public.saved_passes for delete to authenticated
  using ((select auth.uid()) = user_id);

create table public.usage_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  questions integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  primary key (user_id, day)
);

alter table public.usage_daily enable row level security;

create policy "people read their own usage"
  on public.usage_daily for select to authenticated
  using ((select auth.uid()) = user_id);

create table public.llm_spend_daily (
  day date primary key,
  calls integer not null default 0,
  cost_usd numeric(12, 6) not null default 0
);

alter table public.llm_spend_daily enable row level security;

create table public.answers_cache (
  key text primary key check (key ~ '^[0-9a-f]{64}$'),
  pass_slug text not null,
  eval_date date not null,
  question text not null,
  answer jsonb not null,
  model text not null,
  created_at timestamptz not null default now()
);

alter table public.answers_cache enable row level security;

-- One round trip, one transaction: a question is never counted against the
-- person without also being counted against the day's budget.
create function public.record_question(
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
  insert into public.usage_daily (user_id, day, questions, input_tokens, output_tokens, cost_usd)
  values (p_user, today, 1, p_input_tokens, p_output_tokens, p_cost_usd)
  on conflict (user_id, day) do update set
    questions = public.usage_daily.questions + 1,
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

revoke execute on function public.record_question(uuid, bigint, bigint, numeric)
  from public, anon, authenticated;
grant execute on function public.record_question(uuid, bigint, bigint, numeric)
  to service_role;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
