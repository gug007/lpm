---
name: video-lesson
version: 4.1.0
argument-hint: "\"<title>\" [-- <text>]"
description: "Make a narrated lesson video about lpm from the real desktop app, recorded on a pristine data directory. Title and optional narration text in, MP4 with OpenAI voice out, audio in sync with the clicks. Use when the user asks for a video lesson, tutorial, screencast, or YouTube video about lpm."
---

Generate a video tutorial from a title and optional narration text.

**Workflow**
1. `node scripts/new.js "<title>" [--projects storefront,client-portal]` starts `~/Movies/lpm-lessons/<slug>/` with `lesson.json`, `beats.js` and `take.sh`. Write the narration and the beats: `reference/beats-api.md` has every call a beat can make, the selectors and the traps.
2. Show the user the narration (with the cue words each click lands on), a one-line-per-beat plan, and anything the take touches in their real setup (agent settings, a real `git clone`, real usage meters). Wait for their OK before anything is spoken.
3. `<lesson>/take.sh --no-audio` is a dry run: it lints the lesson, launches the app and drives the real pointer with estimated timing, and writes `frames/NN-<beat>.jpg`. Review the frames (a contact sheet helps: `ffmpeg -i 'frames/%*.jpg'` … `tile`).
   Then write the opening and the cover: `coldOpen` (a one- or two-sentence hook over two short shots of the payoff) and `cover` (2–4 words and a frame of the payoff) in `lesson.json`; a dry run's timing is estimated, so check both on the take's `qa/sheet.jpg` and adjust with a `--mux-only` re-cut. Without them a lesson opens on its title card and uses that card as its thumbnail.
4. `<lesson>/take.sh` is the take: voice first, then the recording, then the MP4, captions, chapters, thumbnail and the checks (`qa/report.json`, `qa/sheet.jpg`). Run it in the foreground (a take started in the background fails for lack of a first frame), about 5 minutes. Nobody touches the mouse or keyboard meanwhile.
5. Read the take's log for `warning` lines and the qa summary: a FAIL (a name, email or error text on screen, an agent that never answered) means the take is not publishable as it is.
6. End the reply with the MP4's full absolute path (`~/Movies/lpm-lessons/<slug>/<slug>.mp4`).

**Rules**
- no YAML, config files or CLI unless the title is about them; each video stands alone (no "next lesson" or teaser line; the lint refuses one); lessons open on `s.card("<title>")` and close on a silent `{ "id": "outro", "ms": 3200 }` line whose beat is `s.card("lpm.cx", { hold: true })`.
- narration: name the control, then click it on that word (`cue`); fold a very short closing sentence ("Click it.") into the one before, since the voice drops those; write `lpm` lowercase (it is spoken as letters).
- the recording shows the real machine: the checks read every second of the take for the account name, full name, computer name, email and home path, and for error text. Keep them off screen (the kit's `neutralShell` replaces the shell prompt).
- a take drives the real Claude Code / Codex / Cursor on the user's login. `take.sh` saves their model, effort and status-line settings and puts them back afterwards, even after a crash (restored at the start of the next take). Nothing else in their config is guarded, so a lesson that changes something else must put it back itself.
- never verify a pipeline change with a real take. Copy the lesson folder (`cp -c -R`) to a scratch directory and run `node scripts/make.js <copy path> --mux-only` there; a path is used as it is, so the published lesson is never touched. `node --test scripts/test/*.test.js` covers the pure parts.
- use the OpenAI key in the Keychain (`security add-generic-password -s lpm-video -a openai -U -w`).

**Re-cuts** (`--mux-only`): re-render the current take with the current look, sound, zooms and captions; nothing is recorded and nothing is spoken. A reworded line needs `--speak`: it speaks the changed lines and keeps them only if every new clip still fits before the next line; otherwise all clips are put back as they were and the line needs a new take. `--take <n>` re-cuts an archived take from `_takes/` with the script it was recorded with (it fails when those lines have been spoken again since). The render a re-cut replaces is kept in its take's `cuts/`. Adjust a zoom without a new take through `lesson.json` `"zooms": { "<line>#<n>": { "scale": 1.6, "at": [0.3, 0.5], "ms": 900 } }` or `{ "drop": true }` (the mux log lists the ids).

**Flags**: `node scripts/make.js` prints them. The pipeline, the look, the sound, the data directory, the take folders and the checks are described in `reference/pipeline.md`.
