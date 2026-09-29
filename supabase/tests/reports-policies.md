# Reports: proving the policies after deploy

Run these after `supabase db push` and `supabase functions deploy file-report`.
They use the publishable key alone, which is what a stranger holds. Nothing
here needs a secret. None of this was run by the agent that wrote the
migration: no test of ours may reach the real project.

```bash
export SB=https://uiduywomodjjsrlxtjnr.supabase.co
export KEY=sb_publishable_7J1NtXIO2AuMjVjMw7Ub1Q_mGbl2mhz
```

Every request below sends the key the way the site does:

```bash
alias sb='curl -sS -i -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json"'
```

## Before you start: one visible and one hidden report

Sign in on the site with `?preview=ask` and file two reports on two
different passes:

1. An ordinary one, for example "Dry trail to the top, no snow." It is
   published.
2. One that is plainly not a report, for example "Buy cheap boots at
   example.test". The function saves it hidden and tells you so.

Note the two ids from the SQL editor:

```sql
select id, pass_slug, status, flag from public.reports order by created_at desc limit 2;
```

```bash
export VISIBLE=<id of the first>
export HIDDEN=<id of the second>
```

## 1. A stranger can read visible reports

```bash
sb "$SB/rest/v1/pass_reports?select=*&order=date_observed.desc&limit=5"
```

Expect `200` and a JSON list that includes the visible report. Read the keys
of one row: there is no `user_id`, no `model`, no `flag`, no email. `mine` is
`false` on every row.

## 2. A stranger cannot read user ids

Through the view, the column does not exist:

```bash
sb "$SB/rest/v1/pass_reports?select=user_id"
```

Expect `400` with code `42703` (column does not exist).

The table is closed whole, so every one of these fails the same way:

```bash
sb "$SB/rest/v1/reports?select=*"
sb "$SB/rest/v1/reports?select=user_id"
sb "$SB/rest/v1/reports?select=id"
sb "$SB/rest/v1/reports?select=id&user_id=eq.00000000-0000-0000-0000-000000000000"
```

Expect `401` with code `42501` (permission denied for table reports) on each.
A `200` with `[]` on any of them is a failure: it would mean the table is
granted and only the rows are hidden.

The photo path names the report, not the person. In the output of request 1,
every `photo_path` is either `null` or `published/<the row's own id>.jpg`.

## 3. A stranger cannot read hidden reports

```bash
sb "$SB/rest/v1/pass_reports?id=eq.$HIDDEN"
sb "$SB/rest/v1/pass_reports?status=eq.hidden"
sb "$SB/rest/v1/pass_reports?select=id,status&status=neq.visible"
```

Expect `200` and `[]` on each. Then confirm the row is really there, in the
SQL editor:

```sql
select id, status, flag from public.reports where id = '<HIDDEN>';
```

## 4. A stranger cannot insert, change or remove

Into the table:

```bash
sb -X POST "$SB/rest/v1/reports" -d '{"user_id":"00000000-0000-0000-0000-000000000000","pass_slug":"glen","date_observed":"2026-10-01","body":"test"}'
```

Through the view, which is the one that matters because a plain view can be
written through with its owner's rights unless the grant is taken away:

```bash
sb -X POST "$SB/rest/v1/pass_reports" -d '{"pass_slug":"glen","date_observed":"2026-10-01","body":"test"}'
sb -X PATCH "$SB/rest/v1/pass_reports?id=eq.$VISIBLE" -d '{"body":"changed"}'
sb -X PATCH "$SB/rest/v1/pass_reports?id=eq.$HIDDEN" -d '{"status":"visible"}'
sb -X DELETE "$SB/rest/v1/pass_reports?id=eq.$VISIBLE"
sb -X PATCH "$SB/rest/v1/reports?id=eq.$VISIBLE" -d '{"status":"hidden"}'
sb -X DELETE "$SB/rest/v1/reports?id=eq.$VISIBLE"
```

Expect `401` with code `42501` on every one. Then run request 1 again: the
visible report is still there and its words are unchanged.

## 5. A stranger cannot file through the function or touch the ledger

```bash
sb -X POST "$SB/functions/v1/file-report" -d '{"slug":"glen","date":"2026-10-01","text":"test","taps":{}}'
```

Expect `401` and `{"error":"Sign in to file a report.","code":"signed_out"}`.

```bash
sb -X POST "$SB/rest/v1/rpc/record_report" -d '{"p_user":"00000000-0000-0000-0000-000000000000","p_input_tokens":1,"p_output_tokens":1,"p_cost_usd":1}'
```

Expect `401` with code `42501`. A `204` is a failure: it would mean anyone
can spend the day's budget.

## 6. A stranger cannot upload, and photos have no public address

Make any small JPEG, then:

```bash
curl -sS -i -X POST "$SB/storage/v1/object/report-photos/published/test.jpg" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: image/jpeg" \
  --data-binary @small.jpg
```

Expect `400` or `403` with "new row violates row-level security policy".

```bash
curl -sS -i "$SB/storage/v1/object/public/report-photos/published/$VISIBLE.jpg"
```

Expect `400` or `404` (the bucket is not public), whether or not that report
has a photo.

If the visible report has a photo, a stranger can get a signed address for
it, and cannot for the hidden one:

```bash
sb -X POST "$SB/storage/v1/object/sign/report-photos/published/$VISIBLE.jpg" -d '{"expiresIn":60}'
sb -X POST "$SB/storage/v1/object/sign/report-photos/published/$HIDDEN.jpg" -d '{"expiresIn":60}'
```

Expect `200` with a `signedURL` for the first and `400` or `404` (object not
found) for the second.

## 7. Signed in: only your own

These need your own session token. In the browser where you are signed in,
open the console on the map page and run:

```js
JSON.parse(localStorage.getItem("sb-uiduywomodjjsrlxtjnr-auth-token")).access_token
```

Keep it in your own terminal and do not paste it anywhere else. It expires
within the hour.

```bash
export TOKEN=<paste in your own terminal>
alias me='curl -sS -i -H "apikey: $KEY" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json"'
```

Even signed in, the user id cannot be read:

```bash
me "$SB/rest/v1/reports?select=user_id"
me "$SB/rest/v1/reports?select=*"
```

Expect `403` with code `42501` on both.

Your own reports show as yours, the hidden one included:

```bash
me "$SB/rest/v1/pass_reports?select=id,status,mine&mine=is.true"
```

Expect both ids, one `visible` and one `hidden`.

A report the backend hid cannot be shown again by its filer:

```bash
me -X PATCH "$SB/rest/v1/reports?id=eq.$HIDDEN" -d '{"status":"visible"}'
```

Expect `403` with code `42501` (new row violates row-level security policy).

Nothing but the status can be changed:

```bash
me -X PATCH "$SB/rest/v1/reports?id=eq.$VISIBLE" -d '{"body":"changed"}'
```

Expect `403` with code `42501`.

Filing directly, around the function, is refused:

```bash
me -X POST "$SB/rest/v1/reports" -d '{"user_id":"<your own user id>","pass_slug":"glen","date_observed":"2026-10-01","body":"test"}'
```

Expect `403` with code `42501`.

Someone else's report cannot be removed. This needs a second account, so it
waits until a second person can sign in. With that person's token as `TOKEN`:

```bash
me -X DELETE "$SB/rest/v1/reports?id=eq.$VISIBLE" -H "Prefer: return=representation"
```

Expect `200` and `[]`: no row matched, and request 1 still shows the report.

Last, remove your own two reports, which is also the cleanup:

```bash
me -X DELETE "$SB/rest/v1/reports?id=eq.$HIDDEN"
me -X DELETE "$SB/rest/v1/reports?id=eq.$VISIBLE"
```

Expect `204` on both, and request 1 no longer shows the report.

## 8. The caps, in the SQL editor

The function checks the caps before it reads anything, so the database's own
checks are reached only by a writer that goes around the function. Prove
them where they live. Replace `<uid>` with your user id.

```sql
begin;
insert into public.reports (user_id, pass_slug, date_observed, body)
  values ('<uid>', 'cap-test-1', current_date - 1, 'cap test');
-- The same pass again on the same day of filing:
insert into public.reports (user_id, pass_slug, date_observed, body)
  values ('<uid>', 'cap-test-1', current_date - 2, 'cap test');
rollback;
```

Expect the second insert to fail on `reports_one_per_pass_per_filing_day`.

```sql
begin;
insert into public.reports (user_id, pass_slug, date_observed, body)
  select '<uid>', 'cap-test-' || n, current_date - 1, 'cap test' from generate_series(1, 6) n;
rollback;
```

Expect `five reports already filed today` (code `RP003`). If you filed
reports today already, it fails sooner, which is also correct.

```sql
begin;
insert into public.reports (user_id, pass_slug, date_observed, body)
  values ('<uid>', 'cap-test-1', current_date + 2, 'cap test');
rollback;
```

Expect `the day at the pass is in the future` (code `RP001`).

```sql
begin;
insert into public.reports (user_id, pass_slug, date_observed, body)
  values ('<uid>', 'cap-test-1', current_date - 40, 'cap test');
rollback;
```

Expect `the day at the pass is more than 30 days back` (code `RP002`).
