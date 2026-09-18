---
name: video-lesson
version: 2.0.0
argument-hint: "\"<title>\" [-- <text>]"
description: "Make a narrated lesson video about lpm from the website demo (localhost:3000/demo). Title and optional narration text in, MP4 with OpenAI voice out, audio in sync with the clicks. Use when the user asks for a video lesson, tutorial, screencast, or YouTube video about lpm."
---

Generate video tutorial from title and optional narration text.

- no YAML, config files, or CLI unless the title is about them.
- use OpenAI key in the Keychain (`security add-generic-password -s lpm-video -a openai -U -w`)
- generate audtio first to sync with the video.
- use the demo at http://localhost:3000/demo to generate the video.
- pipeline: `node scripts/make.js <slug>` reads `lesson.json` + `beats.js` from `~/Movies/lpm-lessons/<slug>/` and writes the MP4 there (`--no-audio --frames` = dry run with PNGs; `--variant name --voice marin --style "…"` renders a voice variant into `variants/`; beats land clicks on spoken words via `cue`).
- audio should be synced with the video.
- audio should be natural, not robotic: voice `marin`, conversational style (the defaults in `scripts/make.js`; `lesson.json` `voice`/`style` or `--voice`/`--style` override per lesson).
- frame: the app window floats centered on a warm off-white canvas (`#f5f4f0`), ~82% of the width, rounded corners and a soft shadow, no full-bleed (`FRAME` in `scripts/stage.js`).
- topic cards: when the lesson changes topic, show a title card first — big serif title on a warm beige canvas (`#e8e2d6`), nothing else; the words animate in one after another (rise + un-blur), the card fades out — via `s.card("Title")` in the beat, spoken over by that line's narration.
- open and close on cards: the recording starts on the card canvas (no app flash) with the first beat an `s.card("<lesson title>")`; the last narration line is silent (`{ "id": "outro", "ms": 3200 }`) and its beat is `s.card("lpm.cx", { hold: true })` — the website URL held to the end.
- background music: a soft royalty-free bed (`~/Movies/lpm-lessons/_music/bed.mp3`, Mixkit free licence, see LICENSE.txt there) mixed 14 LU under the narration, ducked further while lines are spoken, fading in over the title card and out over the end card; `--no-music`, `--music <file>` or `music: false` in `lesson.json` to change it.
