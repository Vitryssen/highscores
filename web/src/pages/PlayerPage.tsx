import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatScore } from '@shared/parser.ts';
import { fetchAllStandings, fetchGrandPrix, fetchPlayerByName, fetchPlayerRuns } from '../lib/api.ts';
import { formatTime, ordinal, puzzleLabel } from '../lib/format.ts';
import { useGames } from '../lib/useGames.ts';
import { NotFound } from './NotFound.tsx';

export function PlayerPage() {
  const { name = '' } = useParams();
  const { data: games } = useGames();
  const player = useQuery({ queryKey: ['player', name], queryFn: () => fetchPlayerByName(name) });
  const playerId = player.data?.id;
  const runs = useQuery({
    queryKey: ['player-runs', playerId],
    queryFn: () => fetchPlayerRuns(playerId!),
    enabled: !!playerId,
  });
  const standings = useQuery({ queryKey: ['all-standings'], queryFn: fetchAllStandings, enabled: !!playerId });
  const grandPrix = useQuery({ queryKey: ['grand-prix'], queryFn: fetchGrandPrix, enabled: !!playerId });

  if (player.isLoading) return <p className="muted blink">LOADING…</p>;
  if (!player.data) return <NotFound />;

  const gameById = new Map(games?.map((g) => [g.id, g]));
  const gpIndex = grandPrix.data?.findIndex((r) => r.player_id === playerId) ?? -1;
  const gp = gpIndex >= 0 ? grandPrix.data![gpIndex] : null;
  const perGame = (standings.data ?? [])
    .filter((s) => s.player_id === playerId && gameById.has(s.game_id))
    .map((s) => ({
      ...s,
      game: gameById.get(s.game_id)!,
      rank: (standings.data ?? []).filter((o) => o.game_id === s.game_id && o.points > s.points).length + 1,
    }))
    .sort((a, b) => b.points - a.points);

  return (
    <>
      <section className="hero">
        <h1 className="neon">{player.data.name}</h1>
        {gp && (
          <p className="muted">
            Grand Prix: <strong className="points">{gp.points} pts</strong> · {ordinal(gpIndex + 1)} overall ·{' '}
            {gp.wins} {gp.wins === 1 ? 'win' : 'wins'} · {gp.runs} runs
          </p>
        )}
      </section>

      <div className="profile-grid">
        <section className="panel">
          <h2 className="panel-title">Per game</h2>
          {!perGame.length ? (
            <p className="muted">{standings.isLoading ? 'LOADING…' : 'No runs yet.'}</p>
          ) : (
            <div className="table-wrap">
              <table className="standings">
                <thead>
                  <tr>
                    <th scope="col">Game</th>
                    <th scope="col" className="num">Rank</th>
                    <th scope="col" className="num">Pts</th>
                    <th scope="col" className="num">Wins</th>
                    <th scope="col" className="num">Runs</th>
                    <th scope="col" className="num hide-sm">Avg place</th>
                  </tr>
                </thead>
                <tbody>
                  {perGame.map((s) => (
                    <tr key={s.game_id} className={`place-${Math.min(s.rank, 4)}`}>
                      <td className="player">
                        <Link to={`/g/${s.game.slug}`}>{s.game.name}</Link>
                      </td>
                      <td className="num place">{s.rank}</td>
                      <td className="num points">{s.points}</td>
                      <td className="num">{s.wins}</td>
                      <td className="num">{s.runs}</td>
                      <td className="num hide-sm">{s.avg_place}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel">
          <h2 className="panel-title">Recent runs</h2>
          {!runs.data?.length ? (
            <p className="muted">{runs.isLoading ? 'LOADING…' : 'No runs yet.'}</p>
          ) : (
            <ol className="board">
              {runs.data.map((r) => {
                const g = gameById.get(r.game_id);
                if (!g) return null;
                return (
                  <li key={r.run_id} className={`board-row place-${Math.min(r.place, 4)}${r.failed ? ' failed' : ''}`}>
                    <details>
                      <summary className="run-summary">
                        <span className="place">{r.place}</span>
                        <span className="player">
                          <Link to={`/g/${g.slug}/${r.puzzle}`} onClick={(e) => e.stopPropagation()}>
                            {g.name} {puzzleLabel(g, r.puzzle)}
                          </Link>
                        </span>
                        <span className="score">{formatScore(g, r.score, r.failed)}</span>
                        <span className="points">{r.points ? `+${r.points}` : '0'}</span>
                        <span className="time">{formatTime(r.submitted_at)}</span>
                      </summary>
                      <pre className="paste">{r.raw_paste}</pre>
                    </details>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
