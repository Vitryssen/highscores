import type { Game } from '@shared/types.ts';
import { nextReset } from '@shared/puzzleDate.ts';
import { useNow } from '../lib/useNow.ts';

const pad = (n: number) => String(n).padStart(2, '0');

export function Countdown({ game, compact = false }: { game: Game; compact?: boolean }) {
  const now = useNow(1000);
  const ms = Math.max(0, nextReset(game, now).getTime() - now.getTime());
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const text = h ? `${h}h ${pad(m)}m${compact ? '' : ` ${pad(s)}s`}` : `${m}m ${pad(s)}s`;
  return (
    <span className={`countdown${h === 0 ? ' soon' : ''}`} title="Until the next puzzle">
      ⏱ {compact ? text : `Next puzzle in ${text}`}
    </span>
  );
}
