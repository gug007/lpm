---
name: short-game
version: 1.0.0
argument-hint: "\"<model A>\" vs \"<model B>\" [game: runner|racer|flappy|snake|shooter|breakout] [title: …]"
description: "Make a short vertical (9:16) video where two AI models build the same self-playing game in lpm, side by side, and both games then play live in lpm's browser. It is a short-race whose prompt comes from a ready game catalog (3D endless runner, 3D racer, Flappy Bird, Snake, space shooter, Breakout), with the hook, headline, title and caption written around the game and the brand pair people search for (\"Claude vs Gemini: build a 3D game 🎮\"). Models in, 1080x1920 MP4 + cover + post caption out. Use when the user asks for a TikTok, Reel or Short where models build a game, such as \"opus 5.5 high vs gemini 3.1 pro build a 3D game\", \"Claude vs GPT 6: Opus 5.5 high vs Astra high build a 3D game\" or \"claude vs grok make flappy bird\". A race on any other prompt is short-race."
---

A short-race with a game for its prompt. `scripts/new.js` writes the lesson through short-race's own `new.js`, so everything in `../short-race/SKILL.md` and `../short/SKILL.md` still holds (models and CLIs, Run in duplicates, the take, the review) and is not repeated here. This file covers only what a game race adds.

## Why games

Creator Search Insights (global, last 7 days, 2026-10-07): "Using AI to build a 3D game" 314K, "making a game with ai" 230K, "ai game generator" 274K, "how to make game with ai" 85K and "ai games to play" 93K (both up 1000%+). For the brand pairs: "claude vs gemini" 267K, "claude ai vs chatgpt" 252K, "claude vs grok" 204K. Races get far more views than feature shorts, and a game that plays itself keeps the reveal moving. The first game race was Opus 5.5 high (12:16) vs Gemini 3.1 Pro (2:24) on the 3D runner.

## The games

| key | builds | headline |
| --- | --- | --- |
| `runner` (default) | a 3D endless runner: lanes, jumps, coins | build a 3D game 🎮 |
| `racer` | a 3D highway racer weaving through traffic | build a 3D racing game 🏎️ |
| `flappy` | Flappy Bird through scrolling pipes | build Flappy Bird 🐦 |
| `snake` | Snake on a 20x20 board | build Snake 🐍 |
| `shooter` | a space shooter blasting enemy waves | build a space shooter 🚀 |
| `breakout` | Breakout with fresh brick walls | build Breakout 🧱 |

`node scripts/new.js --list` prints them. Every prompt in `scripts/games.js` keeps short-race's rules: `index.html` at the project root, one file, no libraries or images, the 420x740 stage with sizes given as shares of it, scaled to fit and never cropped, and "Don't run or test it". On top of that the game plays itself and restarts at once after a crash, so the reveal is live play with nobody at the controls. The `runner` prompt is word for word the one that was raced and published, so leave it as it is. Add a new game to `games.js` in the same shape (build, play, layout, restart, then the copy fields), not as a one-off `--prompt`.

## Make one

1. Write the lesson:

   ```
   node scripts/new.js "opus 5.5 high" "gemini 3.1 pro"
   node scripts/new.js "opus 5.5 high" "gpt 6 astra high" --pair "Claude vs GPT 6" --title "Claude vs GPT 6: Opus 5.5 high vs Astra high build a 3D game"
   node scripts/new.js "opus 5.5 high" "grok 4.7 xhigh" --game flappy
   ```

   It runs short-race's `new.js` with the game's prompt and subject, then rewrites the lesson around the game:
   - Hook: the brand pair short-race names the way people search for it ("Claude or *Gemini*?"). `--pair "A vs B"` makes it "A or *B*?".
   - Headline: "<pair>: build a 3D game 🎮".
   - Title: "<pair>: <A> vs <B> build a 3D game". `--title` uses the user's exact wording (label words such as "Astra high").
   - Caption: "<pair> for coding: making a 3D game with AI. <A> and <B> got the same prompt, a self-playing endless runner, and built it side by side in lpm's terminal. Which one wins? Comment the two models you want me to race next."
   - `compare.json`: `game` and `timeoutMin: 40`.

   The slug is `<A>-vs-<B>-<game>`. `--slug` and `--force` work as in short-race.

   **Effort.** A Claude side with no effort is raced at high, and the script says so. Otherwise it would run at the user's saved default: Opus 5.5 at xhigh on the runner thought for 21 minutes, hit Claude Code's output cap, resumed, and still had no page at the 40-minute limit. When the user asks for xhigh or max, run it, but warn them it may time out. Gemini 3.1 Pro has one fixed level and takes no effort. A model name in `--pair` that the voice transcript mishears fails the dropped-words check: see short-race's Traps.

2. Tell the user a take is starting and to leave the keyboard and mouse alone.

3. Dry run on a trivial prompt. It takes about 2 minutes instead of a whole race:

   ```
   node scripts/new.js "<A>" "<B>" --dry <scratchpad>/race-dry
   LPM_TIKTOK_DIR=<scratchpad>/race-dry <scratchpad>/race-dry/dry/take.sh --no-audio --frames
   ```

   It uses the same models and flow, a red-square prompt and a 10-minute limit. Check `frames/` as short-race says: `02-run.jpg` shows both banners with the right models, both prompts sent and no intro screen, and `05-payoff.jpg` shows both pages open.

4. The video: `<slug>/take.sh --frames`, run with Bash `run_in_background` and waited on with an until-loop over its log. A take lasts as long as the slower side: Gemini 3.1 Pro finished the runner in 2–3 minutes, Opus 5.5 high in 12. When a side times out (`✗ no page`), retake at a lower effort under a new slug. Keep the timed-out folder, and don't post it.

5. Review as `short` says, and look at every second yourself: `../short/scripts/scan.sh <slug> <out dir>` (the out dir must exist). The QA screen check only reads names in Latin script, so a macOS notification carrying the account name in another script (an AirPods battery alert did) passes it.

Finish the reply with each model's time from `result.json`, then the rendered MP4's full absolute path. To post it, use `short-publish`.

## A popup in the take

A popup over static UI (a pane header, the window's top bar) can be covered instead of retaken:

```
node scripts/patch.js where <slug> 11.5                                # MP4 seconds → record.mkv seconds
node scripts/patch.js peek  <slug> 111 115 900,0,900,220               # a tile every 0.5 s → <slug>/_patch/peek.png
node scripts/patch.js apply <slug> 111.9-114.2 1244,0,520,140 111      # span, box, clean frame
node scripts/patch.js peek  <slug> 111 115 900,0,900,220               # check: no popup, no seam
<slug>/take.sh --mux-only
```

Times and boxes are `record.mkv`'s own, in pixels of the 2x window capture. The clean frame must come before the popup slides in and show the same UI as the span it covers. `apply` keeps the untouched take as `record.popup.mkv` and always starts from it, so a rerun replaces the earlier patches: give every popup in one call. It lists the spans in `PATCHED.json`. Retake instead when the popup covers anything that moves: a terminal, a game page or the pointer.
