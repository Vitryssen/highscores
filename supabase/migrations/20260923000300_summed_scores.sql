-- Multi-score pastes (e.g. Pokedle's four modes): when score_regex is set, every match of
-- its (?<score>…) group is summed. score_count, if set, requires exactly that many matches.
alter table public.games
  add column score_regex text check (score_regex is null or length(score_regex) between 1 and 1000),
  add column score_count int check (score_count is null or score_count between 1 and 50),
  add constraint games_score_count_needs_regex check (score_count is null or score_regex is not null),
  add constraint games_tiers_not_summed check (score_regex is null or score_type <> 'tiers');

select internal.assert_security();
