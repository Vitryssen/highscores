import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatScore } from '@shared/parser.ts';
import { currentPuzzle } from '@shared/puzzleDate.ts';
import { fetchHistory, fetchPuzzle, fetchStandings, fetchStreaks } from '../lib/api.ts';
import { useNow } from '../lib/useNow.ts';
import { Countdown } from '../components/Countdown.tsx';
import { puzzleLabel } from '../lib/format.ts';
import { useGames } from '../lib/useGames.ts';
import { PasteBox } from '../components/PasteBox.tsx';
import { Leaderboard } from '../components/Leaderboard.tsx';
import { Standings } from '../components/Standings.tsx';
import { NotFound } from './NotFound.tsx';

export function GamePage() {
  const { slug } = useParams();
  const { data: games, isLoading } = useGames();
  const game = games?.find((g) => g.slug === slug);
  const now = useNow(15_000); // rolls the board over when the puzzle resets
  const today = game ? currentPuzzle(game, now) : 0;
  const [offset, setOffset] = useState(0); // 0 = today, 1 = yesterday
  const puzzle = today - offset;

  const board = useQuery({
    queryKey: ['puzzle', game?.id, puzzle],
    queryFn: () => fetchPuzzle(game!.id, puzzle),
    enabled: !!game,
  });
  const standings = useQuery({
    queryKey: ['standings', game?.id],
    queryFn: () => fetchStandings(game!.id),
    enabled: !!game,
  });
  const streaks = useQuery({
    queryKey: ['streaks', game?.id],
    queryFn: () => fetchStreaks(game!.id),
    enabled: !!game,
  });
  const history = useQuery({
    queryKey: ['history', game?.id],
    queryFn: () => fetchHistory(game!.id),
    enabled: !!game,
  });

  if (isLoading) return <p className="muted blink">LOADING…</p>;
  if (!game || !games) return <NotFound />;

  return (
    <>
      <section className="hero">
        <h1 className="neon">{game.name}</h1>
        <Countdown game={game} />
        {game.url && (
          <a href={game.url} target="_blank" rel="noopener noreferrer" className="muted">
            Play {game.name} ↗
          </a>
        )}
      </section>

      <div className="game-grid">
        <PasteBox games={games} game={game} />

        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">
              {offset ? 'Yesterday' : 'Today'} · {puzzleLabel(game, puzzle)}
            </h2>
            <div className="toggle" role="group" aria-label="Which puzzle">
              <button type="button" aria-pressed={offset === 0} onClick={() => setOffset(0)}>
                Today
              </button>
              <button type="button" aria-pressed={offset === 1} onClick={() => setOffset(1)}>
                Yesterday
              </button>
            </div>
          </div>
          <Leaderboard game={game} results={board.data} loading={board.isLoading} />
        </section>

        <section className="panel">
          <h2 className="panel-title">All-time</h2>
          <Standings standings={standings.data} streaks={streaks.data} loading={standings.isLoading} />
        </section>

        <section className="panel">
          <h2 className="panel-title">History</h2>
          {history.data?.length ? (
            <ul className="history">
              {history.data.map((r) => (
                <li key={r.run_id}>
                  <Link to={`/g/${game.slug}/${r.puzzle}`}>
                    <span className="tag">{puzzleLabel(game, r.puzzle)}</span>
                    <span className="player">👑 {r.player_name}</span>
                    <span className="score">{formatScore(game, r.score, r.failed)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{history.isLoading ? 'LOADING…' : 'No finished puzzles yet.'}</p>
          )}
        </section>
      </div>
    </>
  );
}
