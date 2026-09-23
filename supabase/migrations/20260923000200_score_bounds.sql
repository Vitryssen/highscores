-- Optional score limits per game, so obviously fake numbers are rejected on submit.
alter table public.games
  add column min_score numeric,
  add column max_score numeric,
  add constraint games_score_bounds_check
    check (min_score is null or max_score is null or min_score <= max_score);

select internal.assert_security();
