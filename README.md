# highscores

Leaderboards for daily "-dle" games. Paste your result, climb the table. See [PLAN.md](PLAN.md) for the design.

## Supabase setup (one time)

1. Create a free project at [supabase.com](https://supabase.com) and note its **project ref** (the `xxxx` in `https://xxxx.supabase.co`).
2. Log in and link the repo:
   ```sh
   npx supabase login
   npx supabase link --project-ref <project-ref>
   ```
3. Apply the schema and push the auth/API settings (sign-ups disabled, 500-row cap):
   ```sh
   npx supabase db push
   npx supabase config push
   ```
4. Create the admin account: Dashboard → **Authentication → Users → Add user** (email + a strong password, "Auto confirm" on). Then in **SQL Editor**:
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'you@example.com';
   ```
5. Dashboard → **Advisors → Security Advisor** should report no errors.

Admins can only be added through the SQL Editor. The API can't do it.

## Web app (local development)

```sh
cd web
cp .env.example .env.local   # fill in the project URL and the *publishable* key
npm install
npm run dev                  # http://localhost:5173/highscores/
```

`npm run build` type-checks and builds to `web/dist`. The production build adds a strict Content-Security-Policy `<meta>` tag. `npm run lint` bans `dangerouslySetInnerHTML`.

The shared parser lives in `supabase/functions/_shared/` and is imported by both the web app (`@shared/…`) and the Edge Function.

## Deploy (GitHub Pages)

Pushing to `master` builds and deploys the site (`.github/workflows/deploy.yml`). One-time setup in the GitHub repo:

1. **Settings → Pages → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables**: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` (the *publishable* key). These are public values, so they're Variables, not Secrets.
3. **Settings → Advanced Security**: enable *Secret Protection* (secret scanning + push protection) and *Dependabot alerts*.

`keepalive.yml` pings Supabase daily so the free project never pauses. GitHub disables scheduled workflows after 60 days without repo activity, so re-enable it in the Actions tab if that happens.

Database migrations and the Edge Function are deployed manually:

```sh
npx supabase db push
npx supabase functions deploy submit-run --use-api
```
