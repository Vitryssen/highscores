-- Highscores: initial schema, row-level security, and leaderboard views.
-- Security model: anon/authenticated may only SELECT. Writes happen either through the
-- `submit-run` Edge Function (service role) or by an admin (authenticated + listed in admins).

-- ---------------------------------------------------------------------------
-- Private schema for helpers that must not be exposed through the API.
-- ---------------------------------------------------------------------------
create schema if not exists internal;
revoke all on schema internal from public, anon, authenticated;

create function internal.is_valid_timezone(tz text) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = tz);
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.games (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique
                   check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 40),
  name             text not null check (length(name) between 1 and 60),
  url              text check (url is null or (url ~ '^https://' and length(url) <= 300)),
  score_type       text not null check (score_type in ('guesses', 'number', 'tiers', 'time')),
  higher_is_better boolean not null,
  max_guesses      int check (max_guesses between 1 and 50),
  tiers            text[] check (tiers is null or cardinality(tiers) between 2 and 20),
  -- JS regex with named groups: puzzle (optional), score, fail (optional).
  parse_regex      text not null check (length(parse_regex) between 1 and 1000),
  regex_flags      text not null default '' check (regex_flags ~ '^[imsu]*$'),
  puzzle_source    text not null check (puzzle_source in ('paste', 'date')),
  -- Puzzle `anchor_puzzle` was released on `anchor_date`. For date games, anchor_date is day 1.
  anchor_puzzle    int check (anchor_puzzle >= 0),
  anchor_date      date not null,
  reset_time       time not null default '00:00',
  timezone         text not null default 'Europe/Stockholm',
  sample_pastes    text[] not null default '{}' check (cardinality(sample_pastes) <= 10),
  active           boolean not null default true,
  created_at       timestamptz not null default now(),

  check ((score_type = 'guesses') = (max_guesses is not null)),
  check ((score_type = 'tiers') = (tiers is not null)),
  check (score_type not in ('guesses', 'time') or not higher_is_better),
  check (score_type <> 'tiers' or higher_is_better),
  check ((puzzle_source = 'paste') = (anchor_puzzle is not null)),
  check (internal.is_valid_timezone(timezone))
);

create table public.players (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(name) between 1 and 32 and name !~ '[[:cntrl:]]'),
  -- Identity key: case-insensitive and NFKC-normalized so look-alike names collide.
  name_key     text generated always as (lower(normalize(btrim(name), NFKC))) stored unique,
  auth_user_id uuid unique references auth.users (id) on delete set null, -- future accounts
  created_at   timestamptz not null default now()
);

create table public.runs (
  id           uuid primary key default gen_random_uuid(),
  game_id      uuid not null references public.games (id) on delete cascade,
  player_id    uuid not null references public.players (id) on delete cascade,
  -- Paste games: the puzzle number. Date games: 1-based day index since games.anchor_date.
  puzzle       int not null check (puzzle >= 0),
  -- Normalized: guess count, number, tier index, or seconds. Null only for fails.
  score        numeric,
  failed       boolean not null default false,
  raw_paste    text not null check (length(raw_paste) between 1 and 2000),
  submitted_at timestamptz not null default now(),

  unique (game_id, player_id, puzzle),
  check (failed or score is not null)
);
create index runs_game_puzzle_idx on public.runs (game_id, puzzle);
create index runs_player_idx on public.runs (player_id);

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- Fixed-window rate limit counters, written only by the Edge Function.
create table public.rate_limits (
  key          text primary key,
  count        int not null,
  window_start timestamptz not null
);

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

create function public.f1_points(place bigint) returns int
language sql immutable set search_path = '' as $$
  select coalesce((array[25, 18, 15, 12, 10, 8, 6, 4, 2, 1])[place], 0);
$$;

-- Returns true if the call is within the limit. Called by the Edge Function only.
create function public.hit_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
begin
  insert into public.rate_limits as rl (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update set
    count        = case when rl.window_start < now() - make_interval(secs => p_window_seconds)
                        then 1 else rl.count + 1 end,
    window_start = case when rl.window_start < now() - make_interval(secs => p_window_seconds)
                        then now() else rl.window_start end
  returning count into v_count;

  -- Occasionally prune stale counters so the table doesn't grow without bound.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_count <= p_limit;
end;
$$;
grant execute on function public.is_admin(), public.f1_points(bigint)
  to anon, authenticated, service_role;
revoke execute on function public.hit_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, int, int) to service_role;

-- ---------------------------------------------------------------------------
-- Privileges + row-level security
-- ---------------------------------------------------------------------------
alter table public.games       enable row level security;
alter table public.players     enable row level security;
alter table public.runs        enable row level security;
alter table public.admins      enable row level security;
alter table public.rate_limits enable row level security;

-- Belt and braces: table privileges restrict what RLS policies could ever allow.
revoke all on public.games, public.players, public.runs, public.admins, public.rate_limits
  from anon, authenticated;
grant select on public.games, public.players, public.runs to anon, authenticated;
grant insert, update, delete on public.games, public.players, public.runs to authenticated;
-- The project doesn't auto-expose new tables, so the Edge Function's role needs explicit grants.
grant select, insert, update, delete
  on public.games, public.players, public.runs, public.rate_limits to service_role;

create policy "public read" on public.games   for select to anon, authenticated using (true);
create policy "public read" on public.players for select to anon, authenticated using (true);
create policy "public read" on public.runs    for select to anon, authenticated using (true);

create policy "admin write" on public.games   for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin write" on public.players for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin write" on public.runs    for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
-- admins and rate_limits: no policies, so no API access at all.

-- ---------------------------------------------------------------------------
-- Leaderboard views (security_invoker so they respect RLS)
-- ---------------------------------------------------------------------------
create view public.puzzle_results with (security_invoker = true) as
select ranked.*,
       case when ranked.failed then 0 else public.f1_points(ranked.place) end as points
from (
  select r.id as run_id, r.game_id, r.player_id, p.name as player_name,
         r.puzzle, r.score, r.failed, r.raw_paste, r.submitted_at,
         row_number() over (
           partition by r.game_id, r.puzzle
           order by r.failed,
                    case when g.higher_is_better then -r.score else r.score end,
                    r.submitted_at, r.id
         ) as place
  from public.runs r
  join public.games g on g.id = r.game_id
  join public.players p on p.id = r.player_id
) ranked;

create view public.alltime_standings with (security_invoker = true) as
select game_id, player_id, player_name,
       sum(points)::int                                  as points,
       count(*)::int                                     as runs,
       count(*) filter (where place = 1 and not failed)::int as wins,
       round(avg(place), 2)                              as avg_place
from public.puzzle_results
group by game_id, player_id, player_name;

create view public.grand_prix with (security_invoker = true) as
select player_id, player_name,
       sum(points)::int                                  as points,
       count(*)::int                                     as runs,
       count(*) filter (where place = 1 and not failed)::int as wins,
       count(distinct game_id)::int                      as games
from public.puzzle_results
group by player_id, player_name;

grant select on public.puzzle_results, public.alltime_standings, public.grand_prix
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Security assertion. Call at the end of every migration so a mistake fails the push.
-- ---------------------------------------------------------------------------
create function internal.assert_security() returns void
language plpgsql set search_path = '' as $$
declare
  bad text;
begin
  select string_agg(c.relname, ', ') into bad
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;
  if bad is not null then
    raise exception 'RLS is disabled on public tables: %', bad;
  end if;

  select string_agg(c.relname, ', ') into bad
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
    and not coalesce(c.reloptions @> array['security_invoker=true'], false);
  if bad is not null then
    raise exception 'Views without security_invoker: %', bad;
  end if;

  select string_agg(p.proname, ', ') into bad
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    -- Event-trigger functions (e.g. Supabase's rls_auto_enable) can't be called through the API.
    and p.prorettype <> 'pg_catalog.event_trigger'::pg_catalog.regtype
    and not coalesce(p.proconfig @> array['search_path=""'], false);
  if bad is not null then
    raise exception 'SECURITY DEFINER functions without an empty search_path: %', bad;
  end if;
end;
$$;

select internal.assert_security();
