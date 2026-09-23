# Highscores — plan

A website where a friend group pastes results from daily "-dle" games (Wordle, Ordel, RNGdle, Krillion, …) and competes on per-game leaderboards.

## Decisions

| Area | Decision |
|---|---|
| Hosting | Static React site on **GitHub Pages** + **Supabase** free tier (Postgres, Auth, Edge Functions). Everything free. |
| Users | Friend group, **no login** in v1. Free-text username with autocomplete, remembered in `localStorage`, matched case-insensitively. Schema is ready for real accounts later. |
| Admin | One (or a few) Supabase Auth accounts, **TOTP MFA required**: RLS and the Edge Function only accept admin writes from an `aal2` session. Only admins create/edit/delete games and edit/delete runs (deleting a run lets the player resubmit) and backfill old runs. |
| Games | Defined by the admin in a config form. **Build from sample**: paste a result, click the puzzle number and the score (or one score line), and the regexes are generated. Presets for known games, live tester, and hand-editable regex for power users. |
| Score types | Guesses `X/N` (lower wins, `X` = fail), plain number (admin picks direction), ranked tiers (admin lists tiers in order), time `mm:ss` (lower wins). Optional min/max limits. **Multi-score pastes** (e.g. Pokedle's four modes) are summed via a second `score_regex`, with a required match count. |
| Puzzle identity | Either a number extracted from the paste (Wordle `1,922`, Ordel `#1727`) or **by date** with a per-game reset time and timezone (RNGdle: 00:00 UTC). |
| Paste display | Full paste stored (normalized: shortcodes like `:large_green_square:` converted to emoji, control/bidi characters stripped) and shown on leaderboards. |
| Duplicates | One run per player per puzzle. Second paste is rejected with "already submitted". |
| Old puzzles | Players may submit today's or yesterday's puzzle only. Admin can backfill anything. |
| Per-puzzle ranking | By score; ties broken by **earliest submission** (no shared places). Fails always rank last. |
| Points | F1 table per puzzle: 25, 18, 15, 12, 10, 8, 6, 4, 2, 1; 11th+ = 0. **Fails never score.** |
| All-time table | Sum of points per game. |
| Extras in v1 | Player profiles, cross-game "Grand Prix" total, paste auto-detect on the home page. |
| UI language | English. Default timezone `Europe/Stockholm`. |

## Architecture

```
Browser (GitHub Pages, React + Vite + TS)
  ├── reads  ──► Supabase Postgres (anon key, RLS: public SELECT)
  ├── submit ──► Edge Function `submit-run` (parses + validates, writes with service role)
  └── admin  ──► Supabase Auth login → direct CRUD, allowed by RLS admin policies
```

- Parsing lives in shared TypeScript modules (`supabase/functions/_shared/`) used by the browser (instant preview) and the Edge Function (authoritative). Both run the same JS `RegExp`, so behavior is identical.
- Anonymous users can never write tables directly, so scores can't be forged from the console. Every run goes through `submit-run`, which re-parses the raw paste.
- The anon key in the frontend bundle is public by design; RLS is the security boundary.

## Data model

```sql
games (
  id uuid pk, slug text unique, name text, url text,
  score_type text check in ('guesses','number','tiers','time'),
  higher_is_better bool,          -- guesses/time: false; number: admin choice; tiers: true
  max_guesses int null,           -- guesses only, e.g. 6
  tiers text[] null,              -- tiers only, worst → best
  min_score numeric null, max_score numeric null,  -- optional limits, e.g. Krillion max 700
  score_regex text null, score_count int null,      -- sum every (?<score>) match; require N matches
  parse_regex text,               -- named groups: puzzle?, score, fail?
  puzzle_source text check in ('paste','date'),
  anchor_puzzle int null, anchor_date date,   -- puzzle N released on date D
  reset_time time default '00:00', timezone text default 'Europe/Stockholm',
  sample_pastes text[], active bool default true, created_at timestamptz
)

players (
  id uuid pk, name text, name_key text unique,   -- name_key = lower(trim(NFKC(name)))
  auth_user_id uuid null references auth.users,  -- future accounts
  created_at timestamptz
)

runs (
  id uuid pk, game_id fk, player_id fk,
  puzzle int,                -- paste games: the number; date games: day index since anchor_date (1-based)
  score numeric null,        -- normalized: guesses count, number, tier index, seconds
  failed bool default false,
  raw_paste text, submitted_at timestamptz default now(),
  unique (game_id, player_id, puzzle)
)

admins (user_id uuid pk references auth.users)
```

Storing a uniform integer `puzzle` for both kinds of game keeps every query the same. Date games display it as a date (`anchor_date + puzzle - 1`).

**Views**

- `puzzle_results`: `ROW_NUMBER() OVER (PARTITION BY game_id, puzzle ORDER BY failed, score ASC|DESC per game, submitted_at)` → `place`, and `points` = F1 table lookup (0 if failed or place > 10).
- `alltime_standings`: `SUM(points)` per game and player, plus runs, wins and average place.
- `grand_prix`: `SUM(points)` per player across all games.

Points are derived by the views, never stored, so deleting or editing a run recalculates everything automatically.

**RLS**

- `games`, `players`, `runs`, and views: `SELECT` for everyone.
- `INSERT/UPDATE/DELETE` on all tables: only when `auth.uid() in (select user_id from admins)`.
- The Edge Function uses the service role for normal submissions.

## Parsing

1. **Normalize** the paste: trim, unify line endings, convert shortcodes to emoji (a small map covering the common squares, medals, and emoji used by the supported games, with unknown shortcodes left as-is).
2. **Match** `parse_regex` (flags `m`, `s` as configured) against the normalized text.
3. **Extract**:
   - `puzzle`: strip `,` `.` spaces → int (`1,922` → 1922).
   - `score` by type:
     - guesses: `X` → failed; otherwise int, must be ≤ `max_guesses`.
     - number: strip thousands separators → numeric (`7,737` → 7737).
     - tiers: index in `tiers` (case-insensitive).
     - time: `m:ss` or `h:mm:ss` → seconds.
   - `fail` group (optional): if matched → failed.
4. **Puzzle window** (non-admin): compute today's puzzle from `anchor_*`, `reset_time`, and `timezone`. Paste games must be today or today−1. Date games get today's index automatically.

**Presets** (anchors and reset times verified against each game's site on 2026-09-23; source of truth is `supabase/functions/_shared/presets.ts`):

| Game | Type | Puzzle | Anchor | Reset |
|---|---|---|---|---|
| Wordle | guesses /6 | from paste | #1922 = 2026-09-23 | 00:00 Europe/Stockholm |
| Ordel | guesses /6 | from paste | #1727 = 2026-09-23 | 06:00 Europe/Stockholm |
| RNGdle | number (EP), higher wins | by date | day 1 = 2026-09-23 | 00:00 UTC |
| Krillion | number, higher wins | from paste | #70 = 2026-09-23 | 00:00 America/New_York |
| Pokedle | 4 modes summed, lower wins | from paste | #1076 = 2026-09-23 | 00:00 UTC+2 (`Etc/GMT-2`) |

## Edge Function `submit-run`

Input: `{ game_id?: uuid, player_name: string, paste: string, override?: { puzzle?: int, submitted_at?: timestamp } }`

1. Reject oversized input before doing anything else: `paste` > 2,000 chars or `player_name` > 32 chars → `413`/`400`.
2. Check the rate limit (see Security) → `429`.
3. If `game_id` is missing (auto-detect), try every active game's regex. 0 matches → error. More than 1 → return the candidates so the UI can ask the player.
4. Parse and validate as above. `override` is only honored after the function verifies the caller's JWT **and** finds the user in `admins`. A client-supplied flag is never trusted.
5. Upsert the player by `name_key`.
6. Insert the run. A unique violation → `409 already submitted`.
7. Return the run with its current place and points.

CORS allows only the GitHub Pages origin (plus `localhost:5173` for dev, configurable via the `ALLOWED_ORIGINS` secret). Errors return generic messages, never stack traces or SQL.

Implementation notes:
- Gateway JWT verification is off (`verify_jwt = false`) because anonymous players have no JWT. The function verifies admin tokens itself, only for backfill requests.
- The rate limit runs before any other work: 10 submissions / 10 min per IP, and 100 / 10 min for backfill attempts (counted *before* the admin token is checked). IPs are stored only as a keyed hash.
- Auto-detect matches on format only, then validates the score, so a matched paste with an impossible score gets a specific error.
- Players are created through `ensure_player()` (service role only), which never overwrites an existing player's display name.
- Error responses carry a machine-readable `code` (`duplicate`, `out_of_window`, `ambiguous` + `candidates`, `rate_limited`, …) for the UI.

## Pages

HashRouter (`/#/…`), because GitHub Pages can't rewrite SPA routes.

- `/`: game tiles, **auto-detect paste box** (name + paste → detected game → confirm), Grand Prix table.
- `/g/:slug`: paste box for this game, **today's leaderboard** (place, player, rendered paste, points), all-time standings, puzzle history picker.
- `/g/:slug/:puzzle`: a single puzzle's leaderboard.
- `/p/:name`: player profile with points and runs per game, and recent runs.
- `/admin`: login.
  - **Games**: create/edit/archive, with a preset picker, **build-from-sample** (click the puzzle number and score in a pasted sample to generate the regexes), regex editor, and live tester over sample pastes showing the extracted puzzle, score, and fail values, plus the computed "today's puzzle".
  - **Runs**: filter by game/player/puzzle, edit or delete, and backfill an old run.

## Security

### Secrets

- The **anon key** is public by design and ships in the frontend (`VITE_SUPABASE_ANON_KEY`). It can only do what RLS allows.
- The **service-role key** exists only as a Supabase Edge Function secret. Never in `web/`, never in a `VITE_*` variable, never committed.
- `.env*` in `.gitignore`. GitHub secret scanning + push protection enabled on the repo.
- The admin password lives only in Supabase Auth.
- GitHub Actions use only the anon key (keep-alive) and `GITHUB_TOKEN` (deploy). Third-party actions are pinned to a commit SHA.

### Database access (RLS)

- **RLS enabled on every table**, including `admins`. The anon role has `SELECT` only on `games`, `players`, `runs`. `admins` has **no** anon policies, so it can't be read or written.
- All views created `WITH (security_invoker = true)` so they respect RLS instead of running with the owner's rights.
- No database function builds SQL from strings (`EXECUTE format(...)` with user input is forbidden). All queries go through supabase-js/PostgREST, which parameterizes.
- Supabase Auth: **public sign-ups disabled**. Admin accounts are created by hand in the dashboard.
- API max rows capped (e.g. 500), and every list query paginated.

### Input handling

- Length caps (paste ≤ 2,000 chars, name ≤ 32 chars) enforced in the UI, in the Edge Function, **and** as `CHECK` constraints in the database.
- Names: NFKC-normalized, trimmed, control characters stripped, so look-alike Unicode can't impersonate an existing name.
- **ReDoS**: pastes are attacker-controlled input to admin-written regexes. Length caps bound the cost, and the admin tester warns about nested quantifiers such as `(a+)+`.

### XSS

- Pastes, names and game fields are rendered as **text only**. React escaping, `dangerouslySetInnerHTML` banned by an ESLint rule.
- Shortcode conversion maps `:name:` to an emoji **string**, never to HTML or `<img>`.
- Game `url` must start with `https://` (validated in the admin form and by a DB `CHECK`), so no `javascript:` links.
- Content-Security-Policy via `<meta>` tag (GitHub Pages can't set headers): `default-src 'self'; connect-src https://<project>.supabase.co; script-src 'self'; object-src 'none'; base-uri 'none'`.
- This matters extra because supabase-js keeps the admin session in `localStorage`: one XSS = stolen admin session.

### Abuse and DoS

- The site is **not DDoS-proof**. GitHub Pages is on a CDN, but Supabase is exposed through the public anon key, and an attacker can exhaust free-tier quotas. Worst case: the project is restricted and the site goes down temporarily. No data is lost. Accepted risk for a friend-group site.
- **Rate limit** in `submit-run`, stored in a `rate_limits (key text pk, count int, window_start timestamptz)` table (Edge Functions keep no memory between calls): e.g. 10 submissions / 10 min per IP (`x-forwarded-for` as set by Supabase). This stops casual spam, not a distributed attack.
- Admin **bulk delete** of runs and players by player / time range, to clean up spam.
- Enable Supabase usage alerts and the spend cap (default on for the free tier).

### Accepted risks (by design)

- **Impersonation**: with no login, anyone can submit under anyone's name. Fixed by the later accounts milestone.
- **No leaked-password check**: HaveIBeenPwned protection is Pro-plan only. Admin accounts rely on the 12-character mixed password rule plus TOTP MFA.
- **Fake results**: the server checks the paste's *format*, not that the game was really played. These games provide no signed proof. Mitigation: admin moderation.

### Dependencies

- Lockfile committed, Dependabot enabled, `npm audit` in CI.

## Repo layout

```
/web             Vite + React + TS (TanStack Query, supabase-js)
/supabase        migrations/ (schema, RLS, views), functions/submit-run/,
                 functions/_shared/ (types, parser, shortcodes, puzzleDate, presets; also imported by /web)
/.github/workflows
    deploy.yml     build web → GitHub Pages
    keepalive.yml  daily cron ping so the free Supabase project never pauses
```

## Milestones

1. **Supabase setup**: project, migrations for schema, RLS, views (`security_invoker`), `CHECK` constraints, and `rate_limits`. Public sign-ups disabled, admin user created by hand, max rows set.
   - *Verify*: `internal.assert_security()` fails the migration if any table in `public` has RLS disabled. Using the anon key: insert/update/delete on every table is refused, and `admins` returns no rows.
2. **Shared parser**: normalization, extraction, and puzzle-date math, with tests for the Wordle, Ordel, RNGdle, and Krillion samples, including `X/6`, thousands separators, a missing EP line, and reset-time boundaries.
   - *Verify* (throwaway checks, no committed unit tests): oversized input rejected; `<script>`, `<img onerror>`, and `javascript:` in pastes come out as inert text; look-alike Unicode names normalize to the same `name_key`; a worst-case regex on a max-length paste finishes quickly.
3. **Edge Function**: `submit-run` including auto-detect, admin override, rate limit, and CORS.
   - *Verify* (throwaway checks, no committed unit tests): `override` without a JWT, or with a non-admin JWT, is ignored; the 11th submission in the window returns `429`; requests from another origin fail the CORS check.
4. **Public UI**: home, game page, and puzzle page. CSP meta tag, and the ESLint rule banning `dangerouslySetInnerHTML`.
5. **Admin UI**: game config with build-from-sample, live tester (including the nested-quantifier warning), run management, and bulk delete.
6. **Deploy**: Pages workflow, keep-alive cron, secret scanning + push protection, Dependabot, and `npm audit` in CI.
7. **Extras**: player profiles and Grand Prix.
8. **Later**: player accounts (username + password via Supabase Auth, linking `players.auth_user_id`, and requiring login to submit as that name).
