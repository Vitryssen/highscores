import { useGames } from '../lib/useGames.ts';
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
        <section>
          <h2 className="section-title">Today</h2>
          <div className="cards">
            {games.map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
          </div>
        </section>
      </div>
      <div className="after-grid">
        <GrandPrix />
      </div>
    </>
  );
}
