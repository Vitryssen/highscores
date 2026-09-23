-- Monthly Grand Prix and per-game streaks.
-- puzzle_results gains puzzle_date (the calendar day a puzzle belongs to), grand_prix_monthly
-- replaces the all-time grand_prix (kept temporarily, see below), and a streaks view is added.

drop view public.grand_prix;
drop view public.alltime_standings;
drop view public.puzzle_results;

create view public.puzzle_results with (security_invoker = true) as
select ranked.run_id, ranked.game_id, ranked.player_id, ranked.player_name, ranked.puzzle,
       ranked.score, ranked.failed, ranked.raw_paste, ranked.submitted_at, ranked.place,
       case when ranked.failed then 0 else public.f1_points(ranked.place) end as points,
       ranked.puzzle_date
from (
  select r.id as run_id, r.game_id, r.player_id, p.name as player_name,
         r.puzzle, r.score, r.failed, r.raw_paste, r.submitted_at,
         row_number() over (
           partition by r.game_id, r.puzzle
           order by r.failed,
                    case when g.higher_is_better then -r.score else r.score end,
                    r.submitted_at, r.id
         ) as place,
         g.anchor_date + (r.puzzle - case when g.puzzle_source = 'paste' then g.anchor_puzzle else 1 end)
           as puzzle_date
  from public.runs r
  join public.games g on g.id = r.game_id
  join public.players p on p.id = r.player_id
) ranked;

create view public.alltime_standings with (security_invoker = true) as
select game_id, player_id, player_name,
       sum(points)::int                                      as points,
       count(*)::int                                         as runs,
       count(*) filter (where place = 1 and not failed)::int as wins,
       round(avg(place), 2)                                  as avg_place
from public.puzzle_results
group by game_id, player_id, player_name;

-- Grand Prix per calendar month of the puzzle (not of the submission).
create view public.grand_prix_monthly with (security_invoker = true) as
select date_trunc('month', puzzle_date)::date                as month,
       player_id, player_name,
       sum(points)::int                                      as points,
       count(*)::int                                         as runs,
       count(*) filter (where place = 1 and not failed)::int as wins,
       count(distinct game_id)::int                          as games
from public.puzzle_results
group by 1, player_id, player_name;

-- Streaks per game and player, over consecutive puzzle numbers ("gaps and islands").
-- A current streak is alive while its last puzzle is today's or yesterday's.
create view public.streaks with (security_invoker = true) as
with results as (
  select game_id, player_id, player_name, puzzle, (place = 1 and not failed) as won
  from public.puzzle_results
),
today as (
  select g.id as game_id,
         case when g.puzzle_source = 'paste' then g.anchor_puzzle else 1 end
           + ((((now() at time zone g.timezone) - g.reset_time::interval))::date - g.anchor_date)
           as puzzle
  from public.games g
),
play_islands as (
  select game_id, player_id, player_name, count(*)::int as len, max(puzzle) as last
  from (
    select *, puzzle - row_number() over (partition by game_id, player_id order by puzzle) as grp
    from results
  ) s
  group by game_id, player_id, player_name, grp
),
win_islands as (
  select game_id, player_id, count(*)::int as len, max(puzzle) as last
  from (
    select *, puzzle - row_number() over (partition by game_id, player_id order by puzzle) as grp
    from results where won
  ) s
  group by game_id, player_id, grp
),
latest as (
  select game_id, player_id, max(puzzle) as last_played from results group by game_id, player_id
),
play as (
  select p.game_id, p.player_id, p.player_name,
         coalesce(max(p.len) filter (where p.last >= t.puzzle - 1), 0) as current_play_streak,
         max(p.len) as best_play_streak
  from play_islands p join today t using (game_id)
  group by p.game_id, p.player_id, p.player_name
),
win as (
  -- The current win streak must end at the player's latest played puzzle: losing today ends it.
  select w.game_id, w.player_id,
         coalesce(max(w.len) filter (where w.last = l.last_played and w.last >= t.puzzle - 1), 0)
           as current_win_streak,
         max(w.len) as best_win_streak
  from win_islands w
  join today t using (game_id)
  join latest l using (game_id, player_id)
  group by w.game_id, w.player_id
)
select play.game_id, play.player_id, play.player_name,
       play.current_play_streak, play.best_play_streak,
       coalesce(win.current_win_streak, 0) as current_win_streak,
       coalesce(win.best_win_streak, 0)    as best_win_streak
from play left join win using (game_id, player_id);

-- Temporary: the previously deployed site still reads the all-time grand_prix. Dropped in a
-- later migration once the new site is live.
create view public.grand_prix with (security_invoker = true) as
select player_id, player_name, sum(points)::int as points, count(*)::int as runs,
       count(*) filter (where place = 1 and not failed)::int as wins,
       count(distinct game_id)::int as games
from public.puzzle_results
group by player_id, player_name;

grant select on public.puzzle_results, public.alltime_standings, public.grand_prix_monthly,
  public.streaks, public.grand_prix to anon, authenticated, service_role;

select internal.assert_security();
