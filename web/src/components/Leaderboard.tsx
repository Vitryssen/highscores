import type { Game } from '@shared/types.ts';
import { formatScore } from '@shared/parser.ts';
import type { PuzzleResult } from '../lib/api.ts';
import { formatTime } from '../lib/format.ts';

interface Props {
  game: Game;
  results: PuzzleResult[] | undefined;
  loading: boolean;
  empty?: string;
}

export function Leaderboard({ game, results, loading, empty = 'No runs yet. Be the first!' }: Props) {
  if (loading) return <p className="muted blink">LOADING…</p>;
  if (!results?.length) return <p className="muted">{empty}</p>;
  return (
    <ol className="board">
      {results.map((r) => (
        <li key={r.run_id} className={`board-row place-${Math.min(r.place, 4)}${r.failed ? ' failed' : ''}`}>
          <details>
            <summary>
              <span className="place">{r.place}</span>
              <span className="player">{r.player_name}</span>
              <span className="score">{formatScore(game, r.score, r.failed)}</span>
              <span className="points">{r.points ? `+${r.points}` : '0'}</span>
              <span className="time">{formatTime(r.submitted_at)}</span>
            </summary>
            <pre className="paste">{r.raw_paste}</pre>
          </details>
        </li>
      ))}
    </ol>
  );
}
