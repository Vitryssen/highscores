import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Game } from '@shared/types.ts';
import { formatScore } from '@shared/parser.ts';
import { currentPuzzle } from '@shared/puzzleDate.ts';
import { fetchPuzzle } from '../lib/api.ts';
import { puzzleLabel } from '../lib/format.ts';
import { useNow } from '../lib/useNow.ts';
import { Countdown } from './Countdown.tsx';

export function GameCard({ game }: { game: Game }) {
  const puzzle = currentPuzzle(game, useNow(15_000));
  const { data, isLoading } = useQuery({
    queryKey: ['puzzle', game.id, puzzle],
    queryFn: () => fetchPuzzle(game.id, puzzle),
  });
  const podium = data?.slice(0, 3) ?? [];

  return (
    // The title link stretches over the whole card, so the Play link can sit inside it without
    // nesting one link in another.
    <div className="panel game-card">
      <div className="game-card-head">
        <h3>
          <Link to={`/g/${game.slug}`} className="card-link">
            {game.name}
          </Link>
        </h3>
        <span className="tag">{puzzleLabel(game, puzzle)}</span>
      </div>
      {isLoading ? (
        <p className="muted blink">LOADING…</p>
      ) : podium.length ? (
        <ol className="podium">
          {podium.map((r) => (
            <li key={r.run_id} className={`place-${r.place}`}>
              <span className="place">{r.place}</span>
              <span className="player">{r.player_name}</span>
              <span className="score">{formatScore(game, r.score, r.failed)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">No runs today. Press start!</p>
      )}
      <span className="game-card-foot muted">
        <span>
          {data?.length ?? 0} {data?.length === 1 ? 'player' : 'players'} ▶
        </span>
        {game.url && (
          <a href={game.url} target="_blank" rel="noopener noreferrer" className="play-link">
            Play ↗
          </a>
        )}
        <Countdown game={game} compact />
      </span>
    </div>
  );
}
