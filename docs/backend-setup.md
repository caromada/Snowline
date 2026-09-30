# Backend setup

The backend is one Supabase project: sign-in, a small database, and the
functions that call the language model. The site stays a static export.

Project: `uiduywomodjjsrlxtjnr` (`https://uiduywomodjjsrlxtjnr.supabase.co`)

## What lives where

| Piece | Where | Secret? |
|---|---|---|
| Project address and publishable key | `web/lib/backend.ts` | No. They are public by design; row level security decides what a caller may touch. |
| Database tables and policies | `supabase/migrations/` | No |
| Pass question endpoint | `supabase/functions/ask-pass/` | No |
| `ANTHROPIC_API_KEY` | Supabase function secrets | Yes. Never in the repo, the site, or a chat. |
| Secret (service role) key | Injected by Supabase into functions | Yes. Never copied anywhere. |

## One-time setup

Install the Supabase command line tool and sign in. The sign-in opens a
browser; it is your login, so do this step yourself.

```bash
brew install supabase/tap/supabase
```

```bash
supabase login
```

```bash
supabase link --project-ref uiduywomodjjsrlxtjnr
```

Create the tables.

```bash
supabase db push
```

Set the function secrets. Paste the key at the prompt in your own terminal.
`SITE_URL` is where the function reads pass data from. `LLM_BUDGET_USD` is
the most the question box may spend in one day; questions pause once it is
reached.

```bash
supabase secrets set ANTHROPIC_API_KEY
```

```bash
supabase secrets set SITE_URL=https://spr-me-599cefb9.vercel.app LLM_BUDGET_USD=5
```

Deploy the function.

```bash
supabase functions deploy ask-pass
```

## Sign-in by email

In the Supabase dashboard, under Authentication, URL Configuration: set the
Site URL to the live site and add `https://spr-me-599cefb9.vercel.app/map/`
to the redirect list. The sign-in email carries a link that lands there.

The built-in mail service delivers only to the project owner's address and
does not allow template changes, so until a custom sender is set up:

- only the owner can sign in, and
- the question box and the account menu are shown only in a browser that
  has opened the map with `?preview=ask` (`?preview=off` hides them again).

## Before the public can sign in

1. Own a domain and set up a mail sender for it (any SMTP provider).
2. Authentication, Emails, SMTP Settings: enter the sender's details.
3. Authentication, Emails, Templates, Magic Link: add
   `<p>Your code: {{ .Token }}</p>` so the email carries the six-digit code
   the installed app needs.
4. In Vercel, set `NEXT_PUBLIC_BACKEND_LIVE=1` and `NEXT_PUBLIC_EMAIL_CODE=1`
   and redeploy. The question box and the account menu then show for
   everyone.

## Limits

| Plan | Questions a day |
|---|---|
| Free | 5 |
| Plus | 100 |

Identical questions about the same pass and the same data are answered from
a cache and cost nothing. Limits and model names live in
`supabase/functions/_shared/config.ts`.

| Plan | Watches held at once |
|---|---|
| Free | 20 |
| Plus | 200 |

The database enforces the watch limit itself, in the `watches` migration.
A test keeps the numbers there and in the config the same.

## Saved passes and the account

Saved passes stay in the browser, as before. Signed in, the list is also
kept in `saved_passes`, and the two are merged by the rules in
`web/lib/savedSync.ts`. The account holds no record of passes that were
removed. Each device remembers, under `snowline:saved-sync`, the rows it
last saw and the changes it has yet to send.

## Watches

`watches` holds what a person has asked to hear about. Nothing sends
notices yet. `supabase/functions/_shared/watches.ts` decides which watches
fire between two daily exports of a pass and writes the sentence for each.

After applying a migration, run the checks in `supabase/tests/policies.md`.

## Reports

Visitors file what they found on a pass: their words, a few taps, one
photo. The pieces, in the order to deploy them:

1. The table, the public view, the photo bucket and their policies
   (`supabase/migrations/20261001000000_reports.sql`). It also adds a
   `reports` count to the usage ledger.

   ```bash
   supabase db push
   ```

2. The function that files a report. It needs no new secrets: it uses the
   same `ANTHROPIC_API_KEY`, `SITE_URL` and `LLM_BUDGET_USD` as the question
   box, and spends from the same daily budget.

   ```bash
   supabase functions deploy file-report
   ```

3. Prove the policies with the publishable key, request by request:
   `supabase/tests/reports-policies.md`. Do this before step 4.

4. Push the site. Reports show wherever the question box shows: behind
   `?preview=ask` until `NEXT_PUBLIC_BACKEND_LIVE=1` is set.

The database comes first because the function writes to the table and the
site reads the view; deployed in any other order, the newer piece fails
until the older one arrives.

| Limit | Value | Held by |
|---|---|---|
| Reports a person may file in a day (UTC) | 5 | the function, then a database trigger |
| Reports per person per pass per day | 1 | the function, then two unique indexes |
| How far back the day at the pass may be | 30 days, never the future | the function, then a database trigger |
| Their words | 1,000 characters | the form, the function, a check constraint |
| Water source name | 60 characters | the form, the function, a check constraint |
| Photo as chosen | 15 MB | the form, before the file is read |
| Photo as uploaded | 3 MB, JPEG only | the bucket |
| Model spend a day | `LLM_BUDGET_USD`, shared with questions | the function |

Who filed a report is never readable with the publishable key. The table is
closed to it; the view has no user id; a published photo is stored under the
report's id, not the person's.

Reports do not feed the verdict.

## Trip planner

Someone types a trip and gets one page: every pass on it with its verdict
and evidence. The language model does one thing, which is to choose among
passes that code found in the text and to resolve the dates. Code builds
the page from the exported pass files, so the model writes none of it. The
pieces, in the order to deploy them:

1. The tables (`supabase/migrations/20261002000000_trip_plans.sql`):
   `trip_plans`, which a person reads and removes their own rows from and
   which keeps their newest 50; `trip_cache`, written by the backend alone;
   a `plans` count on the usage ledger; and `record_plan`.

   ```bash
   supabase db push
   ```

2. The function. It needs no new secrets: it uses the same
   `ANTHROPIC_API_KEY`, `SITE_URL` and `LLM_BUDGET_USD` as the question box,
   and spends from the same daily budget.

   ```bash
   supabase functions deploy plan-trip
   ```

3. Push the site. It carries `web/public/data/places.json`, which the
   function reads from `SITE_URL` beside `passes.json`, and `routes.json`
   when that file exists. The function works without either; it then places
   only trips that name their passes. The planner shows wherever the
   question box shows: behind `?preview=ask` until
   `NEXT_PUBLIC_BACKEND_LIVE=1` is set.

The database comes first because the function writes to it; the function
comes before the site because the site calls it.

`places.json` lists named trailheads and campgrounds with the passes near
each. It depends only on the gazetteer and the access snapshot, so it is
rebuilt when either changes, not daily:

```bash
python -m scripts.build_trip_places
```

| Plan | Trip plans a day (UTC) |
|---|---|
| Free | 2 |
| Plus | 30 |

| Limit | Value | Held by |
|---|---|---|
| The typed text | 400 characters | the form, the function, a check constraint |
| Passes the model is shown | 40 | the function |
| Passes on one plan | 20 | the function |
| Plans kept per person | 50, oldest dropped | a database trigger |
| Model spend a day | `LLM_BUDGET_USD`, shared with questions | the function |

An identical request on the same day against the same data is answered
from the cache: it costs nothing and does not count against the day. A text
that names no pass, route, trailhead or campground never reaches the model,
and does not count either.

A plan's link carries its id and nothing else. Anyone signed in who holds
the link can open it and sees the passes and dates; the text that was typed
goes back only to the person who typed it. This path goes through the
function, not through the table's policies, which stay own rows only. To
make links private to their owner, have the function answer 404 when
`row.user_id` is not the caller's.

## Tests

```bash
cd web && npm test
```

```bash
python -m pytest tests/test_places.py
```
