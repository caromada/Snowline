-- Watches: a person asks to hear when one pass changes in one named way.
-- This is the table and its rules only. Nothing reads it to send anything
-- yet; delivery waits for a mail sender.
--
-- Row level security is on. People read, add, and remove only their own
-- watches, and may change only the end date. What the backend last saw and
-- when it last sent a notice are the backend's to write.

create table public.watches (
  user_id uuid not null references auth.users (id) on delete cascade,
  pass_slug text not null check (pass_slug ~ '^[a-z0-9-]{1,80}$'),
  kind text not null check (
    kind in ('any_change', 'snow_free', 'new_snow', 'fire_nearby', 'road_restriction')
  ),
  -- The last day the watch is in force, by UTC date. Null watches until removed.
  until_date date,
  -- The verdict the backend last compared against, such as snow_caution.
  last_verdict text check (last_verdict is null or last_verdict ~ '^[a-z_]{1,40}$'),
  last_notified_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, pass_slug, kind),
  check (until_date is null or until_date >= (created_at at time zone 'utc')::date)
);

-- The primary key serves every lookup by person. Delivery will ask the
-- other question: who watches this pass, and for what.
create index watches_pass_kind_idx on public.watches (pass_slug, kind);

alter table public.watches enable row level security;

create policy "people read their own watches"
  on public.watches for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "people add watches for themselves"
  on public.watches for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "people change their own watches"
  on public.watches for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "people remove their own watches"
  on public.watches for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Row level security cannot see columns, so the grants do that job: a
-- person names the pass, the kind and the end date, and afterwards may move
-- only the end date. last_verdict and last_notified_at stay out of reach.
revoke insert, update, delete on public.watches from anon, authenticated;
grant insert (user_id, pass_slug, kind, until_date) on public.watches to authenticated;
grant update (until_date) on public.watches to authenticated;
grant delete on public.watches to authenticated;

-- The most watches one person may hold: 20 on the free plan, 200 on plus.
-- Every row counts, including one whose end date has passed, until it is
-- removed. The same numbers are in supabase/functions/_shared/config.ts and
-- a test holds the two together.
create function public.enforce_watch_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  person_plan text;
  held integer;
  allowed integer;
begin
  -- Two inserts by one person take turns here, so both cannot count the
  -- same last free place. The lock is released when the transaction ends.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('public.watches:' || new.user_id::text, 0)
  );

  select plan into person_plan from public.profiles where id = new.user_id;
  allowed := case when person_plan = 'plus' then 200 else 20 end;

  select count(*) into held from public.watches where user_id = new.user_id;
  if held >= allowed then
    raise exception 'This account holds % watches, the most its plan allows.', held
      using errcode = 'check_violation',
            hint = 'Each watch removed frees one place.';
  end if;
  return new;
end;
$$;

create trigger watches_cap
  before insert on public.watches
  for each row execute function public.enforce_watch_cap();

revoke execute on function public.enforce_watch_cap() from public, anon, authenticated;
