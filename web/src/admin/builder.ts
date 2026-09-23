// Build-from-sample: the admin marks the puzzle number and score in a pasted sample, and this
// generates the regexes. The output is a starting point: the live tester shows whether it
// works, and the regex fields stay editable.

import type { ScoreType } from '@shared/types.ts';

export interface Token {
  line: number;
  start: number;
  end: number;
  text: string;
}

export type Role = 'puzzle' | 'score' | 'sum';
export type Marks = Partial<Record<Role, Token>>;

export interface BuiltRegex {
  parse_regex: string;
  regex_flags: string;
  score_regex: string | null;
  score_count: number | null;
  puzzle_source: 'paste' | 'date';
}

// Clickable tokens: times (1:05), numbers with separators (1,922), single digits, and words.
const TOKEN = /\d+(?::\d{2}){1,2}|\d[\d,.]*\d|\d|[A-Za-z]+/g;

export function tokenize(paste: string): { lines: string[]; tokens: Token[] } {
  const lines = paste.split('\n');
  const tokens = lines.flatMap((text, line) =>
    [...text.matchAll(TOKEN)].map((m) => ({
      line,
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
    })),
  );
  return { lines, tokens };
}

const SCORE_PATTERN: Record<ScoreType, string> = {
  guesses: String.raw`[\dXx]+`,
  number: String.raw`\d[\d,]*`,
  tiers: String.raw`[A-Za-z]+`,
  time: String.raw`\d+(?::\d{2}){1,2}`,
};
const PUZZLE_PATTERN = String.raw`\d[\d,.]*`;

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Literal text, with whitespace runs made flexible and (optionally) digits generalized. */
function literal(text: string, generalizeDigits = false): string {
  return text
    .split(/([ \t]+|\d+)/)
    .filter(Boolean)
    .map((part) => {
      if (/^[ \t]+$/.test(part)) return '[ \\t]+';
      if (generalizeDigits && /^\d+$/.test(part)) return '\\d+';
      return escape(part);
    })
    .join('');
}

/** A stable label right before a token, e.g. "Ordel #" or "#Pokedle #". */
function anchorBefore(prefix: string): { text: string; atLineStart: boolean } | null {
  const m = prefix.match(/\S*[A-Za-z]\S*[^A-Za-z]*$/);
  return m ? { text: m[0], atLineStart: m.index === 0 } : null;
}

/** Text right after a score that pins it down: "/6" in "3/6 🥈", " EP" in "7,737 EP". */
function suffixAfter(rest: string): string {
  const adjacent = rest.match(/^[^\sA-Za-z0-9]?[A-Za-z0-9]+/);
  if (adjacent) return escape(adjacent[0]);
  if (rest === '') return '$';
  if (/^[ \t]+[A-Za-z]+[ \t]*$/.test(rest)) return `${literal(rest.trimEnd())}$`;
  return '';
}

function capture(role: 'puzzle' | 'score', scoreType: ScoreType): string {
  return role === 'puzzle' ? `(?<puzzle>${PUZZLE_PATTERN})` : `(?<score>${SCORE_PATTERN[scoreType]})`;
}

export function buildRegex(paste: string, marks: Marks, scoreType: ScoreType): BuiltRegex | { error: string } {
  if (!marks.score && !marks.sum) return { error: 'Mark the score (or one of the scores to add up).' };
  if (marks.score && marks.sum) return { error: 'Mark either a single score or a score to add up, not both.' };
  const { lines } = tokenize(paste);

  // Main regex: identifies the game, captures the puzzle number and a single score.
  const main = (
    [
      marks.puzzle && { role: 'puzzle' as const, token: marks.puzzle },
      marks.score && { role: 'score' as const, token: marks.score },
    ].filter(Boolean) as { role: 'puzzle' | 'score'; token: Token }[]
  ).sort((a, b) => a.token.line - b.token.line || a.token.start - b.token.start);

  let parse: string;
  if (main.length === 0) {
    const word = lines[0]?.match(/[A-Za-z][\w'’-]*/)?.[0];
    if (!word) return { error: 'The first line needs a word that identifies the game.' };
    parse = `^${escape(word)}\\b`;
  } else {
    const first = main[0].token;
    const prefix = lines[first.line].slice(0, first.start);
    const anchor = anchorBefore(prefix);
    parse = '';
    if (first.line > 0) {
      const word = lines[0].match(/[A-Za-z][\w'’-]*/)?.[0];
      if (word) parse += `^${escape(word)}\\b[\\s\\S]*?`;
    }
    parse += anchor ? `${anchor.atLineStart ? '^' : ''}${literal(anchor.text)}` : `^${literal(prefix)}`;
    parse += capture(main[0].role, scoreType);

    for (let i = 1; i < main.length; i++) {
      const prev = main[i - 1].token;
      const cur = main[i].token;
      if (cur.line === prev.line) {
        parse += literal(lines[cur.line].slice(prev.end, cur.start), true);
      } else {
        parse += `[\\s\\S]*?^${literal(lines[cur.line].slice(0, cur.start), true)}`;
      }
      parse += capture(main[i].role, scoreType);
    }
    const last = main[main.length - 1];
    if (last.role === 'score') parse += suffixAfter(lines[last.token.line].slice(last.token.end));
  }

  // Sum regex: generalizes the marked line's label so every similar line matches.
  let scoreRegex: string | null = null;
  let scoreCount: number | null = null;
  if (marks.sum) {
    const t = marks.sum;
    const line = lines[t.line];
    const separator = line.slice(0, t.start).match(/[^A-Za-z0-9]*$/)?.[0] ?? '';
    scoreRegex = `^[^\\n]*?${literal(separator)}${capture('score', scoreType)}${suffixAfter(line.slice(t.end))}`;
    try {
      scoreCount = [...paste.matchAll(new RegExp(scoreRegex, 'gm'))].length || null;
    } catch {
      return { error: "Couldn't build a regex for the score lines." };
    }
  }

  try {
    new RegExp(parse, 'm');
  } catch {
    return { error: "Couldn't build a regex from those marks. Try marking different parts." };
  }

  return {
    parse_regex: parse,
    regex_flags: 'm',
    score_regex: scoreRegex,
    score_count: scoreCount,
    puzzle_source: marks.puzzle ? 'paste' : 'date',
  };
}
