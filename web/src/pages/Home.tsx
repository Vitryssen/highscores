import { useState } from 'react';
import type { Game } from '@shared/types.ts';
import { useGames } from '../lib/useGames.ts';
import { useGameOrder } from '../lib/gameOrder.ts';
import { PasteBox } from '../components/PasteBox.tsx';
import { GameCard } from '../components/GameCard.tsx';
import { GrandPrix } from '../components/GrandPrix.tsx';

export function Home() {
  const { data: games, isLoading, error } = useGames();
  if (error) return <p className="msg error">Couldn't load games: {error.message}</p>;
  if (isLoading || !games) return <p className="muted blink">LOADING…</p>;
  return (
    <>
      <section className="hero">
        <h1 className="neon">Daily -dle leaderboard</h1>
        <p className="muted">Paste your result. Climb the board. Fewest guesses, highest score, fastest time.</p>
      </section>
      <div className="home-grid">
        <PasteBox games={games} />
        <GameCards games={games} />
      </div>
      <div className="after-grid">
        <GrandPrix games={games} />
      </div>
    </>
  );
}

function GameCards({ games }: { games: Game[] }) {
  const [ordered, setOrdered] = useGameOrder(games);
  const [arranging, setArranging] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);

  function move(from: number, to: number) {
    if (to < 0 || to >= ordered.length || from === to) return;
    const next = [...ordered];
    next.splice(to, 0, ...next.splice(from, 1));
    setOrdered(next);
  }

  return (
    <>
      <div className="home-today cards-head">
        <h2 className="section-title">Today</h2>
        <button type="button" className="link-btn" aria-pressed={arranging} onClick={() => setArranging((a) => !a)}>
          {arranging ? 'Done ✓' : 'Rearrange'}
        </button>
      </div>
      <div className={`cards${arranging ? ' arranging' : ''}`}>
        {ordered.map((g, i) =>
          arranging ? (
            <div
              key={g.id}
              className={`card-slot${dragging === i ? ' dragging' : ''}`}
              draggable
              onDragStart={() => setDragging(i)}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragging !== null && dragging !== i) {
                  move(dragging, i);
                  setDragging(i);
                }
              }}
              onDragEnd={() => setDragging(null)}
            >
              <GameCard game={g} />
              <div className="toggle card-controls">
                <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Move ${g.name} earlier`}>
                  ◀
                </button>
                <span className="muted small">drag or move</span>
                <button
                  type="button"
                  onClick={() => move(i, i + 1)}
                  disabled={i === ordered.length - 1}
                  aria-label={`Move ${g.name} later`}
                >
                  ▶
                </button>
              </div>
            </div>
          ) : (
            <GameCard key={g.id} game={g} />
          ),
        )}
      </div>
    </>
  );
}
