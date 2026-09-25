---
name: short-upload
version: 2.1.0
argument-hint: "<slug> [youtube|tiktok]"
description: "Post a finished vertical lesson from ~/Movies/lpm-lessons/tiktok/<slug>/ to YouTube Shorts (LPM channel, through Chrome) and TikTok (@lpm06557, from the user's iPhone through iPhone Mirroring) in parallel: the MP4, the caption and hashtags from post.txt, the headline cover, each platform's settings, then both links logged and the title listed in SHORTS.md. Use when the user asks to upload, publish or post a short, vertical, TikTok or YouTube Shorts video, to one platform or both."
---

Post a vertical lesson to YouTube Shorts and TikTok at the same time.

- scope: both platforms unless the user names one. A platform whose ledger already lists the slug is skipped unless the user asked for a repost.
- run `node scripts/prepare.js <slug> <scratchpad-dir> [--full-lesson <youtu.be link>]` first. It copies the MP4 (named after the title, because Studio pre-fills the title from the file name) and `cover.jpg` into the scratchpad, shrinks a master over 10,000,000 bytes to a two-pass H.264 copy (the master stays in the lesson folder), and prints the title, the TikTok caption and the YouTube description. It warns about a wrong size, a clip over 3 minutes (not a Short), a title the file name could not carry (retype it), an over-long caption, more than 5 hashtags, an `@`, and a slug already in either ledger. `--full-lesson` is the long YouTube lesson on the same topic (Studio → Content → Videos); leave it out when there is none.
- shared text: the caption is the first paragraph of `post.txt`, then **at most 5 hashtags** (TikTok's cap; a 6th and later lose their `#`; when `post.txt` has more, keep the topic tags and `#lpm`). Brand stays lowercase `lpm`. No `@`. No next-video teaser. YouTube gets the same caption and hashtags plus the lpm line and link that prepare.js adds.

## Running both at once

The two tracks use different tools that do not share state: YouTube goes through the Claude in Chrome MCP, which drives the tab through the extension and needs no OS focus; TikTok goes through computer use on iPhone Mirroring, which moves the real pointer in the frontmost app. Work both yourself, without subagents: put the next step of each track in the same message as two parallel tool calls (a `browser_batch` beside a `computer_batch`), read both results, and send the next pair. Start with YouTube's `file_upload` so the video processes on YouTube's side while the phone steps run.

- YouTube publishes as soon as its form is done; TikTok always stops at the Post button for the user's OK (below). The summary for that OK can go out while YouTube is still processing.
- a blocked track does not stop the other: when computer use is unavailable ("in use by another Claude session", access denied) or the Chrome extension is not connected, finish the other platform and tell the user which one is left. Never move TikTok to the Chrome path on your own.
- each track was verified on its own (2026-09-25: two Shorts, two TikTok posts). The first parallel run is new: write what broke into the `tiktok-upload` and `youtube-upload` memories.

## YouTube Shorts (Chrome)

- channel **LPM** (`UCIxcL1wPIlFT-4cahfHZJig`). Open `https://studio.youtube.com/channel/UCIxcL1wPIlFT-4cahfHZJig/videos/upload?d=ud`: it switches Studio to LPM and opens the upload dialog. `youtube.com/upload`, and a new MCP tab group, can land on the user's personal channel, even on an LPM video's `/edit` URL. Check the sidebar's "Your channel LPM" (or `ytcfg.get('CHANNEL_ID')` in JS) before `file_upload`.
- YouTube turns any vertical video of 3 minutes or less into a Short by itself: the link reads `youtube.com/shorts/<id>` and the row sits under Content → Shorts.
- Details: `find` the file input → `file_upload` the MP4 → wait ~6 s. Title: the lesson title as-is (100 characters max). Description: click the box, `type` prepare.js's YouTube description, then click a neutral label (the "Details" heading) to close the hashtag popup. Thumbnail: `find` the Thumbnail "Upload file" file input → `file_upload` the cover. Playlists: none (the tutorials playlist holds only the long lessons). Audience: "No, it's not made for kids", by coordinate. Show more → Tags: 15–20, a comma after each (lpm, lpm.cx, the lesson's own nouns and verbs, Claude Code, Codex, mac dev tools, developer tools). Category: Science & Technology (the channel default; check it). Paid promotion and AI use: left unanswered, as on the long lessons. Check the radios and tag chips with JS before leaving the step.
- Video elements: skip. "Related video" (a link from the Short to the long lesson) is refused on this channel with "Build your channel history"; "Got it" closes it. The "Full lesson" line in the description stands in for it.
- Next ×3 → Public (zoom: the button now reads Publish) → Publish → the "Video published" dialog shows the link.
- never press Escape in the upload dialog: it closes it. The upload is already a private draft: Content → Shorts → "Edit draft" on the row (a coordinate click; the dialog takes ~4 s to appear, and a click on the description before then hits the row behind it and opens that video's edit page).
- "We had trouble saving your video, retrying" once left the tab unresponsive to the extension even though the publish went through. Check from a new tab's Shorts list instead of waiting on the old one.
- verify: the Shorts row shows Public; `studio.youtube.com/video/<id>/edit` shows the description, the cover as the thumbnail, and the tags (Show more). Links in the description stay plain text until the channel's one-time phone verification, which only the user can do; say so once.

## TikTok (iPhone Mirroring)

- path: always the iPhone, through iPhone Mirroring (user rule 2026-09-25). Use the Chrome path below only when the user asks for it.
- account: **@lpm06557** (display name "lpm"). Check it before posting: the TikTok app's Profile tab shows the handle under the name. Any other handle: stop and tell the user. Never log in, log out or switch accounts.
- cover: the opening frame with the headline sticker. The sticker pops in over the first frames, so frame 0 has none: take the frame around 0.6 s (the one `cover.jpg` shows).
- settings (user decisions 2026-09-25): Everyone can view; comments and reuse (Duet, Stitch) allowed; **AI-generated content on** (the voice is OpenAI TTS); **Disclose commercial content on → Your brand** (the post is labeled "Promotional content", which cannot be changed once live); Ad authorization and Only show as ads off; no sound added (the video carries its own voice and music); no schedule unless asked.
- always stop at the Post button and show the user the summary (account, caption, hashtags, cover, labels); post only on their OK.

Computer use: `request_access` for "iPhone Mirroring" and "Finder". The first launch shows Apple's "iPhone on Your Mac" setup, which turns on mirroring and notification forwarding and needs the phone unlocked: the user does that part. The mirrored phone sits at the right edge of the screen; the phone must stay locked and nearby.

1. Video into Photos: `open -R "<scratchpad video>"` (a Finder window with the file selected appears after a second or two; AppleScript to Finder is not authorized). On the phone, `cmd+1` (Home) → Photos. Drag the Finder row onto a visible part of the mirrored Photos screen with `left_mouse_down`, several `mouse_move` steps, a 1–2 s hover, `left_mouse_up`. The video lands at the end of the Library (its length as the badge).
2. TikTok: `cmd+1` → the Search pill above the dock → type `TikTok` → the Top Hit icon. Check the profile handle.
3. `+` (tab bar centre) → "iPhone camera is not available from Mac" → OK → the gallery thumbnail at the bottom left. TikTok has limited Photos access: on "Would Like to Access Your Photos" choose **Select More Photos…**, tick only the new video (newest, top left), ✓. Nothing else of the user's library is shared.
4. In TikTok's gallery ("Select multiple" is on) tap the video's circle (it shows 1) → Next → the editor → Next (no "Add sound").
5. Post screen: tap "Add description…", `type` the caption, then `key return` twice with short waits, then each hashtag as its own `type` with a trailing space and a ~1 s wait. Typing the whole block in one go put the line breaks after the first hashtag. `cmd+a` then `delete` clears the field. Zoom to check.
6. Edit cover: a frame strip under the preview, "+ Upload", text styles None/Standard. Drag the selector from the far left 5 px right (mouse down, small moves, up) until the preview shows the headline sticker → Save.
7. "Everyone can view this post" is the default. More options: AI-generated content → "Turn on" in the explainer sheet. Content disclosure and ads (loads for a few seconds) → Disclose commercial content → tick Your brand → Save → "Content disclosure setting is on… labeled Promotional content" → Continue. Close the sheet (×).
8. Stop for the user's OK, then Post. The app shows "Video posted! Everyone can view. Share:" and the post with "Promotional content" and "Creator labeled as AI-generated".

TikTok from Chrome (only when the user asks for it; post form not yet verified): `navigate https://www.tiktok.com/tiktokstudio/upload` → check the account → `find` the "Select video to upload" file input → `file_upload` the scratchpad MP4 → the post form: replace the file-name caption, cover editor, visibility, the same labels, Post. Never press Escape in the form; leaving the page asks to discard the upload. Write the form's real layout into the `tiktok-upload` memory on its first use.

## After posting

- YouTube: append `- <YYYY-MM-DD> <slug> https://youtube.com/shorts/<id>` to `~/Movies/lpm-lessons/tiktok/SHORTS_POSTED.md` (create it with a `# YouTube Shorts posts` heading).
- TikTok: the link comes from Chrome, `https://www.tiktok.com/tiktokstudio/content` → `find` the row's link (`/@lpm06557/video/<id>`); the public profile page sat on "Please wait…" in the MCP tab. Avoid the app's "Copy link": it goes through the shared clipboard. Append `- <YYYY-MM-DD> <slug> <link>` to `~/Movies/lpm-lessons/tiktok/POSTED.md` (create it with a `# TikTok posts` heading). A new post shows "Content under review" (result within 12 hours) and Privacy "Only me" until the review finishes; it was posted as Everyone.
- titles: `SHORTS.md` at the repo root lists every posted short by title only, oldest first. Append `- <lesson title>` after the first platform posts (no links; those live in the two ledgers).
- report both links, the title, the caption as posted, each platform's labels, and TikTok's review status. The video stays in the iPhone's Photos; say so, and leave removing it to the user.
