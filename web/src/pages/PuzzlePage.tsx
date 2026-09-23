import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { currentPuzzle } from '@shared/puzzleDate.ts';
import { fetchPuzzle } from '../lib/api.ts';
import { puzzleLabel } from '../lib/format.ts';
import { useGames } from '../lib/useGames.ts';
import { Leaderboard } from '../components/Leaderboard.tsx';
import { NotFound } from './NotFound.tsx';

export function PuzzlePage() {
  const { slug, puzzle: param } = useParams();
  const { data: games, isLoading } = useGames();
  const game = games?.find((g) => g.slug === slug);
  const puzzle = Number(param);
  const valid = !!game && Number.isInteger(puzzle) && puzzle >= 0;

  const board = useQuery({
    queryKey: ['puzzle', game?.id, puzzle],
    queryFn: () => fetchPuzzle(game!.id, puzzle),
    enabled: valid,
  });

  if (isLoading) return <p className="muted blink">LOADING…</p>;
  if (!valid || !game) return <NotFound />;
  const today = currentPuzzle(game);

  return (
    <>
      <section className="hero">
        <h1 className="neon">
          {game.name} {puzzleLabel(game, puzzle)}
        </h1>
        <Link to={`/g/${game.slug}`} className="muted">
          ◀ Back to {game.name}
        </Link>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Final standings</h2>
          <div className="toggle">
            <Link to={`/g/${game.slug}/${puzzle - 1}`}>◀ Prev</Link>
            {puzzle < today && <Link to={`/g/${game.slug}/${puzzle + 1}`}>Next ▶</Link>}
          </div>
        </div>
        <Leaderboard game={game} results={board.data} loading={board.isLoading} empty="Nobody played this one." />
      </section>
    </>
  );
}
