import type { Standing, Streak } from '../lib/api.ts';
import { PlayerLink } from './PlayerLink.tsx';

interface Props {
  standings: Standing[] | undefined;
  streaks?: Streak[];
  loading: boolean;
}

export function Standings({ standings, streaks, loading }: Props) {
  const streakOf = new Map(streaks?.map((s) => [s.player_id, s]));
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
            <th scope="col" className="num hide-sm">Runs</th>
            <th scope="col" className="num" title="Current streak of puzzles played in a row">Streak</th>
            <th scope="col" className="num hide-sm">Avg place</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s, i) => (
            <tr key={s.player_id} className={`place-${Math.min(i + 1, 4)}`}>
              <td className="place">{i + 1}</td>
              <td className="player">
                <PlayerLink name={s.player_name} />
              </td>
              <td className="num points">{s.points}</td>
              <td className="num">{s.wins}</td>
              <td className="num hide-sm">{s.runs}</td>
              <td className="num">
                <StreakBadge streak={streakOf.get(s.player_id)} />
              </td>
              <td className="num hide-sm">{s.avg_place}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 🔥 current play streak, plus 👑 when on a winning streak of 2 or more. */
export function StreakBadge({ streak }: { streak: Streak | undefined }) {
  if (!streak?.current_play_streak) return <span className="muted">–</span>;
  return (
    <span
      className="streak"
      title={`Played ${streak.current_play_streak} in a row (best ${streak.best_play_streak}). Won ${streak.current_win_streak} in a row (best ${streak.best_win_streak}).`}
    >
      🔥{streak.current_play_streak}
      {streak.current_win_streak >= 2 && <> 👑{streak.current_win_streak}</>}
    </span>
  );
}
