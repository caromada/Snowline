-- Reports filed by visitors: what someone found on a pass, in their own
-- words and a few taps. Reports are public by nature; who filed them is not.
-- The table itself is closed to the publishable key. Reading goes through a
-- view that carries no user id, and filing goes through the file-report
-- function, which reads the words before anything is shown to anyone.

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  pass_slug text not null check (pass_slug ~ '^[a-z0-9-]{1,80}$'),
  date_observed date not null,

  -- The pipeline's vocabulary (extraction/schema.py), value for value.
  snow_condition text check (snow_condition in ('none', 'patchy', 'continuous', 'deep')),
  traction_used text check (traction_used in ('none', 'microspikes', 'crampons', 'ice_axe', 'spikes_and_axe')),
  crossing_condition text check (crossing_condition in ('dry', 'low', 'knee_high', 'thigh_high', 'dangerous')),
  exposure_comfort text check (exposure_comfort in ('relaxed', 'cautious', 'sketchy', 'terrifying')),

  larches text check (larches in ('not_turning', 'turning', 'peak', 'dropped')),
  wildflowers text check (wildflowers in ('none', 'starting', 'peak', 'fading')),
  mosquitoes text check (mosquitoes in ('none', 'some', 'bad')),
  water_status text check (water_status in ('flowing', 'trickling', 'dry')),
  water_source text check (char_length(water_source) between 1 and 60),

  body text not null default '' check (char_length(body) <= 1000),
  quote_span text check (char_length(quote_span) <= 200),
  -- Named for the report, never for the person: the path is public.
  photo_path text,
  status text not null default 'visible' check (status in ('visible', 'hidden')),
  flag text check (
    flag in ('spam', 'abuse', 'advertisement', 'personal_information', 'not_conditions', 'unreadable')
  ),
  -- Which fields the person set by hand, as opposed to read from their words.
  tapped text[] not null default '{}',
  model text,
  -- The UTC day of filing, the same day the usage ledger counts by.
  filed_day date not null default ((now() at time zone 'utc')::date),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint reports_water_source_needs_status check (water_source is null or water_status is not null),
  constraint reports_photo_is_named_for_the_report
    check (photo_path is null or photo_path = 'published/' || id::text || '.jpg'),
  constraint reports_flagged_are_hidden check (flag is null or status = 'hidden')
);

-- One report per person per pass per day, both ways a day can be meant: the
-- day it was filed and the day they were there.
create unique index reports_one_per_pass_per_filing_day
  on public.reports (user_id, pass_slug, filed_day);
create unique index reports_one_per_pass_per_day_there
  on public.reports (user_id, pass_slug, date_observed);
create index reports_by_pass on public.reports (pass_slug, date_observed desc, created_at desc);

alter table public.reports enable row level security;

-- A check constraint cannot look at the clock, and a count cannot be a
-- constraint at all, so the date window and the daily cap live here. They
-- hold for every writer, the backend included.
create function public.reports_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  today_utc date := (now() at time zone 'utc')::date;
  -- Every pass is in Washington, Oregon or California.
  today_at_the_pass date := (now() at time zone 'America/Los_Angeles')::date;
  filed integer;
begin
  new.filed_day := today_utc;
  new.created_at := now();
  new.updated_at := now();

  if new.date_observed > today_at_the_pass then
    raise exception 'the day at the pass is in the future' using errcode = 'RP001';
  end if;
  if new.date_observed < today_at_the_pass - 30 then
    raise exception 'the day at the pass is more than 30 days back' using errcode = 'RP002';
  end if;

  -- Two filings at once must not both count four and both go in.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text, 0));
  select count(*) into filed
    from public.reports r
    where r.user_id = new.user_id and r.filed_day = today_utc;
  if filed >= 5 then
    raise exception 'five reports already filed today' using errcode = 'RP003';
  end if;

  return new;
end;
$$;

create trigger reports_before_insert
  before insert on public.reports
  for each row execute function public.reports_before_insert();

create function public.reports_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger reports_before_update
  before update on public.reports
  for each row execute function public.reports_before_update();

revoke execute on function public.reports_before_insert() from public, anon, authenticated;
revoke execute on function public.reports_before_update() from public, anon, authenticated;

-- Row policies. A stranger has no policy here at all and no grant either.
create policy "people see their own reports"
  on public.reports for select to authenticated
  using ((select auth.uid()) = user_id);

-- Filing goes through the file-report function, so no role that a browser
-- can hold is granted insert. This policy is the second lock: if insert is
-- ever granted, a person can still file only as themselves.
create policy "people file reports as themselves"
  on public.reports for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- Hiding is one way. A report the backend hid must not be shown again by
-- the person who wrote it.
create policy "people hide their own reports"
  on public.reports for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and status = 'hidden');

create policy "people remove their own reports"
  on public.reports for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Row level security cannot see columns, so the grants do that job. The
-- publishable key gets nothing on the table. A signed-in person may name a
-- row by its id, set its status, and delete it; the policies above keep
-- that to their own rows. No browser role can read user_id.
revoke all on public.reports from anon, authenticated;
grant select (id) on public.reports to authenticated;
grant update (status) on public.reports to authenticated;
grant delete on public.reports to authenticated;

-- What anyone may read. The view runs with its owner's rights on purpose:
-- that is what lets it show reports without granting anyone the table. It
-- has no user_id column, so the question "is this one mine" is answered
-- here as a yes or no about the caller and nothing about anyone else.
-- A person sees their own hidden reports, so they can remove them.
create view public.pass_reports
with (security_invoker = false, security_barrier = true)
as
select
  r.id,
  r.pass_slug,
  r.date_observed,
  r.snow_condition,
  r.traction_used,
  r.crossing_condition,
  r.exposure_comfort,
  r.larches,
  r.wildflowers,
  r.mosquitoes,
  r.water_status,
  r.water_source,
  r.body,
  r.quote_span,
  r.photo_path,
  r.status,
  r.tapped,
  r.created_at,
  coalesce(r.user_id = (select auth.uid()), false) as mine
from public.reports r
where r.status = 'visible'
   or r.user_id = (select auth.uid());

-- A simple view can be written through, with its owner's rights. Reading
-- is the only thing anyone is given.
revoke all on public.pass_reports from anon, authenticated;
grant select on public.pass_reports to anon, authenticated;

-- The ledger behind the question box counts reports too: same table, same
-- daily budget.
alter table public.usage_daily add column reports integer not null default 0;

-- One round trip, one transaction, as record_question: a reading is never
-- counted against the person without also being counted against the day's
-- budget.
create function public.record_report(
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
  insert into public.usage_daily (user_id, day, questions, reports, input_tokens, output_tokens, cost_usd)
  values (p_user, today, 0, 1, p_input_tokens, p_output_tokens, p_cost_usd)
  on conflict (user_id, day) do update set
    reports = public.usage_daily.reports + 1,
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

revoke execute on function public.record_report(uuid, bigint, bigint, numeric)
  from public, anon, authenticated;
grant execute on function public.record_report(uuid, bigint, bigint, numeric)
  to service_role;

-- Photos. The bucket is private: nothing in it has a public address.
-- A person uploads into a folder named for their own id, which only they
-- can read. When a report is published the backend moves its photo to
-- published/<report id>.jpg, a path that names no one, and that copy is
-- readable by whoever can read the report. Readers get a short-lived signed
-- address, so hiding or removing a report takes its photo out of reach
-- within the hour instead of leaving it at a permanent public address.
-- Photos arrive already re-encoded by the browser, always as JPEG.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-photos', 'report-photos', false, 3145728, array['image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "people upload report photos into their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "people read report photos in their own folder"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "people remove report photos from their own folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "anyone reads the photo of a report they can read"
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'report-photos'
    and exists (
      select 1 from public.pass_reports r where r.photo_path = objects.name
    )
  );

create policy "people remove the photo of their own report"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'report-photos'
    and exists (
      select 1 from public.pass_reports r where r.photo_path = objects.name and r.mine
    )
  );
