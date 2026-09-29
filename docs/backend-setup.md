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
- the question box is shown only in a browser that has opened the map with
  `?preview=ask` (`?preview=off` hides it again).

## Before the public can sign in

1. Own a domain and set up a mail sender for it (any SMTP provider).
2. Authentication, Emails, SMTP Settings: enter the sender's details.
3. Authentication, Emails, Templates, Magic Link: add
   `<p>Your code: {{ .Token }}</p>` so the email carries the six-digit code
   the installed app needs.
4. In Vercel, set `NEXT_PUBLIC_BACKEND_LIVE=1` and `NEXT_PUBLIC_EMAIL_CODE=1`
   and redeploy. The question box then shows for everyone.

## Limits

| Plan | Questions a day |
|---|---|
| Free | 5 |
| Plus | 100 |

Identical questions about the same pass and the same data are answered from
a cache and cost nothing. Limits and model names live in
`supabase/functions/_shared/config.ts`.

## Tests

```bash
cd web && npm test
```
