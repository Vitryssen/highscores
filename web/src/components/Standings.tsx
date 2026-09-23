import type { Standing } from '../lib/api.ts';

interface Props {
  standings: Standing[] | undefined;
  loading: boolean;
}

export function Standings({ standings, loading }: Props) {
  if (loading) return <p className="muted blink">LOADING…</p>;
  if (!standings?.length) return <p className="muted">No points yet.</p>;
  return (
    <div className="table-wrap">
      <table className="standings">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Player</th>
            <th scope="col" className="num">Pts</th>
            <th scope="col" className="num">Wins</th>
            <th scope="col" className="num">Runs</th>
            <th scope="col" className="num hide-sm">Avg place</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s, i) => (
            <tr key={s.player_id} className={`place-${Math.min(i + 1, 4)}`}>
              <td className="place">{i + 1}</td>
              <td className="player">{s.player_name}</td>
              <td className="num points">{s.points}</td>
              <td className="num">{s.wins}</td>
              <td className="num">{s.runs}</td>
              <td className="num hide-sm">{s.avg_place}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
