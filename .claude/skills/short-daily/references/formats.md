# Race formats

A format is what both models are asked to build, with the copy around it. `formats.js list` shows every format with its verdict, `show <id>` one with its whole prompt, `report` the scores, `pick` the next slot. The house formats are in `scripts/formats.json`, the games in short-game's `games.js`, and the ones runs invent in `STATE/formats.json`.

**Kinds.** `scene` is an animated picture, `game` plays itself and restarts at once, `page` is a website's first screen. A scene is packaged as a `test` ("the pelican test") through short-race, a game or page as a `build` ("build Tetris 🟦") through short-game. A `build` format takes each side's effort in its spec (`"opus 5.5 high"`).

**Scores.** A post's lift is its views over the median race post's at the same age. A format's score is the geometric mean of its lifts, so one viral matchup can't carry it. A post with a model out for under a week measures the release, not the format, so it stays out of the scores: don't spend an untried format on a fresh release.

**Inventing one.** Write it as JSON in the scratchpad and run `formats.js add <file>`. It refuses one that breaks the rules and prints the prompt: read it as both models will.

- Fields: `id`, `kind`, `build` (as in "Build <build>, in index.html…"), `details` (what moves; a game's play), `layout` (shares of the 900x700 stage), `fill` (a scene's background), `restart` (a game's), `subject` (the spoken "Same prompt: …", a few words), `noun` ("pelican" for a test, "Tetris" for a build), `emoji`, `tags` (1–5), `hypothesis` (one sentence on why it may get views). Optional: `packaging`, `what`, `headline`, `caption`.
- What tends to work: one subject that reads in a second at half a phone screen, with motion everywhere; something people already know or search for; something absurd or cute; a result where a mistake shows (physics, game rules, a likeness).
- Avoid text-heavy pages, anything that needs sound, tiny details, real people, logos, and anything a model may refuse. Keep a scene's subject in the stage's upper 60%: TikTok's caption covers the bottom row's lower 40%.
- `formats.js retire <id> --reason "…"` leaves one out (`--undo` brings it back).
