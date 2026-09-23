// Starting points for the admin game form. Anchors and reset times were checked against
// each game's site on 2026-09-23.

import type { GameConfig } from './types.ts';

export interface Preset extends GameConfig {
  key: string;
  name: string;
  slug: string;
  url: string;
  sample_pastes: string[];
}

export const PRESETS: Preset[] = [
  {
    key: 'wordle',
    name: 'Wordle',
    slug: 'wordle',
    url: 'https://www.nytimes.com/games/wordle/index.html',
    score_type: 'guesses',
    higher_is_better: false,
    max_guesses: 6,
    tiers: null,
    min_score: null,
    max_score: null,
    parse_regex: String.raw`^Wordle (?<puzzle>\d[\d,. ]*?) (?<score>[1-6X])/6\*?`,
    regex_flags: 'm',
    score_regex: null,
    score_count: null,
    puzzle_source: 'paste',
    anchor_puzzle: 1922,
    anchor_date: '2026-09-23',
    reset_time: '00:00', // local midnight for each player
    timezone: 'Europe/Stockholm',
    sample_pastes: [
      'Wordle 1,922 5/6\n\n:black_large_square::large_yellow_square::black_large_square::black_large_square::black_large_square:\n:black_large_square::large_green_square::black_large_square::large_yellow_square::black_large_square:\n:large_yellow_square::large_green_square::black_large_square::black_large_square::large_green_square:',
    ],
  },
  {
    key: 'ordel',
    name: 'Ordel',
    slug: 'ordel',
    url: 'https://ordel.se/',
    score_type: 'guesses',
    higher_is_better: false,
    max_guesses: 6,
    tiers: null,
    min_score: null,
    max_score: null,
    parse_regex: String.raw`^Ordel #(?<puzzle>\d+) (?<score>[1-6X])/6`,
    regex_flags: 'm',
    score_regex: null,
    score_count: null,
    puzzle_source: 'paste',
    anchor_puzzle: 1727,
    anchor_date: '2026-09-23',
    reset_time: '06:00', // ordel.se: next game at 06:00 Swedish time
    timezone: 'Europe/Stockholm',
    sample_pastes: [
      'Ordel #1727 3/6 :second_place_medal:\n:black_large_square::black_large_square::large_purple_square::black_large_square::black_large_square:\n:black_large_square::large_green_square::large_purple_square::black_large_square::black_large_square:',
    ],
  },
  {
    key: 'rngdle',
    name: 'RNGdle',
    slug: 'rngdle',
    url: 'https://www.rngdle.org/',
    score_type: 'number',
    higher_is_better: true,
    max_guesses: null,
    tiers: null,
    min_score: 0,
    max_score: null,
    parse_regex: String.raw`^RNGdle\b[\s\S]*?^(?<score>\d[\d,]*) EP$`,
    regex_flags: 'm',
    score_regex: null,
    score_count: null,
    puzzle_source: 'date', // no puzzle number in the paste
    anchor_puzzle: null,
    anchor_date: '2026-09-23',
    reset_time: '00:00', // "one saved roll per UTC day"
    timezone: 'UTC',
    sample_pastes: [
      'RNGdle :game_die: 829285\n\n:large_green_square: UNCOMMON • Top 34%\n\n:large_green_square: :mirror: Pocket Mirror\n:large_green_square: :link: 2 Consecutive Numbers (Contains)\n:large_green_square: :broom: Semi-Clean\n+12 more\n\n7,737 EP',
    ],
  },
  {
    key: 'krillion',
    name: 'Krillion',
    slug: 'krillion',
    url: 'https://krillion.io/',
    score_type: 'number',
    higher_is_better: true,
    max_guesses: null,
    tiers: null,
    min_score: 0,
    max_score: 700, // krillion.io MAX_DAY_SCORE
    parse_regex: String.raw`^Krillion #(?<puzzle>\d+)[^\n]*\n\s*(?<score>\d[\d,]*)$`,
    regex_flags: 'm',
    score_regex: null,
    score_count: null,
    puzzle_source: 'paste',
    anchor_puzzle: 70,
    anchor_date: '2026-09-23',
    reset_time: '00:00', // krillion.io counts days in America/New_York
    timezone: 'America/New_York',
    sample_pastes: [
      'Krillion #70 :shrimp:\n335\n\n:bubbles::squid::fish::squid::izakaya_lantern::squid::fish:',
    ],
  },
  {
    key: 'pokedle',
    name: 'Pokedle',
    slug: 'pokedle',
    url: 'https://pokedle.net/',
    score_type: 'number', // guesses per mode, summed; no guess limit
    higher_is_better: false,
    max_guesses: null,
    tiers: null,
    min_score: 4,
    max_score: null,
    parse_regex: String.raw`#Pokedle #(?<puzzle>\d+)`,
    regex_flags: 'm',
    score_regex: String.raw`(?:Classic|Card|Description|Silhouette): (?<score>\d+)$`,
    score_count: 4,
    puzzle_source: 'paste',
    anchor_puzzle: 1076,
    anchor_date: '2026-09-23',
    reset_time: '00:00', // pokedle.net Europe server: "Midnight at UTC+2"
    timezone: 'Etc/GMT-2', // fixed UTC+2 (IANA Etc signs are inverted)
    sample_pastes: [
      "I've completed all the modes of #Pokedle #1076 today:\n:question: Classic: 3\n:black_joker: Card: 5\n:page_facing_up: Description: 1\n:bust_in_silhouette: Silhouette: 1",
    ],
  },
];
