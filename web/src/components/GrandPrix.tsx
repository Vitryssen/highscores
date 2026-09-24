import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Game } from '@shared/types.ts';
import { fetchGrandPrixByGame } from '../lib/api.ts';
import { champions, DEFAULT_GP_GAMES, totalGrandPrix, useGrandPrixGames } from '../lib/grandPrix.ts';
import { currentMonth, formatMonth } from '../lib/months.ts';
import { PlayerLink } from './PlayerLink.tsx';

export function GrandPrix({ games }: { games: Game[] }) {
  const byGame = useQuery({ queryKey: ['grand-prix'], queryFn: fetchGrandPrixByGame });
  const [slugs, setSlugs] = useGrandPrixGames();
  const data = byGame.data && totalGrandPrix(byGame.data, games, slugs);
  const isLoading = byGame.isLoading;
  const isDefault = [...slugs].sort().join() === [...DEFAULT_GP_GAMES].sort().join();
  const toggle = (slug: string) => {
    if (!slugs.includes(slug)) setSlugs([...slugs, slug]);
    else if (slugs.length > 1) setSlugs(slugs.filter((s) => s !== slug)); // keep at least one game
  };
  const thisMonth = currentMonth();
  const months = [...new Set([thisMonth, ...(data ?? []).map((r) => r.month)])].sort().reverse();
  const [month, setMonth] = useState(thisMonth);
  const index = months.indexOf(month);
  const rows = (data ?? []).filter((r) => r.month === month);
  const hallOfFame = champions(data ?? [], thisMonth);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="panel-title">Grand Prix · {formatMonth(month)}</h2>
        <div className="toggle">
          <button type="button" onClick={() => setMonth(months[index + 1])} disabled={index >= months.length - 1}>
            ◀ Prev
          </button>
          <button type="button" onClick={() => setMonth(months[index - 1])} disabled={index <= 0}>
            Next ▶
          </button>
        </div>
      </div>
      <div className="toggle gp-games" role="group" aria-label="Games in the Grand Prix">
        {games.map((g) => {
          const on = slugs.includes(g.slug);
          return (
            <button
              key={g.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(g.slug)}
            >
              {g.name}
            </button>
          );
        })}
        {!isDefault && (
          <button type="button" className="link-btn" onClick={() => setSlugs(DEFAULT_GP_GAMES)}>
            Reset
          </button>
        )}
      </div>
      {isLoading ? (
        <p className="muted blink">LOADING…</p>
      ) : !rows.length ? (
        <p className="muted">No points this month yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="standings">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Player</th>
                <th scope="col" className="num">Pts</th>
                <th scope="col" className="num">Wins</th>
                <th scope="col" className="num">Runs</th>
                <th scope="col" className="num hide-sm">Games</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.player_id} className={`place-${Math.min(i + 1, 4)}`}>
                  <td className="place">{i === 0 && month < thisMonth ? '🏆' : i + 1}</td>
                  <td className="player">
                    <PlayerLink name={r.player_name} />
                  </td>
                  <td className="num points">{r.points}</td>
                  <td className="num">{r.wins}</td>
                  <td className="num">{r.runs}</td>
                  <td className="num hide-sm">{r.games}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {month === thisMonth && <p className="muted small gp-note">Resets on the 1st. The month's leader is crowned champion.</p>}

      {hallOfFame.length > 0 && (
        <>
          <h3 className="panel-title hof-title">Hall of fame</h3>
          <ul className="history">
            {hallOfFame.map((c) => (
              <li key={c.month}>
                <button type="button" className="hof-row" onClick={() => setMonth(c.month)}>
                  <span className="tag">{formatMonth(c.month)}</span>
                  <span className="player">🏆 {c.player_name}</span>
                  <span className="points">{c.points} pts</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
