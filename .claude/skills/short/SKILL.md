---
name: short
description: "Make a short vertical (9:16) lpm lesson that feels native to TikTok, Reels and Shorts: a payoff-first hook, fast push-ins that land on the spoken word, word-by-word burned-in captions, numbered step stickers, keycaps for shortcuts, jump cuts over waiting, recorded from the real desktop app. Topic in, 1080x1920 MP4 + cover + post caption out. Use when the user asks for a TikTok, a Reel, a Short, or any vertical or short-form video about lpm."
version: 2.0.0
argument-hint: "\"<topic>\" [-- <notes>]"
metadata:
  lpm-created: "true"
---

Make a vertical lesson video from a topic and optional notes. It is not a trimmed YouTube lesson: the script, the pacing and the picture are built for a phone held upright with the sound possibly off.

The recorder, the voice and the mix are the `lesson` skill's (`../lesson/scripts`), and everything its SKILL.md says about driving the app holds here: the pristine `~/.lpm-lessons` data directory, the `/Users/Shared/lpm-lessons` workspace, agent trust, foreground takes, the guarded agent settings, the OpenAI key in the Keychain.

A short is a folder in `~/Movies/lpm-lessons/tiktok/<slug>/` (`LPM_TIKTOK_DIR` moves it) with two files you write: `lesson.json`, the lines and the copy, and `beats.js`, what happens on each line. Every line is voiced first and the take is recorded to the real clip lengths, so each action lands on its word.

## Workflow

1. `node scripts/new.js "<title>" [--headline "<cover text>"] [--projects storefront,client-portal]` starts the folder. Write the lines and the beats: [reference/lesson-json.md](reference/lesson-json.md) has every field, [reference/beats.md](reference/beats.md) every call. Check each claim against the real app.
2. `<folder>/take.sh --speak-only` checks the copy, voices the lines and prints the hook, the opening and the whole length. Rework the text until they fit. A hook over 2.5 s is spoken again for a shorter clip by itself; later runs reuse every clip whose text is unchanged.
3. `<folder>/take.sh --no-audio` is the dry run. On real clips it is the whole video: it renders `preview.mp4`, `sheet.jpg` and the checks into its folder under `_takes/`. Look at the sheet: one tile per line and per camera move, TikTok's interface in red.
4. Fix what the sheet and the checks show. A camera move needs no new recording: change it by its id in `lesson.json` `"zooms"`. A change to the beats or the lines needs another dry run.
5. `<folder>/take.sh` makes the video. After a clean dry run it renders that recording instead of recording again, as long as the lines, `beats.js`, the clips and the app are unchanged, and says so; `--fresh` records anyway. A dry run with a warning is never used.
6. Review (below). Any later change to the camera, stickers, headline, music or post: `take.sh --mux-only`. A new hook: edit its text, then `scripts/rehook.sh <slug>`.
7. End the reply with the MP4's full absolute path (`~/Movies/lpm-lessons/tiktok/<slug>/<slug>.mp4` written out), not just the slug.

Tell the user when a recording starts and ends: it drives the real pointer and keyboard unless `--dom-mouse`. Run it in the foreground. `--speak-only`, `--mux-only` and a take made from a dry run never touch the screen.

## What makes it work

- **20–45 s, payoff first, and held.** The video opens cold on the finished result under the hook and the headline. Viewers left at 0:02, the moment a one-line opening cut to the setup, so open on two lines over the payoff (`"open": 2`, 4–5 s): the hook, then a reason to keep watching. Those lines' beats are never seen; the last of them does the setup.
- **The hook is one short sentence under 2.5 s:** a problem ("Stop guessing your Claude Code limits."), a surprise, or a result. Never "In this video" or "Here's how".
- **6–9 lines, 60–110 words,** one action per line, 3–9 words, said the way you'd talk to a friend. A comma is an audible pause: use two short sentences. Mark 1–3 key words per line with `*…*` (cyan in the captions, never read aloud).
- **Something changes every 1.5–3 s.** Push in on its cue word, go wide when a new screen opens, jump-cut typing and agent waits with `s.skip()`. Silence of 1.6 s or more between lines plays faster by itself.
- **Readable muted.** Word-by-word captions, a numbered sticker per step (`"label"`), keycaps when a beat presses a shortcut.
- **Ends on the result.** The last line plays over the payoff, so it loops, with the lpm.cx sticker. No outro, no "part 2", no teaser (user rule: every video stands alone).
- **Safe zones.** Stickers start at y 270, below TikTok's tabs; a push-in lands its target at 36% of the height, clear of the captions and the button column.

## Copy

- Use searched words; search is how coding viewers elsewhere find a post. Say "Claude" and "ChatGPT" rather than "Claude Code" and "Codex" in the headline and the caption, and frame a feature as a "Claude tip" rather than by its lpm name. Brands get searched, version names don't.
- The headline (the first line's `headline`, the cover text) is 4–8 words, at most one emoji.
- `post.caption` is one or two sentences people would search for. At most 5 hashtags, `lpm` among them. Brand lowercase `lpm`, no `@`.

## Review before posting

Read `qa/report.json`, then look at `sheet.jpg` and `cover.jpg`. A FAIL means the video can't be posted; a WARN is a flaw to fix or to justify; a NOTE is worth a look. The checks can't see these:

- A sticker, caption or target in a red zone, above all the button column.
- A terminal line cut off with "…" (widen `"window"`).
- Usage meters, plan names and costs: they are the user's real ones.
- A name or message in a script the text reader can't read. `scripts/scan.sh <slug> [out-dir]` shows one frame a second.
- With the sound off, do the captions alone carry it?

## Traps

- Close `tauri dev` first. Its server on :9245 watches files, so an edit by another agent reloads the app mid-take. With nothing there, the launcher starts one that doesn't watch.
- Keep the lid open: closing it sleeps the Mac and ends the take.
- A pointer glide can't land on a line's first word; cue a later one, or move at the end of the line before. A camera move can: it starts in the pause before the line.
- A pointer left outside a push-in makes the camera pan to it: move it onto the target first, or `s.hideCursor()`.
- Never `"limits": false` when usage should show.
- A take that changes more of the user's real config than the runner guards (the agents' model, effort and status line) backs that file up in its own `take.sh`, sets `trap restore EXIT`, and calls `scripts/take.sh` without `exec`.
- Never verify a change to this pipeline with a real take: copy a folder to a scratch directory (`cp -c -R`) and run `node scripts/make.js <copy> --mux-only` there. `node --test scripts/test/*.test.js` covers the rest.
