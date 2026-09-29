---
name: short-model-compare
version: 1.1.0
argument-hint: "\"<model A>\" vs \"<model B>\" [prompt: …]"
description: "Make a short vertical (9:16) video that races two AI models on the same prompt in lpm, side by side: Run in duplicates puts each model in its own copy of the project, shown as side-by-side columns, the same prompt sent to both, the real finish times on the pane headers, then both results live in lpm's browser. Default prompt: a giraffe flying a one-seat plane as animated HTML. Models in, 1080x1920 MP4 + cover + post caption out. Use when the user asks for a TikTok, Reel or Short that compares models, such as \"opus 5.5 max vs gpt 6 astra ultra\", \"opus 5.5 vs grok 4.7\" (Claude models run in Claude Code, GPT models in Codex, every other model in Cursor CLI) or \"opus 5 vs opus 5.5\"."
---

Races two models on one prompt and cuts it into a TikTok. It writes a lesson for the `tiktok-video-lesson` skill and records it with that skill's pipeline. Everything in that SKILL.md still holds and is not repeated here: payoff-first cut, captions, safe zones, review, the lesson data dir and workspace, foreground takes.

## What the video shows (about 25 s)

1. Cold open on the payoff for two lines (`"open": 2`, about 4–5 s): both animations running side by side, a colour bar over each column with the model and its finish time, and the headline. It starts with the two model names slammed in big (`slam` in lesson.json, written by `new.js`): model A in cyan from the left, VS, model B in pink from the right, over the dimmed pages. At 1.65 s they shrink away into the headline, and that slam frame is the cover. A race between brands is named the way people search for it: "Claude or ChatGPT?" spoken, "Claude vs ChatGPT: Fable 5.1 vs GPT-6 Sol 🦒" as the headline, "Claude vs ChatGPT for coding:" leading the caption ("Claude vs Grok" for a Grok model in Cursor). The second line ("Same prompt. Two very different giraffes.") keeps the result on screen: a one-line opening lost most viewers at 0:02, when it cut to the setup.
2. Model A picked in run #1's composer (its Model menu), the prompt typed into that composer, then **Run in duplicates** with 2 runs, the copy set to model B in the dialog.
3. The copy is created and opens as a second column beside run #1; each column pushed in on its CLI's start banner (the model name is on screen).
4. The build is jump-cut. The column clocks run while the line is spoken and stop on each agent's real finish.
5. Both `index.html` files open in lpm's own browser, one per column. The payoff shot starts as soon as the camera goes wide on them, so it outlasts the two-line opening. Every video ends on them by asking viewers which two models they want compared next, in the comments ("Which giraffe wins? Comment two models to race next."), and the caption asks too. Keep that ending when rewording `lesson.json`. It asks for suggestions; it never promises or teases a particular next video.

## Setup: duplicates side by side

The race uses lpm's own **Run in duplicates** with **Open side by side**, not a hand-built split:

- One project with a header button that launches model A's CLI. Its terminal is run #1, and its composer's Model menu picks model A on camera: hover the model, click its level in the flyout. When that menu can't pick model A (Codex, whose picker isn't scripted, or a Claude model that isn't its family's newest), the button launches model A pinned with its session-only flags instead (the launch commands below).
- The prompt goes into run #1's composer, then the send button's caret → **Run in duplicates** → 2 runs. **Open side by side** stays on. In the dialog, the copy gets model B one of two ways:
  - Same CLI: the copy's model picker (Model / Level, next to its name) is set to model B. It offers each Claude family by its bare name, which Claude Code resolves to that family's newest model, so `new.js` refuses a Claude model B that isn't its family's newest (`opus 5` while Opus 5.5 exists): put that one on the left instead, as run #1.
  - Claude vs Codex: the project gets a second header button that launches model B pinned. The copy's run menu ("Run on this copy", right of its name) is set to Action → that button, and the prompt is typed again into the copy's own box, since an override starts empty. That second typing is jump-cut.
  - Claude or Codex vs Cursor: the same, except that nothing is typed: the Cursor button carries the prompt as its launch argument, read from `prompt.txt` in the lesson workspace (outside both projects). lpm folds a prompt into the launch command only for Claude Code and Codex, and a prompt pasted into a CLI that is still booting gets lost. A Cursor model is always model B: `new.js` refuses one on the left, and two Cursor models can't race each other.
- lpm clones the project into a copy (its own folder, so each agent writes its own `index.html`), starts the copy's agent on model B, sends it the prompt, and shows run #1 and the copy as two columns. Run #1 keeps the keyboard.

## Models

Each side is a loose spec: model, then an optional effort. The model picks the CLI: Claude models run in Claude Code and GPT models in Codex, never in Cursor, though Cursor lists them too. Every other model runs in Cursor CLI.

- Claude Code: `opus`, `opus 5`, `opus 5.5`, `sonnet`, `haiku`, `fable 5.1`… A bare family means its newest version. Effort: `low`, `medium`, `high`, `xhigh`, `max`.
- Codex: `gpt 6 astra`, `gpt-5.6 sol`, `astra`, `gpt 5.5`… Effort: whatever that model supports (`ultra` only on some).
- Cursor CLI (`agent`): `grok 4.7`, `gemini 3.7 flash`, `kimi k3`, `glm 5.2`, `composer 2.5`… Cursor lists one model per level (`grok-4.7-xhigh`), so most need an effort. The brand in the headline is the model's own name ("Claude vs Kimi"), "Cursor" only for Composer. The narration, captions and post never say a model runs "in Cursor": "The copy gets Grok 4.7", not "Grok 4.7 in Cursor".
- No effort means the CLI's default, and the labels leave it out.

`scripts/models.js` checks both against what is installed right now: Claude Code's own model table (read from its binary), Codex's `~/.codex/models_cache.json` and `agent --list-models`. It rejects an effort the model does not support, because Codex fails such a run with a 400 in the middle of the take. Typos such as `utra` resolve.

```
node scripts/models.js "opus 5.5 max" "gpt 6 astra ultra"
```

Launch commands (session-only flags, so nothing in the user's config changes):
- `claude --model <id> [--effort <e>] --permission-mode acceptEdits`
- `codex -m <slug> [-c model_reasoning_effort=<e>] -c check_for_update_on_startup=false` (Codex's update prompt once ran an update on a stray Enter)
- `agent --model <slug> --trust --force "$(cat <workspace>/prompt.txt)"`: `--trust` skips the new copy's folder-trust prompt, and `--force` runs its shell calls without an approval that would stall the race (its status line then reads "Run Everything"). Cursor does save `--model` as the user's default; see Traps.

## Make one

1. Write the lesson:

   ```
   node scripts/new.js "opus 5.5 max" "gpt 6 astra ultra"
   node scripts/new.js "opus 5" "opus 5.5"
   node scripts/new.js "opus 5.5 low" "opus 5.5 max" --prompt "<prompt>" --subject "a lava lamp"
   ```

   It creates `~/Movies/lpm-lessons/tiktok/<slug>/` with `lesson.json` (narration, headline, post), `compare.json` (both models, the prompt), `beats.js` (a stub that loads `scripts/beats.js`, which brings in the tiktok kit) and `take.sh` (`tiktok-video-lesson/scripts/take.sh`, inside the Claude-default backup when model A is picked on camera). Both point into this repo by absolute path, so the folder needs nothing from outside git. `--subject` is the short noun phrase the narration and the caption use for a custom prompt. `--slug` names the folder. `--force` rewrites an existing one.

   A custom prompt must still ask for `index.html` at the project root: the race waits for that file, and the reveal opens it. It must also keep "Don't run or test it.": Claude runs with `acceptEdits`, so a model that checks its page with a shell command waits on an approval nobody gives, and its turn never ends (Opus 5.5 xhigh did, with `node check.js`). It should also say the page is shown in a tall, narrow panel of any size, lay the scene out on a fixed 420x740 stage with the subject's size given as shares of that stage (the default: plane about 80% of the width, body about 60% down, giraffe's head about 20% from the top), and ask for the whole stage to be scaled to fit the panel, never cropped. Pixel sizes break at other panel sizes, and percentages of the panel itself pull against each other when its shape changes. "Fill the window" made one model crop its scene, and without sizes the two results come out at different scales, which makes the side-by-side comparison harder.

2. Tell the user that a take is starting and that they should leave the keyboard and mouse alone. A take drives the real pointer, and a stray key lands in the prompt.

3. Dry run: `<slug>/take.sh --no-audio --frames`, then check `frames/`. The preflight runs first, and a take stops before touching anything when it lists something missing. Both columns should be there, both banners should show the right model, and both prompts should be sent. There should be no intro or update screen in either column.

4. The video: `<slug>/take.sh --frames`. The take lasts as long as the slower model (15-minute limit per side, or `timeoutMin` in compare.json; a side that runs out shows `✗ no page`. xhigh and max can think for over 15 minutes before writing). The real times go to `<slug>/result.json`.

5. Review as `tiktok-video-lesson` says (sheet, cover, popups, hook length). Then open the MP4 and check that both pages are moving and are the models' real output. `take.sh --mux-only` re-cuts without a retake.

Finish the reply with each model's time from `result.json`, then the rendered MP4's full absolute path. To post it, use `short-upload`.

## Traps

- The voice is made before the take, so the narration never names a winner. The times on the column bars are the result.
- Time each side from its own prompt, not from the Run click. The copy starts later (the clone, then its agent's boot), so a clock started at Run would hand run #1 a head start.
- The composer's Model menu runs Claude's `/model` and `/effort`, and Claude saves both as the user's default for new sessions (`model` and `modelSettings` in `~/.claude/settings.json`). Cursor CLI saves the model it was launched with (`model`, `selectedModel`… in `~/.cursor/cli-config.json`). `take.sh` sets each file aside first and puts those keys back on exit (`scripts/cli-default.js`). A take killed hard leaves `_claude-settings.backup.json` or `_cursor-settings.backup.json` in the lesson folder; the next `take.sh` run keeps that backup and restores from it.
- Cursor keeps no transcript with times. The race reads its chat (`~/.cursor/chats/<md5 of the folder>/<chat>/store.db`, `scripts/cursor.js`): the prompt is in when a user message holds `<user_query>`, and the turn is over when the last message is the model's with no tool call. A side's clock starts at `meta.json`'s `createdAtMs` (the prompt can reach the store only with the model's first step, which took 28 minutes at xhigh and once handed Grok a 28-minute head start) and stops at `updatedAtMs`, the chat's last write. Its model name shows on its status line, at the foot of its screen, not in a banner. The store is in WAL mode and a read-only open fails without its `-shm` file, so the race reads a copy of `store.db` and its `-wal`; a long chat's messages run past 1 MB of `sqlite3` output.
- A model name the transcript mishears fails the voice's dropped-words check. Reword that line in `lesson.json`, or add the heard spelling to `HEARD_AS` in `video-lesson/scripts/words.js`, then run again with `--respeak`.
- Two sides may not be identical: `new.js` refuses when model and effort both match.
- A new Codex model can open with a one-time intro screen, and that screen takes the first Enter. If the dry run shows one, dismiss it in the `hook` beat before the prompt is typed.
- The project gets its own `global.yml` with no actions, which keeps lpm's default Claude and Codex buttons out of the header, so only the race's buttons show.
- lpm refuses a project with no service, so the project has a `preview` service that is never started.
- The copy inherits the project's header buttons, so each is named after its CLI ("Claude", "Codex", "Cursor"), not a model; otherwise the model B column would show a model A button. The banners and colour bars name the models.
- The copy is a clone of run #1's folder, made a second or two after run #1 gets the prompt. A model fast enough to write `index.html` in that window would hand the copy its page; the `go` beat logs a warning if the copy starts with one.
- Codex prints the path of the `index.html` it wrote, and lpm opens a file preview over everything when that path is clicked. The reveal makes a passive column active by clicking its pane header, never its terminal, and presses Escape if a dialog is open.
- `take.sh` runs under `caffeinate`: a slow model can leave the pointer still for longer than the display-sleep timer.
- Codex 0.157 changed its rollout: the prompt is an `item_completed` event whose item is a `UserMessage`, not a `user_message` event. The race looks for either. A side whose clock never starts (no `sentAt`) never finishes and ends as `✗ no page` even with `index.html` written, so check the rollout format first when a Codex update lands.
