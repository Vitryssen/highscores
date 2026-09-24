import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Game } from '@shared/types.ts';
import { MAX_NAME_LENGTH, MAX_PASTE_LENGTH } from '@shared/types.ts';
import { detectGames, formatScore, normalizePaste, parsePaste, validateName } from '@shared/parser.ts';
import { isPuzzleInWindow } from '@shared/puzzleDate.ts';
import { fetchPlayerNames, submitRun, SubmitError, type SubmitSuccess } from '../lib/api.ts';
import { load, NAME_KEY, save } from '../lib/storage.ts';
import { ordinal, puzzleLabel } from '../lib/format.ts';

interface Props {
  games: Game[];
  /** Submit to this game only. Without it, the game is detected from the paste. */
  game?: Game;
}

export function PasteBox({ games, game: fixedGame }: Props) {
  const ids = useId();
  const queryClient = useQueryClient();
  const [name, setName] = useState(() => load(NAME_KEY) ?? '');
  const [paste, setPaste] = useState('');
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SubmitSuccess | null>(null);
  const { data: playerNames = [] } = useQuery({ queryKey: ['players'], queryFn: fetchPlayerNames });

  const trimmed = paste.trim();
  const candidates = fixedGame ? [fixedGame] : trimmed ? detectGames(games, paste) : [];
  const game =
    candidates.length === 1 ? candidates[0] : (candidates.find((g) => g.id === chosenId) ?? null);
  const preview = game && trimmed ? parsePaste(game, paste) : null;
  const outOfWindow = !!(game && preview?.ok && !isPuzzleInWindow(game, preview.run.puzzle));
  const nameError = name ? validateName(name) : null;
  const canSubmit = !!(game && preview?.ok && !outOfWindow && name.trim() && !nameError && !submitting);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || !game) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await submitRun({ game_id: game.id, player_name: name, paste });
      save(NAME_KEY, result.player_name);
      setName(result.player_name);
      setPaste('');
      setChosenId(null);
      setSuccess(result);
      await queryClient.invalidateQueries();
    } catch (err) {
      setError(err instanceof SubmitError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="panel paste-box" onSubmit={onSubmit}>
      <h2 className="panel-title">{fixedGame ? 'Submit your run' : 'Insert result'}</h2>

      <label htmlFor={`${ids}-name`}>Player</label>
      <input
        id={`${ids}-name`}
        list={`${ids}-names`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={MAX_NAME_LENGTH}
        autoComplete="off"
        placeholder="Your name"
        required
      />
      <datalist id={`${ids}-names`}>
        {playerNames.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      {nameError && <p className="msg error">{nameError}</p>}

      <label htmlFor={`${ids}-paste`}>Result</label>
      <textarea
        id={`${ids}-paste`}
        value={paste}
        onChange={(e) => {
          setPaste(e.target.value);
          setSuccess(null);
          setError(null);
        }}
        maxLength={MAX_PASTE_LENGTH}
        rows={7}
        spellCheck={false}
        placeholder={
          (fixedGame?.sample_pastes[0] && normalizePaste(fixedGame.sample_pastes[0])) ??
          `Paste a result from ${games.map((g) => g.name).join(', ')}…`
        }
        required
      />

      {!fixedGame && trimmed && candidates.length === 0 && (
        <p className="msg error">
          That doesn't look like a result for any game here.{' '}
          <Link to="/request" state={{ paste }}>
            Request this game?
          </Link>
        </p>
      )}
      {candidates.length > 1 && (
        <fieldset className="choose">
          <legend>This matches several games. Which one?</legend>
          {candidates.map((g) => (
            <label key={g.id} className="radio">
              <input
                type="radio"
                name={`${ids}-game`}
                checked={chosenId === g.id}
                onChange={() => setChosenId(g.id)}
              />
              {g.name}
            </label>
          ))}
        </fieldset>
      )}
      {game && preview && !preview.ok && <p className="msg error">{preview.error}</p>}
      {game && preview?.ok && (
        <p className={`msg ${outOfWindow ? 'error' : 'ok'}`}>
          {game.name} {puzzleLabel(game, preview.run.puzzle)} ·{' '}
          <strong>{formatScore(game, preview.run.score, preview.run.failed)}</strong>
          {outOfWindow && " · too old: only today's or yesterday's puzzle counts"}
        </p>
      )}

      <button type="submit" className="btn" disabled={!canSubmit}>
        {submitting ? 'SAVING…' : 'SUBMIT ▶'}
      </button>

      {error && (
        <p className="msg error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="msg win" role="status">
          {success.failed ? 'Run saved. ' : `${ordinal(success.place)} place! +${success.points} pts. `}
          <Link to={`/g/${success.game.slug}`}>See the {success.game.name} board →</Link>
        </p>
      )}
    </form>
  );
}
