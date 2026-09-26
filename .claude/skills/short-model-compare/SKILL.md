---
name: short-model-compare
version: 1.0.0
argument-hint: "\"<model A>\" vs \"<model B>\" [prompt: …]"
description: "Make a short vertical (9:16) video that races two AI models on the same prompt in lpm, side by side: each model in its own pane and folder, the same prompt sent to both, the real finish times on the pane headers, then both results live in lpm's browser. Default prompt: a giraffe flying a one-seat plane as animated HTML. Models in, 1080x1920 MP4 + cover + post caption out. Use when the user asks for a TikTok, Reel or Short that compares models, such as \"opus 5.5 max vs gpt 6 astra ultra\" or \"opus 5 vs opus 5.5\"."
---

Races two models on one prompt and cuts it into a TikTok. It writes a lesson for the `tiktok-video-lesson` skill and records it with that skill's pipeline. Everything in that SKILL.md still holds and is not repeated here: payoff-first cut, captions, safe zones, review, the lesson data dir and workspace, foreground takes.

## What the video shows (about 25 s)

1. Cold open on the payoff: both animations running side by side, a colour bar over each pane with the model and its finish time, and the headline ("Opus 5.5 max vs GPT-6 Astra ultra 🦒").
2. The left pane, then the right, each pushed in on its CLI's start banner (the model name is on screen).
3. The same prompt typed into both composers (jump-cut), sent to both.
4. The build is jump-cut. The pane clocks run while the line is spoken and stop on each agent's real finish.
5. Both `index.html` files open in lpm's own browser, one per pane, and the video ends on them.

Each model is a header button in one lpm project (`arena`), labelled with the model and effort, that launches its CLI in its own folder. The two agents never share a folder, so each one writes its own `index.html`.

## Models

Each side is a loose spec: model, then an optional effort.

- Claude Code: `opus`, `opus 5`, `opus 5.5`, `sonnet`, `haiku`, `fable 5.1`… A bare family means its newest version. Effort: `low`, `medium`, `high`, `xhigh`, `max`.
- Codex: `gpt 6 astra`, `gpt-5.6 sol`, `astra`, `gpt 5.5`… Effort: whatever that model supports (`ultra` only on some).
- No effort means the CLI's default, and the labels leave it out.

`scripts/models.js` checks both against what is installed right now: Claude Code's own model table (read from its binary) and Codex's `~/.codex/models_cache.json`. It rejects an effort the model does not support, because Codex fails such a run with a 400 in the middle of the take. Typos such as `utra` resolve.

```
node scripts/models.js "opus 5.5 max" "gpt 6 astra ultra"
```

Launch commands (session-only flags, so nothing in the user's config changes):
- `claude --model <id> [--effort <e>] --permission-mode acceptEdits`
- `codex -m <slug> [-c model_reasoning_effort=<e>] -c check_for_update_on_startup=false` (Codex's update prompt once ran an update on a stray Enter)

## Make one

1. Write the lesson:

   ```
   node scripts/new.js "opus 5.5 max" "gpt 6 astra ultra"
   node scripts/new.js "opus 5" "opus 5.5"
   node scripts/new.js "opus 5.5 low" "opus 5.5 max" --prompt "<prompt>" --subject "a lava lamp"
   ```

   It creates `~/Movies/lpm-lessons/tiktok/<slug>/` with `lesson.json` (narration, headline, post), `compare.json` (both models, the prompt), `beats.js` (a stub that loads `scripts/beats.js`) and `take.sh`. `--subject` is the short noun phrase the narration and the caption use for a custom prompt. `--slug` names the folder. `--force` rewrites an existing one.

   A custom prompt must still ask for `index.html` at the project root: the race waits for that file, and the reveal opens it.

2. Tell the user that a take is starting and that they should leave the keyboard and mouse alone. A take drives the real pointer, and a stray key lands in the prompt.

3. Dry run: `<slug>/take.sh --no-audio --frames`, then check `frames/`. Both header buttons should be there, both banners should show the right model, and both prompts should be sent. There should be no intro or update screen in either pane.

4. The video: `<slug>/take.sh --frames`. The take lasts as long as the slower model (15-minute limit per side, or `timeoutMin` in compare.json; a side that runs out shows `✗ no page`. xhigh and max can think for over 15 minutes before writing). The real times go to `<slug>/result.json`.

5. Review as `tiktok-video-lesson` says (sheet, cover, popups, hook length). Then open the MP4 and check that both pages are moving and are the models' real output. `take.sh --mux-only` re-cuts without a retake.

Finish the reply with each model's time from `result.json`, then the rendered MP4's full absolute path. To post it, use `short-upload`.

## Traps

- The voice is made before the take, so the narration never names a winner. The times on the pane bars are the result.
- A model name the transcript mishears fails the voice's dropped-words check. Reword that line in `lesson.json`, or add the heard spelling to `HEARD_AS` in `video-lesson/scripts/words.js`, then run again with `--respeak`.
- Two sides may not be identical: `new.js` refuses when model and effort both match.
- A new Codex model can open with a one-time intro screen, and that screen takes the first Enter. If the dry run shows one, dismiss it in the `hook` beat before the prompt is typed.
- Splitting a pane empties its browser. Both panes are split in `hook`, and the browsers only open after the race.
- The project gets its own `global.yml` with no actions, which keeps lpm's default Claude and Codex buttons out of the header. Only the two model buttons show.
- lpm refuses a project with no service, so `arena` has a `preview` service that is never started.
- The header buttons are found by label. An exact label match wins, which keeps `Opus 5` off the `Opus 5.5` button.
