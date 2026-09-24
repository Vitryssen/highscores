import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { formatScore, normalizePaste } from '@shared/parser.ts';
import {
  fetchAllStandings,
  fetchGrandPrixByGame,
  fetchPlayerByName,
  fetchPlayerRuns,
  fetchStreaks,
  RUNS_PAGE_SIZE,
} from '../lib/api.ts';
import { currentMonth, formatMonth } from '../lib/months.ts';
import { champions, totalGrandPrix, useGrandPrixGames } from '../lib/grandPrix.ts';
import { formatTime, ordinal, puzzleLabel } from '../lib/format.ts';
import { useGames } from '../lib/useGames.ts';
import { NotFound } from './NotFound.tsx';

export function PlayerPage() {
  const { name = '' } = useParams();
  const { data: games } = useGames();
  const player = useQuery({ queryKey: ['player', name], queryFn: () => fetchPlayerByName(name) });
  const playerId = player.data?.id;
  const [page, setPage] = useState(0);
  const [pageFor, setPageFor] = useState(name);
  if (pageFor !== name) {
    // Another player's profile: start from their newest runs.
    setPageFor(name);
    setPage(0);
  }
  const runs = useQuery({
    queryKey: ['player-runs', playerId, page],
    queryFn: () => fetchPlayerRuns(playerId!, page),
    enabled: !!playerId,
    placeholderData: keepPreviousData, // keep the current page visible while the next loads
  });
  const pages = Math.max(1, Math.ceil((runs.data?.total ?? 0) / RUNS_PAGE_SIZE));
  const standings = useQuery({ queryKey: ['all-standings'], queryFn: fetchAllStandings, enabled: !!playerId });
  const grandPrix = useQuery({ queryKey: ['grand-prix'], queryFn: fetchGrandPrixByGame, enabled: !!playerId });
  const [gpSlugs] = useGrandPrixGames();
  const streaks = useQuery({ queryKey: ['streaks', 'all'], queryFn: () => fetchStreaks(), enabled: !!playerId });

  if (player.isLoading) return <p className="muted blink">LOADING…</p>;
  if (!player.data) return <NotFound />;

  const gameById = new Map(games?.map((g) => [g.id, g]));
  const thisMonth = currentMonth();
  const gpRows = totalGrandPrix(grandPrix.data ?? [], games ?? [], gpSlugs);
  const monthRows = gpRows.filter((r) => r.month === thisMonth);
  const gpIndex = monthRows.findIndex((r) => r.player_id === playerId);
  const gp = gpIndex >= 0 ? monthRows[gpIndex] : null;
  const titles = champions(gpRows, thisMonth).filter((c) => c.player_id === playerId);
  const streakOf = new Map(
    (streaks.data ?? []).filter((s) => s.player_id === playerId).map((s) => [s.game_id, s]),
  );
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
            {formatMonth(thisMonth)} Grand Prix: <strong className="points">{gp.points} pts</strong> ·{' '}
            {ordinal(gpIndex + 1)} · {gp.wins} {gp.wins === 1 ? 'win' : 'wins'} · {gp.runs} runs
          </p>
        )}
        {titles.length > 0 && (
          <p className="titles">
            {titles.map((t) => (
              <span key={t.month} className="tag">
                🏆 {formatMonth(t.month)}
              </span>
            ))}
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
                    <th scope="col" className="num hide-sm">Runs</th>
                    <th scope="col" className="num" title="Puzzles played in a row: current / best">
                      🔥<span className="hide-sm"> Streak</span>
                    </th>
                    <th scope="col" className="num" title="Wins in a row: current / best">
                      👑<span className="hide-sm"> Wins</span>
                    </th>
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
                      <td className="num hide-sm">{s.runs}</td>
                      <td className="num">
                        {streakOf.get(s.game_id)?.current_play_streak ?? 0}
                        <span className="muted"> / {streakOf.get(s.game_id)?.best_play_streak ?? 0}</span>
                      </td>
                      <td className="num">
                        {streakOf.get(s.game_id)?.current_win_streak ?? 0}
                        <span className="muted"> / {streakOf.get(s.game_id)?.best_win_streak ?? 0}</span>
                      </td>
                      <td className="num hide-sm">{s.avg_place}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Runs{runs.data ? ` · ${runs.data.total}` : ''}</h2>
            {pages > 1 && (
              <nav className="toggle pager" aria-label="Runs pages">
                <button type="button" onClick={() => setPage((p) => p - 1)} disabled={page === 0}>
                  ◀ Newer
                </button>
                <span className="muted small" aria-live="polite">
                  {page + 1} / {pages}
                </span>
                <button type="button" onClick={() => setPage((p) => p + 1)} disabled={page >= pages - 1}>
                  Older ▶
                </button>
              </nav>
            )}
          </div>
          {!runs.data?.runs.length ? (
            <p className="muted">{runs.isLoading ? 'LOADING…' : 'No runs yet.'}</p>
          ) : (
            <ol className={`board${runs.isPlaceholderData ? ' loading' : ''}`}>
              {runs.data.runs.map((r) => {
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
                      <pre className="paste">{normalizePaste(r.raw_paste)}</pre>
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
