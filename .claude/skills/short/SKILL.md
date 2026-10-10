---
name: short
version: 1.2.0
argument-hint: "\"<topic>\" [-- <notes>]"
description: "Make a short vertical (9:16) lpm lesson that feels native to TikTok, Reels and Shorts: a payoff-first hook, fast push-ins that follow the action, word-by-word burned-in captions, numbered step stickers, jump cuts over waiting, recorded from the real desktop app. Topic in, 1080x1920 MP4 + cover + post caption out. Use when the user asks for a TikTok, a Reel, a Short, or any vertical or short-form video about lpm."
---

Make a vertical lesson video from a topic and optional notes. It is not a trimmed YouTube lesson: the script, the pacing and the picture are built for a phone held upright with the sound possibly off.

The recorder, the voice and the mix are the `lesson` skill's (`../lesson/scripts`). Everything that skill's SKILL.md says about driving the app still holds and is not repeated here: the pristine `~/.lpm-lessons` data dir, `/Users/Shared/lpm-lessons` workspace, the lesson control socket, real pointer and keys (`s.keys("return")`, never cliclick `kp:`), agent trust, `waitFor`/`click`/`type` selectors, foreground takes, the OpenAI key in the Keychain, the preflight and lint that check the Mac and the script before every take, the take folders (`_takes/`), the guarded agent settings and the checks after the mux (`qa/report.json`; the screen is read on the take's clock). The beat API is in `lesson/reference/beats-api.md`.

## What makes it TikTok-native

- **Vertical 1080x1920, 20–45 s.** The app runs in a portrait window (820x1040 pt by default; `"window"` in lesson.json). The window floats on a dark canvas with cyan, pink and violet glows. A virtual camera cuts a 9:16 crop from it that eases between a wide shot (the whole window width) and push-ins that follow the action.
- **Payoff first, and held.** The video opens cold on the finished result (a later moment of the take) under the hook line and a big headline sticker. The steps come after. Frame 0 is already the payoff with text on it, so it is also the cover. The opening lines' beats are never seen, so the last of them does the setup (pick the project, start an agent).
- **Don't cut away at 2 s.** TikTok's retention graph for the best video so far (1.9K views) showed most viewers leaving at 0:02, the moment a one-line opening cut from the result to the app's setup. Its likes peaked at 0:01, on the result. Open on two lines over the payoff (`"open": 2`, about 4–5 s): the hook, then a line that gives a reason to keep watching.
- **Hook in under 2.5 s.** One short sentence: a problem ("Stop guessing your Claude Code limits."), a surprising fact, or a result. Never "In this video", never "Here's how to set it up in lpm". The headline sticker says what the video delivers ("Claude Code limits, right under your prompt 👀").
- **Burned-in word-by-word captions.** Most people watch muted. Pages of up to 3 words sit in the lower middle, heavy white with a black stroke, the spoken word in yellow, `*word*` in cyan. They are timed from the voice clip's own transcript.
- **Numbered step stickers.** A line's `"label"` puts "① Open Settings" at the top of the frame until the next one.
- **No dead air.** Lines follow each other with 140 ms gaps. Typing and agent thinking are jump-cut with `s.skip()`. The voice is quick and upbeat (DEFAULT_STYLE in `scripts/make.js`, sped up 1.08x with pitch kept; `"tempo"` in lesson.json).
- **Ends on the result.** The last line plays over the payoff shot the video opened on (it loops cleanly), with an `lpm.cx` end sticker. No outro card, no "follow for part 2", no next-lesson teaser (user rule: every video stands alone).
- **Safe zones.** Stickers, captions and push-in targets keep clear of TikTok's own UI: the top tabs, the right-hand button column, and the caption and sound area at the bottom. The review sheet draws those zones in.

## Writing the lesson

`~/Movies/lpm-lessons/tiktok/<slug>/lesson.json` (`LPM_TIKTOK_DIR` for another root):

```json
{
  "title": "Claude Code statusline: see your usage limits live",
  "window": { "w": 860, "h": 1040 },
  "narration": [
    { "id": "hook", "text": "Stop guessing your Claude Code limits.", "headline": "Claude Code limits, right under your prompt 👀" },
    { "id": "settings", "text": "In lpm, open More and pick Settings.", "label": "Open Settings" },
    { "id": "pick", "text": "Pick *Clean*. Context left, plus your *5-hour* and *weekly* limits.", "label": "Pick Clean" },
    { "id": "wrap", "text": "Now you'll see a limit coming before you hit it." }
  ],
  "post": { "caption": "…", "hashtags": ["claudecode", "aicoding", "devtools", "lpm"] }
}
```

- 6–9 lines, 60–110 words in total. One action per line, 3–9 words, spoken in the second person, the way someone talks to a friend.
- Commas become audible pauses (a one-comma line lost 0.9 s). Prefer two short sentences to one long one.
- Mark 1–3 key words per line with `*…*`; the asterisks are never read aloud. Digits read well ("5-hour") and show as digits in the captions.
- `open` is how many lines play over the payoff (default 1). With 2 or more, only the last opening line may do slow setup in its beat; a wait in an earlier one plays as silence over the payoff (the cut logs it). The payoff shot must last as long as the opening (the `opening on the payoff` log line), so mark it early enough in the last lines.
- `headline` (on the first line, or top-level) is the cover text: 4–8 words, with at most one emoji. Lead with the words people search for (below). `cta` changes the end sticker (default `lpm.cx`; `false` for none).
- `slam` (`{ "a": "Fable 5.1", "b": "Opus 5.5" }`, optional `"colors"`) opens on two names slammed in big over the dimmed payoff: `a` in cyan from the left, a VS, `b` in pink from the right. After 1.5 s the stack shrinks away and the headline pops in at 1.65 s (left out when the opening has under 0.6 s left). The cover is then the frame at 1.2 s, with all three lines on screen and no headline. Names are sized to fit 820 px, so long ones shrink.
- `post.caption` goes into post.txt for TikTok: one or two search-friendly sentences (people search TikTok like Google), then at most 5 hashtags (TikTok's cap: a 6th loses its `#`), `lpm` among them. Keep the brand lowercase `lpm`.
- **Use searched words.** Search sent 0% of the views so far, and For You shows a new account's posts mostly to people near the phone that posts them, so search is the way to reach coding viewers elsewhere. TikTok's Creator Search Insights (global, 2026-09-27): "claude tips" 224K and rising fast, "claude vs gemini" 194K, "claude ai vs chatgpt" 138K, "claude vs gemini vs gpt" 127K, "ai agents for beginners" 116K, "vibe coding apps" 96K, "how to vibe code with claude code" 85K; "claude code tips" only 1.9K, and nobody searches for "claude limit". Say "Claude" and "ChatGPT" rather than "Claude Code" and "Codex" in headlines and captions, and frame a feature as a "Claude tip" rather than by its lpm name.
- `settings` in lesson.json seeds the app's settings.json (for example `terminalFontSize`); `"limits": false` leaves the sidebar meters out.
- `windowShiftY` shows the window that many pixels below centre in the wide shot (negative: above). `stickerTop` moves the headline and step stickers from y 190. short-game's tall window uses both to keep its top colour bar clear of TikTok's tabs with the headline just under it.

## Beats

`beats.js` exports `setup` and one beat per line id, exactly like `lesson`. The shared helpers are in `lesson/scripts/kit.js`: `writeProject` (a seeded folder, git, its lpm config), `neutralShell` (a plain prompt, plus a `claude`/`codex` wrapper that records the folder trust), `openAgent`, `claudeDone`/`codexDone`, `until`, `clickUntil`, `typeInto`, `waitGone`, `scrollTo`, `tagByPosition`, `focusLeft`, `park`. A lesson requires it by absolute path: `const kit = require("<repo>/.claude/skills/lesson/scripts/kit")` (the older `short/scripts/kit` path still works). Beats add these calls:

- `s.focus(sel, { scale, at, ms, cue })`: push the camera in on an element; it lands 36% down the frame, above the captions and the button column. Use 1.4–1.6 for a whole terminal line or a settings preview, and 1.8–2.2 for a button, a tab or a row. A pushed-in camera pans after the pointer when it leaves the shot. `s.zoom` is the same call.
- `s.wide({ ms, cue })`: back to the whole window. Go wide when a new screen opens. `s.zoomOut` is the same call.
- `s.label(text, { cue })`: a step sticker mid-line; `null` clears it. `{ plain: true }` leaves the step number off, and a plain label that follows another changes in place without the pop, so calling it once a second makes a running clock.
- `s.payoff({ cue })`: marks the shot the video opens on. Put it on the final result and hold that shot for at least the hook line's length; the last line usually does. Hide the drawn cursor first (`s.hideCursor()`) unless it points at something.
- `await s.skip(() => work, { keepMs })`: starts `work` at once (typing a prompt, waiting for an agent) and cuts everything from the end of this line's narration until `work` is done.
- No `s.card()`: a vertical lesson has stickers, not topic cards.

A cue is the spoken word an action lands on, as in `lesson`. Aim for a camera change or a click every 1.5–3 s. Make every push-in land on its cue word.

## Pipeline

Every lesson folder has a `take.sh`, which runs this skill's `scripts/take.sh` (lesson's runner with this skill's `make.js`): the preflight first, then `make.js` on an empty clipboard under `caffeinate`, with the clipboard and the user's agent settings put back afterwards. The plain one is:

```sh
#!/bin/sh
exec "<repo>/.claude/skills/short/scripts/take.sh" "$(dirname "$0")" "$@"
```

```
<slug>/take.sh --no-audio            # dry run: raw window frames in frames/
<slug>/take.sh                       # voice → take → cut → MP4 + cover + sheet + post + checks
<slug>/take.sh --mux-only            # re-cut the last take (camera, stickers, captions, music)
```

Flags: `--respeak`, `--keep-state`, `--lpm-dir <dir>`, `--dom-mouse`, `--voice <name>`, `--style "…"`, `--music <file>` / `--no-music` (the default bed is `lesson/music/bed.mp3`, which the preflight downloads; 11 LU under the voice, full level from frame 0). `--no-qa` skips the checks. `node scripts/make.js <slug or folder path> …` runs the same pipeline without the preflight, the clipboard swap and the settings guard; a path is used as it is (a scratch copy never touches the lesson in `~/Movies`).

Output in the lesson folder: `<slug>.mp4` (H.264 High, 30 fps, AAC 48 kHz), `cover.jpg` (the opening frame, or the slam at 1.2 s), `post.txt` (caption and hashtags), `sheet.jpg` (a frame every 1.5 s with TikTok's UI zones in red), `cut.json` (the edit, the camera keys, the text track), `timeline.json`, `record.mkv`, `overlay/` (rendered text frames, reused by `--mux-only`), `audio/`, `qa/report.json`, and `_takes/` (every take's log and script; earlier takes' recordings).

Before a take, close `tauri dev` and keep the lid open. The recording app is the debug build and loads its UI from Vite on :9245. When nothing serves that port, the launcher starts its own server that doesn't watch files (`lesson/scripts/vite.lesson.config.mjs`) and warms it. A running `tauri dev` server does watch them, so an edit under `desktop/frontend/src` (another agent in the same worktree) reloads the app mid-take and closes any open dialog, and a Rust edit restarts `tauri dev`'s own app, which takes keyboard focus while the take is typing. The launcher logs which server it used. Closing the lid sleeps the Mac and ends the take; `caffeinate` only keeps the display awake through long waits.

The runner already saves and restores the agents' model, effort and status-line settings (`lesson/scripts/guard.js`). A take that changes anything else in the user's real config backs that file up in its `take.sh`, sets `trap restore EXIT`, and then calls `"<repo>/.claude/skills/short/scripts/take.sh" "$DIR" "$@"` without `exec`, so the restore runs after the take. `short-race`'s `new.js` still writes one around `claude-default.js`, which is harmless next to the guard.

## Review before posting

Open `sheet.jpg` and `cover.jpg` and check:
- No sticker, caption or push-in target sits in a red zone. The right-hand button column matters most for anything at 40–80% of the frame height.
- **System popups.** The capture records the screen area, so a macOS popup lands in the video with the user's name on it ("<name>'s AirPods Connected", "Pasting from <name>'s iPhone…"). Retake if one appears.
- **Terminal lines cut off.** A TUI truncates a line wider than the pane with "…", and a push-in that is too tight crops it. Widen `"window"` or lower the push-in scale.
- **Real numbers.** Usage meters, plan names and costs are the user's real ones.
- The hook is 2.5 s or less (the `audio hook:` log line) and the whole video is 45 s or less (the `muxed` log line). `scripts/rehook.sh <slug>` re-speaks an edited hook line and re-cuts without a retake.

`scripts/scan.sh <slug> [out-dir]` makes a one-frame-per-second contact sheet of the MP4 for spotting popups.

Then watch the MP4 once with the sound off: the captions alone should carry the lesson.

When the video is done, end the reply with the rendered MP4's full absolute path (`~/Movies/lpm-lessons/tiktok/<slug>/<slug>.mp4`), not just the slug or a relative path.
