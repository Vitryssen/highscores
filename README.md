# Highscores

**Leaderboards for daily "-dle" games.** Paste the result you'd share with friends, and see how you stack up: today, all-time, and across every game.

▶ **Play at [vitryssen.github.io/highscores](https://vitryssen.github.io/highscores/)**

## How it works

1. Finish today's puzzle and copy the share text, e.g.
   ```
   Wordle 1,922 3/6
   ⬛🟨⬛⬛⬛
   🟩🟩🟩🟩🟩
   ```
2. Paste it on the site with your name. The game is detected automatically, and you see your score before you submit.
3. Your run lands on that puzzle's leaderboard, with your grid shown next to it.

No account needed: just type your name. It's remembered in your browser, and names are matched regardless of capitals, so `andré` and `André` are the same player.

## Supported games

| Game | Scored by | Best score |
|---|---|---|
| [Wordle](https://www.nytimes.com/games/wordle/index.html) | Guesses (X/6 = failed) | Fewest |
| [Ordel](https://ordel.se/) | Guesses (X/6 = failed) | Fewest |
| [RNGdle](https://www.rngdle.org/) | EP from the day's roll | Highest |
| [Krillion](https://krillion.io/) | Depth score (max 700) | Highest |
| [Pokedle](https://pokedle.net/) | Guesses across all four modes, added up | Fewest |

Each game follows its own daily reset, so "today" always means the same puzzle the game itself is showing. More games can be added by the admin, including games with unusual formats: they paste a sample result and click the puzzle number and the score.

Slack and Discord shortcodes like `:large_green_square:` are fine. They're shown as the real emoji.

## Scoring

- **Every puzzle is a race.** Players are ranked by score, and a tie goes to whoever submitted first.
- **F1 points** go to the top ten: 25, 18, 15, 12, 10, 8, 6, 4, 2, 1. Failed runs are listed but never score.
- **All-time table** per game: total points, wins, runs and average place.
- **Grand Prix**: everyone's points added up across all games.
- **Player profiles**: your rank and points in each game, plus your recent runs.

## Fair play

- **One run per player per puzzle.** A second paste for the same puzzle is rejected.
- **Only today's or yesterday's puzzle** can be submitted, so nobody can dig up an old best score.
- **Impossible scores are rejected**, like a Krillion score above 700 or an unfinished Pokedle run.
- **Submissions are rate-limited** to stop spam.
- **Admins can fix mistakes.** They can edit or delete a run (the player can then submit again), rename or remove players, and add runs for older puzzles.

Nothing can prove a pasted result was really played, so the leaderboard runs on trust between friends, with the admin as referee.

## Privacy and security

- No sign-up, no tracking, no ads, and no third-party requests: fonts are served by the site itself.
- The only thing stored about you is the name you type and the results you paste. Rate limiting keeps only a one-way hash of your IP address, never the address itself.
- Admin access needs a password **and** an authenticator-app code.

---

Running your own copy? See [docs/SETUP.md](docs/SETUP.md).
