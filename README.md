# Highscores

**Leaderboards for daily "-dle" games.** Paste the result you'd share with friends, and see how you stack up: today, all-time, and across every game.

▶ **Play at [vitryssen.github.io/highscores](https://vitryssen.github.io/highscores/)**

## How it works

1. Finish today's puzzle and copy the share text, e.g.
   ```
   Wordle 1,922 3/6
   ⬛🟨⬛⬛⬛
   🟨⬛🟩⬛🟩
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

Each game follows its own daily reset, so "today" always means the same puzzle the game itself is showing. A countdown on every game shows when the next puzzle arrives, and the board rolls over by itself at that moment. A **Play ↗** link on every game takes you to the game itself. More games can be added by the admin, including games with unusual formats: they paste a sample result and click the puzzle number and the score.

Slack and Discord shortcodes like `:large_green_square:` are fine. They're shown as the real emoji.

**Missing a game?** [Request it](https://vitryssen.github.io/highscores/#/request) with a link and a result you shared. If you paste a result the site doesn't recognise, it offers to request that game for you. Requests are listed publicly as wanted, added or declined. Asking for a game that's already been requested adds a +1 to it, so the admin can see what people want most.

For example, a request for Connections:

| Field | Value |
| --- | --- |
| Game | Connections |
| Link | https://www.nytimes.com/games/connections |
| Note | Fewest mistakes wins: every mixed row is one. |

```text
Connections
Puzzle #1201
🟨🟪🟦🟦
🟦🟩🟪🟦
🟩🟩🟨🟩
🟩🟩🟩🟩
🟨🟨🟨🟨
🟪🟪🟪🟪
🟦🟦🟦🟦
```

And one for LoLdle:

| Field | Value |
| --- | --- |
| Game | LoLdle |
| Link | https://loldle.net |
| Note | Add up the guesses from all modes. Fewest wins. |

```text
I've completed all the modes of #LoLdle #1540 today:
❓ Classic: 11
💬 Quote: 2
😀 Emoji: 54

https://loldle.net
```

## Scoring

- **Every puzzle is a race.** Players are ranked by score, and a tie goes to whoever submitted first.
- **F1 points** go to the top ten: 25, 18, 15, 12, 10, 8, 6, 4, 2, 1. Failed runs are listed but never score.
- **All-time table** per game: total points, wins, runs, average place and streak.
- **Streaks** per game: 🔥 counts the days in a row you've played, and 👑 counts the puzzles in a row you've won. Miss a day and the play streak resets. Lose a puzzle and the win streak resets.
- **Monthly Grand Prix**: everyone's points added up for each calendar month, across the games you pick (Wordle, Ordel and RNGdle by default; your choice is remembered in your browser, and profiles use it too). It starts over on the 1st, and the month's leader becomes champion. Earlier months can be browsed, and past champions are listed in the **Hall of fame**.
- **Your own layout**: press **Rearrange** above today's games to drag them, or move them with the arrows, into the order you like. The order is remembered in your browser, like your name.
- **Player profiles**: your Grand Prix standing and titles, your rank, points, wins and current and best streaks in each game, and every run you've submitted, a page at a time.

## Fair play

- **One run per player per puzzle.** A second paste for the same puzzle is rejected.
- **Only today's or yesterday's puzzle** can be submitted, so nobody can dig up an old best score.
- **Impossible scores are rejected**, like a Krillion score above 700 or an unfinished Pokedle run.
- **Submissions are rate-limited** to stop spam.
- **Admins can fix mistakes.** They can edit or delete a run (the player can then submit again), rename or remove players, and add runs for older puzzles.

Nothing can prove a pasted result was really played, so the leaderboard runs on trust between friends, with the admin as referee.

## Privacy and security

- No sign-up, no tracking, no ads, and no third-party requests: fonts are served by the site itself.
- The only thing stored about you is the name you type and the results you paste. Rate limiting and +1s on game requests keep only a one-way hash of your IP address, never the address itself, and a request's +1 hashes are deleted once it's resolved. Links and sample results in requests are only shown to the admin.
- Admin access needs a password **and** an authenticator-app code.

## Planned features

- **Player accounts.** Sign up with an email and password so that only you can submit runs under your name. The name you already play under will carry over to your account.

---

Running your own copy? See [docs/SETUP.md](docs/SETUP.md).
