-- Monthly Grand Prix points split per game, so the site can total any set of games the viewer
-- picks. grand_prix_monthly (all games) stays for the previously deployed site.

create view public.grand_prix_game_monthly with (security_invoker = true) as
select date_trunc('month', puzzle_date)::date                as month,
       game_id, player_id, player_name,
       sum(points)::int                                      as points,
       count(*)::int                                         as runs,
       count(*) filter (where place = 1 and not failed)::int as wins
from public.puzzle_results
group by 1, game_id, player_id, player_name;

grant select on public.grand_prix_game_monthly to anon, authenticated, service_role;

select internal.assert_security();
