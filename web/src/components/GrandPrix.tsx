import { useQuery } from '@tanstack/react-query';
import { fetchGrandPrix } from '../lib/api.ts';
import { PlayerLink } from './PlayerLink.tsx';

export function GrandPrix() {
  const { data, isLoading } = useQuery({ queryKey: ['grand-prix'], queryFn: fetchGrandPrix });
  return (
    <section className="panel">
      <h2 className="panel-title">Grand Prix · all games</h2>
      {isLoading ? (
        <p className="muted blink">LOADING…</p>
      ) : !data?.length ? (
        <p className="muted">No points yet.</p>
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
              {data.map((r, i) => (
                <tr key={r.player_id} className={`place-${Math.min(i + 1, 4)}`}>
                  <td className="place">{i + 1}</td>
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
    </section>
  );
}
