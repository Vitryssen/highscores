import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Game } from '@shared/types.ts';
import { formatScore } from '@shared/parser.ts';
import type { PuzzleResult } from '../lib/api.ts';
import { formatTime, puzzleLabel } from '../lib/format.ts';
import { deleteRuns, fetchAllGames, fetchRuns, updateRun, type RunFilters } from './adminApi.ts';

export function RunsAdmin() {
  const queryClient = useQueryClient();
  const games = useQuery({ queryKey: ['admin-games'], queryFn: fetchAllGames });
  const [filters, setFilters] = useState<RunFilters>({});
  const runs = useQuery({ queryKey: ['admin-runs', filters], queryFn: () => fetchRuns(filters) });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const gameById = new Map(games.data?.map((g) => [g.id, g]));
  const rows = runs.data ?? [];

  const refresh = async () => {
    setSelected(new Set());
    await queryClient.invalidateQueries();
  };

  async function removeSelected() {
    if (!window.confirm(`Delete ${selected.size} run(s)? The players can then submit again.`)) return;
    try {
      await deleteRuns([...selected]);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="panel stack">
      <h2 className="panel-title">Runs</h2>
      <div className="filters">
        <select value={filters.gameId ?? ''} onChange={(e) => setFilters((f) => ({ ...f, gameId: e.target.value || undefined }))} aria-label="Game">
          <option value="">All games</option>
          {games.data?.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <input
          placeholder="Player"
          aria-label="Player"
          value={filters.player ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, player: e.target.value || undefined }))}
        />
        <input
          type="number"
          placeholder="Puzzle #"
          aria-label="Puzzle number"
          value={filters.puzzle ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, puzzle: e.target.value === '' ? undefined : Number(e.target.value) }))}
        />
        <input
          type="datetime-local"
          aria-label="Submitted since"
          title="Submitted since"
          onChange={(e) => setFilters((f) => ({ ...f, since: e.target.value ? new Date(e.target.value).toISOString() : undefined }))}
        />
      </div>

      <div className="toggle">
        <button type="button" onClick={() => setSelected(new Set(rows.map((r) => r.run_id)))} disabled={!rows.length}>
          Select all {rows.length}
        </button>
        <button type="button" onClick={() => setSelected(new Set())} disabled={!selected.size}>
          Clear
        </button>
        <button type="button" className="danger" onClick={removeSelected} disabled={!selected.size}>
          Delete selected ({selected.size})
        </button>
      </div>
      {error && <p className="msg error">{error}</p>}
      {runs.isLoading && <p className="muted blink">LOADING…</p>}
      {rows.length === 200 && <p className="muted small">Showing the newest 200. Narrow the filters to see more.</p>}

      <div className="table-wrap">
        <table className="standings admin-table">
          <thead>
            <tr>
              <th />
              <th>Game</th>
              <th>Player</th>
              <th>Score</th>
              <th className="num">Place</th>
              <th>When</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const g = gameById.get(r.game_id);
              if (!g) return null;
              return editing === r.run_id ? (
                <EditRow key={r.run_id} run={r} game={g} onDone={async (changed) => {
                  setEditing(null);
                  if (changed) await refresh();
                }} />
              ) : (
                <tr key={r.run_id}>
                  <td>
                    <input type="checkbox" checked={selected.has(r.run_id)} onChange={() => toggle(r.run_id)} aria-label="Select run" />
                  </td>
                  <td>
                    {g.name} <span className="muted small">{puzzleLabel(g, r.puzzle)}</span>
                  </td>
                  <td className="player">{r.player_name}</td>
                  <td className="score">{formatScore(g, r.score, r.failed)}</td>
                  <td className="num">{r.place}</td>
                  <td className="muted small">
                    {new Date(r.submitted_at).toLocaleDateString('en-GB')} {formatTime(r.submitted_at)}
                  </td>
                  <td className="actions">
                    <button type="button" className="link-btn" onClick={() => setEditing(r.run_id)}>
                      Edit
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EditRow({ run, game, onDone }: { run: PuzzleResult; game: Game; onDone: (changed: boolean) => void }) {
  const [puzzle, setPuzzle] = useState(String(run.puzzle));
  const [score, setScore] = useState(run.score === null ? '' : String(run.score));
  const [failed, setFailed] = useState(run.failed);
  const [error, setError] = useState<string | null>(null);
  const hint = { guesses: 'guesses', number: 'number', tiers: 'tier index (0 = worst)', time: 'seconds' }[game.score_type];

  async function save() {
    try {
      await updateRun(run.run_id, { puzzle: Number(puzzle), score: failed || score === '' ? null : Number(score), failed });
      onDone(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <tr className="editing">
      <td colSpan={7}>
        <div className="filters">
          <span>
            {game.name} · {run.player_name}
          </span>
          <input type="number" min={0} value={puzzle} onChange={(e) => setPuzzle(e.target.value)} aria-label="Puzzle" />
          <input type="number" step="any" value={score} onChange={(e) => setScore(e.target.value)} disabled={failed} aria-label={`Score (${hint})`} placeholder={hint} />
          <label className="radio">
            <input type="checkbox" checked={failed} onChange={(e) => setFailed(e.target.checked)} /> Failed
          </label>
          <button type="button" className="link-btn" onClick={save}>
            Save
          </button>
          <button type="button" className="link-btn" onClick={() => onDone(false)}>
            Cancel
          </button>
        </div>
        {error && <p className="msg error">{error}</p>}
      </td>
    </tr>
  );
}
