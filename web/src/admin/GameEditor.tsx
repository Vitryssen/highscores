import { useState, type FormEvent } from 'react';
import type { Game, GameConfig, PuzzleSource, ScoreType } from '@shared/types.ts';
import { configErrors, formatScore, parsePaste, regexWarnings } from '@shared/parser.ts';
import { currentPuzzle, gameDay } from '@shared/puzzleDate.ts';
import { PRESETS, type Preset } from '@shared/presets.ts';
import { puzzleLabel } from '../lib/format.ts';
import { saveGame, type GameRow } from './adminApi.ts';
import { SampleBuilder } from './SampleBuilder.tsx';

interface Form {
  name: string;
  slug: string;
  url: string;
  active: boolean;
  score_type: ScoreType;
  higher_is_better: boolean;
  max_guesses: string;
  tiers: string;
  min_score: string;
  max_score: string;
  puzzle_source: PuzzleSource;
  anchor_puzzle: string;
  anchor_date: string;
  reset_time: string;
  timezone: string;
  parse_regex: string;
  regex_flags: string;
  score_regex: string;
  score_count: string;
  sample_pastes: string[];
}

const str = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
const num = (s: string) => (s.trim() === '' ? null : Number(s));
const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

function toForm(g: Game | Preset | null): Form {
  if (!g) {
    return {
      name: '',
      slug: '',
      url: '',
      active: true,
      score_type: 'guesses',
      higher_is_better: false,
      max_guesses: '6',
      tiers: '',
      min_score: '',
      max_score: '',
      puzzle_source: 'paste',
      anchor_puzzle: '',
      anchor_date: new Date().toISOString().slice(0, 10),
      reset_time: '00:00',
      timezone: 'Europe/Stockholm',
      parse_regex: '',
      regex_flags: 'm',
      score_regex: '',
      score_count: '',
      sample_pastes: [''],
    };
  }
  return {
    name: g.name,
    slug: g.slug,
    url: g.url ?? '',
    active: 'active' in g ? g.active : true,
    score_type: g.score_type,
    higher_is_better: g.higher_is_better,
    max_guesses: str(g.max_guesses),
    tiers: (g.tiers ?? []).join(', '),
    min_score: str(g.min_score),
    max_score: str(g.max_score),
    puzzle_source: g.puzzle_source,
    anchor_puzzle: str(g.anchor_puzzle),
    anchor_date: g.anchor_date,
    reset_time: g.reset_time.slice(0, 5),
    timezone: g.timezone,
    parse_regex: g.parse_regex,
    regex_flags: g.regex_flags,
    score_regex: g.score_regex ?? '',
    score_count: str(g.score_count),
    sample_pastes: g.sample_pastes.length ? g.sample_pastes : [''],
  };
}

function toRow(f: Form): GameRow {
  const tiers = f.tiers
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  return {
    name: f.name.trim(),
    slug: f.slug,
    url: f.url.trim() || null,
    active: f.active,
    score_type: f.score_type,
    higher_is_better: f.higher_is_better,
    max_guesses: f.score_type === 'guesses' ? num(f.max_guesses) : null,
    tiers: f.score_type === 'tiers' ? tiers : null,
    min_score: num(f.min_score),
    max_score: num(f.max_score),
    puzzle_source: f.puzzle_source,
    anchor_puzzle: f.puzzle_source === 'paste' ? num(f.anchor_puzzle) : null,
    anchor_date: f.anchor_date,
    reset_time: f.reset_time,
    timezone: f.timezone.trim(),
    parse_regex: f.parse_regex,
    regex_flags: f.regex_flags,
    score_regex: f.score_regex.trim() || null,
    score_count: f.score_regex.trim() ? num(f.score_count) : null,
    sample_pastes: f.sample_pastes.filter((s) => s.trim()),
  };
}

const TIMEZONES = ['UTC', 'Etc/GMT-2', ...Intl.supportedValuesOf('timeZone')];

interface Props {
  game: Game | null;
  onDone: (saved?: Game) => void;
}

export function GameEditor({ game, onDone }: Props) {
  const [form, setForm] = useState<Form>(() => toForm(game));
  const [slugEdited, setSlugEdited] = useState(!!game);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const row = toRow(form);
  const config = row as unknown as GameConfig;
  let errors: string[] = [];
  let today: number | null = null;
  try {
    errors = row.parse_regex ? configErrors(config) : ['Add a format: use the builder or write a regex.'];
    today = row.puzzle_source === 'date' || row.anchor_puzzle !== null ? currentPuzzle(config) : null;
  } catch (e) {
    errors = [(e as Error).message];
  }
  const warnings = [...regexWarnings(row.parse_regex), ...regexWarnings(row.score_regex ?? '')];
  const firstSample = form.sample_pastes.find((s) => s.trim()) ?? '';
  const firstParsed = firstSample && !errors.length ? parsePaste(config, firstSample) : null;

  function setScoreType(t: ScoreType) {
    setForm((f) => ({
      ...f,
      score_type: t,
      higher_is_better: t === 'tiers' ? true : t === 'number' ? f.higher_is_better : false,
    }));
  }

  function applyPreset(key: string) {
    const preset = PRESETS.find((p) => p.key === key);
    if (preset) {
      setForm(toForm(preset));
      setSlugEdited(true);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (errors.length) return;
    setSaving(true);
    setError(null);
    try {
      onDone(await saveGame(row, game?.id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="panel stack editor" onSubmit={onSubmit}>
      <div className="panel-head">
        <h2 className="panel-title">{game ? `Edit ${game.name}` : 'New game'}</h2>
        <button type="button" className="btn btn-ghost" onClick={() => onDone()}>
          Cancel
        </button>
      </div>

      {!game && (
        <div className="field">
          <label htmlFor="preset">Start from a preset</label>
          <select id="preset" defaultValue="" onChange={(e) => applyPreset(e.target.value)}>
            <option value="">— Blank —</option>
            {PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <fieldset>
        <legend>Basics</legend>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="g-name">Name</label>
            <input
              id="g-name"
              value={form.name}
              maxLength={60}
              required
              onChange={(e) => {
                set('name', e.target.value);
                if (!slugEdited) set('slug', slugify(e.target.value));
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="g-slug">URL slug</label>
            <input
              id="g-slug"
              value={form.slug}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              maxLength={40}
              required
              onChange={(e) => {
                setSlugEdited(true);
                set('slug', e.target.value);
              }}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="g-url">Game website (https://…)</label>
          <input id="g-url" type="url" pattern="https://.*" value={form.url} onChange={(e) => set('url', e.target.value)} />
        </div>
        <label className="radio">
          <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
          Active (shown on the site and accepts runs)
        </label>
      </fieldset>

      <fieldset>
        <legend>Sample pastes</legend>
        <p className="muted small">Paste one or more real results. They're used by the builder and the tester.</p>
        {form.sample_pastes.map((s, i) => (
          <div key={i} className="stack">
            <textarea
              rows={5}
              spellCheck={false}
              value={s}
              onChange={(e) => set('sample_pastes', form.sample_pastes.map((x, j) => (j === i ? e.target.value : x)))}
            />
            {form.sample_pastes.length > 1 && (
              <button
                type="button"
                className="link-btn"
                onClick={() => set('sample_pastes', form.sample_pastes.filter((_, j) => j !== i))}
              >
                Remove sample
              </button>
            )}
          </div>
        ))}
        {form.sample_pastes.length < 10 && (
          <button type="button" className="link-btn" onClick={() => set('sample_pastes', [...form.sample_pastes, ''])}>
            + Add another sample
          </button>
        )}
      </fieldset>

      <fieldset>
        <legend>Scoring</legend>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="g-type">Score type</label>
            <select id="g-type" value={form.score_type} onChange={(e) => setScoreType(e.target.value as ScoreType)}>
              <option value="guesses">Guesses (3/6, X = fail)</option>
              <option value="number">Number</option>
              <option value="tiers">Ranked tiers</option>
              <option value="time">Time (m:ss)</option>
            </select>
          </div>
          {form.score_type === 'number' && (
            <div className="field">
              <label htmlFor="g-dir">Better score is</label>
              <select
                id="g-dir"
                value={form.higher_is_better ? 'higher' : 'lower'}
                onChange={(e) => set('higher_is_better', e.target.value === 'higher')}
              >
                <option value="higher">Higher</option>
                <option value="lower">Lower</option>
              </select>
            </div>
          )}
          {form.score_type === 'guesses' && (
            <div className="field">
              <label htmlFor="g-max-guesses">Max guesses</label>
              <input id="g-max-guesses" type="number" min={1} max={50} value={form.max_guesses} onChange={(e) => set('max_guesses', e.target.value)} required />
            </div>
          )}
        </div>
        {form.score_type === 'tiers' && (
          <div className="field">
            <label htmlFor="g-tiers">Tiers, worst to best (comma-separated)</label>
            <input id="g-tiers" value={form.tiers} onChange={(e) => set('tiers', e.target.value)} placeholder="COMMON, UNCOMMON, RARE, EPIC" required />
          </div>
        )}
        {form.score_type !== 'tiers' && (
          <div className="grid-2">
            <div className="field">
              <label htmlFor="g-min">Min score (optional)</label>
              <input id="g-min" type="number" step="any" value={form.min_score} onChange={(e) => set('min_score', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="g-max">Max score (optional)</label>
              <input id="g-max" type="number" step="any" value={form.max_score} onChange={(e) => set('max_score', e.target.value)} />
            </div>
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend>Format</legend>
        <SampleBuilder
          sample={firstSample}
          scoreType={form.score_type}
          onBuilt={(b) =>
            setForm((f) => ({
              ...f,
              parse_regex: b.parse_regex,
              regex_flags: b.regex_flags,
              score_regex: b.score_regex ?? '',
              score_count: str(b.score_count),
              puzzle_source: b.puzzle_source,
            }))
          }
        />
        <details className="advanced">
          <summary>Advanced: edit the regex by hand</summary>
          <div className="stack">
            <div className="field">
              <label htmlFor="g-regex">Regex (groups: puzzle, score, fail)</label>
              <input id="g-regex" className="code" value={form.parse_regex} onChange={(e) => set('parse_regex', e.target.value)} spellCheck={false} />
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="g-flags">Flags (i, m, s, u)</label>
                <input id="g-flags" className="code" value={form.regex_flags} pattern="[imsu]*" onChange={(e) => set('regex_flags', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="g-count">Required score count (sum)</label>
                <input id="g-count" type="number" min={1} max={50} value={form.score_count} onChange={(e) => set('score_count', e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="g-score-regex">Sum regex (optional: every score match is added up)</label>
              <input id="g-score-regex" className="code" value={form.score_regex} onChange={(e) => set('score_regex', e.target.value)} spellCheck={false} />
            </div>
          </div>
        </details>
      </fieldset>

      <fieldset>
        <legend>Puzzle day</legend>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="g-source">Puzzle number comes from</label>
            <select id="g-source" value={form.puzzle_source} onChange={(e) => set('puzzle_source', e.target.value as PuzzleSource)}>
              <option value="paste">The paste (#1234)</option>
              <option value="date">The date (no number in paste)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="g-reset">Resets at</label>
            <input id="g-reset" type="time" value={form.reset_time} onChange={(e) => set('reset_time', e.target.value)} required />
          </div>
        </div>
        <div className="field">
          <label htmlFor="g-tz">Timezone of the reset</label>
          <input id="g-tz" list="tz-list" value={form.timezone} onChange={(e) => set('timezone', e.target.value)} required />
          <datalist id="tz-list">
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz} />
            ))}
          </datalist>
        </div>
        <div className="grid-2">
          {form.puzzle_source === 'paste' && (
            <div className="field">
              <label htmlFor="g-anchor-puzzle">Puzzle number…</label>
              <input id="g-anchor-puzzle" type="number" min={0} value={form.anchor_puzzle} onChange={(e) => set('anchor_puzzle', e.target.value)} required />
            </div>
          )}
          <div className="field">
            <label htmlFor="g-anchor-date">{form.puzzle_source === 'paste' ? '…was released on' : 'First day'}</label>
            <input id="g-anchor-date" type="date" value={form.anchor_date} onChange={(e) => set('anchor_date', e.target.value)} required />
          </div>
        </div>
        {form.puzzle_source === 'paste' && firstParsed?.ok && (
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              try {
                setForm((f) => ({ ...f, anchor_puzzle: String(firstParsed.run.puzzle), anchor_date: gameDay(config) }));
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            The first sample is today's puzzle (#{firstParsed.run.puzzle}): use it as the anchor
          </button>
        )}
      </fieldset>

      <fieldset>
        <legend>Live test</legend>
        {errors.map((e) => (
          <p key={e} className="msg error">{e}</p>
        ))}
        {warnings.map((w) => (
          <p key={w} className="msg warn">{w}</p>
        ))}
        {!errors.length && today !== null && (
          <p className="msg ok">
            Today's puzzle: <strong>{puzzleLabel(row as unknown as Game, today)}</strong>
          </p>
        )}
        {!errors.length &&
          form.sample_pastes
            .filter((s) => s.trim())
            .map((s, i) => {
              const r = parsePaste(config, s);
              return (
                <p key={i} className={`msg ${r.ok ? 'ok' : 'error'}`}>
                  Sample {i + 1}:{' '}
                  {r.ok ? (
                    <>
                      puzzle {puzzleLabel(row as unknown as Game, r.run.puzzle)} · score{' '}
                      <strong>{formatScore(config, r.run.score, r.run.failed)}</strong>
                    </>
                  ) : (
                    r.error
                  )}
                </p>
              );
            })}
      </fieldset>

      <button type="submit" className="btn" disabled={saving || errors.length > 0}>
        {saving ? 'SAVING…' : game ? 'SAVE CHANGES ▶' : 'CREATE GAME ▶'}
      </button>
      {error && <p className="msg error" role="alert">{error}</p>}
    </form>
  );
}
