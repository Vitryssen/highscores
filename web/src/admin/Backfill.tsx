import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatScore, parsePaste } from '@shared/parser.ts';
import { currentPuzzle } from '@shared/puzzleDate.ts';
import { MAX_NAME_LENGTH, MAX_PASTE_LENGTH } from '@shared/types.ts';
import { submitRun, SubmitError } from '../lib/api.ts';
import { supabase } from '../lib/supabase.ts';
import { ordinal, puzzleLabel } from '../lib/format.ts';
import { fetchAllGames } from './adminApi.ts';

export function Backfill() {
  const queryClient = useQueryClient();
  const games = useQuery({ queryKey: ['admin-games'], queryFn: fetchAllGames });
  const [gameId, setGameId] = useState('');
  const [name, setName] = useState('');
  const [paste, setPaste] = useState('');
  const [puzzle, setPuzzle] = useState('');
  const [when, setWhen] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const game = games.data?.find((g) => g.id === gameId);
  const preview = game && paste.trim() ? parsePaste(game, paste) : null;
  const needsPuzzle = game?.puzzle_source === 'date';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!game) return;
    setBusy(true);
    setMessage(null);
    try {
      const { data } = await supabase.auth.getSession();
      const result = await submitRun(
        {
          game_id: game.id,
          player_name: name,
          paste,
          override: {
            ...(puzzle !== '' ? { puzzle: Number(puzzle) } : {}),
            ...(when ? { submitted_at: new Date(when).toISOString() } : {}),
          },
        },
        data.session?.access_token,
      );
      setMessage({ ok: true, text: `Saved: ${result.player_name}, ${game.name} ${puzzleLabel(game, result.puzzle)}, ${ordinal(result.place)} place.` });
      setPaste('');
      await queryClient.invalidateQueries();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof SubmitError ? err.message : 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel stack narrow-wide" onSubmit={onSubmit}>
      <h2 className="panel-title">Backfill a run</h2>
      <p className="muted small">Adds a run for any puzzle, bypassing the today/yesterday window.</p>
      <label htmlFor="bf-game">Game</label>
      <select id="bf-game" value={gameId} onChange={(e) => setGameId(e.target.value)} required>
        <option value="">Choose…</option>
        {games.data?.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      <label htmlFor="bf-name">Player</label>
      <input id="bf-name" value={name} maxLength={MAX_NAME_LENGTH} onChange={(e) => setName(e.target.value)} required />
      <label htmlFor="bf-paste">Result</label>
      <textarea id="bf-paste" rows={6} maxLength={MAX_PASTE_LENGTH} value={paste} onChange={(e) => setPaste(e.target.value)} required />
      {preview && !preview.ok && <p className="msg error">{preview.error}</p>}
      {game && preview?.ok && (
        <p className="msg ok">
          {puzzleLabel(game, puzzle !== '' ? Number(puzzle) : preview.run.puzzle)} ·{' '}
          <strong>{formatScore(game, preview.run.score, preview.run.failed)}</strong>
        </p>
      )}
      <label htmlFor="bf-puzzle">
        {needsPuzzle ? 'Day index' : 'Puzzle number'} {needsPuzzle ? '' : '(optional: overrides the paste)'}
      </label>
      <input
        id="bf-puzzle"
        type="number"
        min={0}
        value={puzzle}
        placeholder={game ? `Today is ${currentPuzzle(game)}` : ''}
        onChange={(e) => setPuzzle(e.target.value)}
        required={needsPuzzle}
      />
      <label htmlFor="bf-when">Submitted at (optional: decides ties)</label>
      <input id="bf-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      <button type="submit" className="btn" disabled={busy || !preview?.ok}>
        {busy ? 'SAVING…' : 'BACKFILL ▶'}
      </button>
      {message && <p className={`msg ${message.ok ? 'win' : 'error'}`} role="status">{message.text}</p>}
    </form>
  );
}
