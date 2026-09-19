---
name: youtube-upload
version: 1.0.0
argument-hint: "<lesson-slug>"
description: "Publish a finished lesson MP4 from ~/Movies/lpm-lessons/<slug>/ to the lpm YouTube channel through Chrome (YouTube Studio): search-optimized title and description with chapters, tags, category, the title-card thumbnail, Public. Use when the user asks to upload, publish or post a video to YouTube."
---

Upload a lesson video to YouTube and publish it.

- run `node scripts/prepare.js <slug> <scratchpad-dir>` first: it copies the MP4 into the session scratchpad under the video title (the file name becomes the initial title in Studio), extracts the title-card thumbnail (1280x720 JPEG, taken inside the opening card) next to it and into the lesson folder, and prints the chapter candidates (each narration line's start as m:ss). Chrome's `file_upload` only accepts files inside the scratchpad and under 10 MB.
- thumbnail: always the video's own opening title card (the beige text screen), never an app screenshot or YouTube's auto-pick; prepare.js extracts it and it is uploaded in the Thumbnail step.
- title: the lesson title from `lesson.json`, nothing appended (no "(Mac Tutorial)"), brand is lowercase `lpm`, 100 characters max.
- description: a two-line keyword hook (what the video shows, for whom), one line on what lpm is (starts, stops, duplicates and switches between local dev projects on a Mac, with a built-in terminal for AI coding agents such as Claude Code and Codex), the links `https://lpm.cx` and `https://lpm.cx/demo`, "What you'll learn" bullets, "Chapters" (first at 0:00, at least three, each 10 s or longer, from prepare.js), one series line, 5–6 hashtags (#lpm #macOS #devtools …). No `@` anywhere (it opens a mention popup) and no next-lesson teaser.
- tags: 15–20 comma-separated (lpm, lpm.cx, the lesson's own verbs and nouns, Claude Code, Codex, mac dev tools, tutorial), under 500 characters. Category Science & Technology. Audience "No, it's not made for kids". Visibility Public. No playlist unless the user names one.
- browser (Claude in Chrome MCP on the user's logged-in Chrome; channel "LPM"): `navigate https://www.youtube.com/upload` → `find` the file input → `file_upload` the MP4 → wait ~5 s → `find` the title and description textboxes, click + `type` → Thumbnail "Upload file" input → `file_upload` the JPEG → Audience radio → "Show more" → Tags textbox (type a comma after every tag) → Category: open the menu, take a full-scale screenshot, click the option by coordinate and `zoom` to verify (a click by `find` ref lands on the hovered row) → Next ×3 → Public radio → Publish → copy the link from the "Video published" dialog.
- never press Escape inside the upload dialog: it closes the dialog. The upload is already saved as a private draft; reopen it with "Edit draft" on the row. Later edits go through `studio.youtube.com/video/<id>/edit`, then Save.
- verify before reporting: the row in Channel content shows Public, the thumbnail is the beige title card, the title has no suffix. Report the youtu.be link, the title and the description text. External links stay plain text until the channel completes YouTube's one-time verification (a phone step only the user can do); say so once.
