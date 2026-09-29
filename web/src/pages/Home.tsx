import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { Game } from '@shared/types.ts';
import { useGames } from '../lib/useGames.ts';
import { useGameOrder } from '../lib/gameOrder.ts';
import { load, save } from '../lib/storage.ts';
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

const EXPANDED_KEY = 'highscores:games-expanded';

/** How many columns the auto-fill grid in `ref` currently has. */
function useGridColumns(ref: RefObject<HTMLElement | null>): number {
  const [columns, setColumns] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setColumns(getComputedStyle(el).gridTemplateColumns.split(' ').length);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return columns;
}

function GameCards({ games }: { games: Game[] }) {
  const [ordered, setOrdered] = useGameOrder(games);
  const [arranging, setArranging] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(() => load(EXPANDED_KEY) === '1');
  const cardsRef = useRef<HTMLDivElement>(null);
  const columns = useGridColumns(cardsRef);

  // Two rows keep the Grand Prix in view; a single column (phones) gets three cards. Hiding
  // just one card isn't worth a button, and rearranging shows them all so any game can move up.
  const limit = columns === 1 ? 3 : columns * 2;
  const hidden = ordered.length - limit;
  const collapsible = !arranging && hidden >= 2;
  const shown = collapsible && !expanded ? ordered.slice(0, limit) : ordered;

  function toggleExpanded() {
    setExpanded(!expanded);
    save(EXPANDED_KEY, expanded ? '0' : '1');
  }

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
      <div ref={cardsRef} className={`cards${arranging ? ' arranging' : ''}`}>
        {shown.map((g, i) =>
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
        {collapsible && (
          <button type="button" className="btn btn-ghost cards-more" aria-expanded={expanded} onClick={toggleExpanded}>
            {expanded ? 'Show fewer ▲' : `+ ${hidden} more games ▼`}
          </button>
        )}
      </div>
    </>
  );
}
