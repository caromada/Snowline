# Policy checks for `watches`

Run these after `supabase db push` has applied
`20260929120000_watches.sql`. They prove that a stranger, holding only the
publishable key that ships in the site, cannot read or write the table.

The key is the public one from `web/lib/backend.ts`. Nothing here needs a
secret, and nothing here signs in.

```bash
URL=https://uiduywomodjjsrlxtjnr.supabase.co
KEY=sb_publishable_7J1NtXIO2AuMjVjMw7Ub1Q_mGbl2mhz
```

## As a stranger

| # | Check | Expected |
|---|---|---|
| 1 | Read every row | `200` and `[]` |
| 2 | Insert a row | Refused, `401`, code `42501` |
| 3 | Insert a row with the backend's columns | Refused, `401`, code `42501` |
| 4 | Change rows | Refused, `401`, code `42501` |
| 5 | Remove rows | Refused, `401`, code `42501` |
| 6 | Call the cap function | `404`, code `PGRST202` |
| 7 | Read again | `200` and `[]` |

1. Read returns empty. A `404` with code `PGRST205` here means the table
   does not exist yet, not that the policy works.

```bash
curl -s -i "$URL/rest/v1/watches?select=*" -H "apikey: $KEY"
```

2. Insert is refused.

```bash
curl -s -i -X POST "$URL/rest/v1/watches" \
  -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d '{"user_id":"00000000-0000-0000-0000-000000000001","pass_slug":"glen","kind":"snow_free"}'
```

3. Insert that also sets what only the backend may write is refused.

```bash
curl -s -i -X POST "$URL/rest/v1/watches" \
  -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d '{"user_id":"00000000-0000-0000-0000-000000000001","pass_slug":"glen","kind":"snow_free","last_verdict":"open","last_notified_at":"2026-09-29T00:00:00Z"}'
```

4. Update is refused.

```bash
curl -s -i -X PATCH "$URL/rest/v1/watches?pass_slug=eq.glen" \
  -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d '{"until_date":"2027-01-01"}'
```

5. Delete is refused.

```bash
curl -s -i -X DELETE "$URL/rest/v1/watches?pass_slug=eq.glen" -H "apikey: $KEY"
```

6. The cap function cannot be called from outside.

```bash
curl -s -i -X POST "$URL/rest/v1/rpc/enforce_watch_cap" \
  -H "apikey: $KEY" -H "Content-Type: application/json" -d '{}'
```

7. Read again, to confirm none of the writes above left a row behind.

```bash
curl -s -i "$URL/rest/v1/watches?select=*" -H "apikey: $KEY"
```

If a refusal comes back as `403` rather than `401`, the row was still
refused. What matters in checks 2 to 5 is that the status is not `200`,
`201` or `204`, and that check 7 is still empty.

## As a signed-in person

These need a real session, so they were not run when this file was written.
They run in the dashboard's SQL editor, inside a transaction that is rolled
back, so they leave nothing behind. Each block acts as the first account on
file. Where a statement is expected to fail, the editor stops there; a
transaction that has failed cannot commit, so nothing is kept either way.

A person reads and writes their own rows, and cannot write for anyone else.
The second insert is expected to fail with a row level security error.

```sql
begin;
select set_config('request.jwt.claims',
  json_build_object('role', 'authenticated',
    'sub', (select id from auth.users order by created_at limit 1))::text, true);
set local role authenticated;
insert into public.watches (user_id, pass_slug, kind)
  values ((select auth.uid()), 'policy-check', 'snow_free');
select count(*) as mine from public.watches where pass_slug = 'policy-check';
insert into public.watches (user_id, pass_slug, kind)
  values ('00000000-0000-0000-0000-000000000001', 'policy-check', 'snow_free');
rollback;
```

A person cannot write the backend's columns. Expected: permission denied
for table watches.

```sql
begin;
select set_config('request.jwt.claims',
  json_build_object('role', 'authenticated',
    'sub', (select id from auth.users order by created_at limit 1))::text, true);
set local role authenticated;
insert into public.watches (user_id, pass_slug, kind, last_verdict)
  values ((select auth.uid()), 'policy-check', 'snow_free', 'open');
rollback;
```

The cap holds. On a free account with no watches, the first statement adds
20 rows and the second is refused with "This account holds 20 watches, the
most its plan allows."

```sql
begin;
select set_config('request.jwt.claims',
  json_build_object('role', 'authenticated',
    'sub', (select id from auth.users order by created_at limit 1))::text, true);
set local role authenticated;
insert into public.watches (user_id, pass_slug, kind)
  select (select auth.uid()), 'cap-check-' || n, 'any_change'
  from generate_series(1, 20) as n;
insert into public.watches (user_id, pass_slug, kind)
  values ((select auth.uid()), 'cap-check-21', 'any_change');
rollback;
```
