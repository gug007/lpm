---
name: tiktok-upload
version: 1.1.0
argument-hint: "<slug>"
description: "Post a finished vertical lesson from ~/Movies/lpm-lessons/tiktok/<slug>/ to the lpm TikTok account (@lpm06557) from the user's iPhone through iPhone Mirroring (or TikTok Studio in Chrome): the MP4, the caption and 5 hashtags from post.txt, the headline cover, Everyone can view, AI-generated and Your brand labels, then the post link logged in POSTED.md. Use when the user asks to upload, publish or post a video to TikTok."
---

Post a vertical lesson to TikTok.

- run `node scripts/prepare.js <slug> <scratchpad-dir>` first: it copies `<slug>.mp4` and `cover.jpg` from `~/Movies/lpm-lessons/tiktok/<slug>/` into the session scratchpad (a master over 10,000,000 bytes gets a two-pass H.264 copy; the master stays in the lesson folder), prints the caption and hashtags from `post.txt`, and warns about a wrong size, an over-long caption, more than 5 hashtags, an `@`, or a slug already in `POSTED.md`. Stop on an "already posted" warning unless the user asked for a repost.
- account: **@lpm06557** (display name "lpm"). Check it before posting: the TikTok app's Profile tab shows the handle under the name; in Studio, the avatar menu's Profile link. Any other handle: stop and tell the user. Never log in, log out or switch accounts.
- caption: the first paragraph of `post.txt`, a blank line, then **at most 5 hashtags** (TikTok's cap: "Maximum 5 hashtags"; a 6th and later lose their `#` and stay as plain words). When `post.txt` has more, keep the topic tags and `#lpm`. Brand stays lowercase `lpm`. No `@`. No next-video teaser.
- cover: the opening frame with the headline sticker. The sticker pops in over the first frames, so frame 0 has none: take the frame around 0.6 s (the one `cover.jpg` shows).
- settings (user decisions 2026-09-25): Everyone can view; comments and reuse (Duet, Stitch) allowed; **AI-generated content on** (the voice is OpenAI TTS); **Disclose commercial content on → Your brand** (the post is labeled "Promotional content", which cannot be changed once live); Ad authorization and Only show as ads off; no sound added (the video carries its own voice and music); no schedule unless asked.
- always stop at the Post button and show the user the summary (account, caption, hashtags, cover, labels); post only on their OK.

## From the iPhone (iPhone Mirroring, the verified path)

Computer use: `request_access` for "iPhone Mirroring" and "Finder". The first launch shows Apple's "iPhone on Your Mac" setup, which turns on mirroring and notification forwarding and needs the phone unlocked: the user does that part. The mirrored phone sits at the right edge of the screen; the phone must stay locked and nearby.

1. Video into Photos: `open -R <scratchpad>/<slug>.mp4` (a Finder window with the file selected appears after a second or two; AppleScript to Finder is not authorized). On the phone, `cmd+1` (Home) → Photos. Drag the Finder row onto a visible part of the mirrored Photos screen with `left_mouse_down`, several `mouse_move` steps, a 1–2 s hover, `left_mouse_up`. The video lands at the end of the Library (its length as the badge).
2. TikTok: `cmd+1` → the Search pill above the dock → type `TikTok` → the Top Hit icon. Check the profile handle.
3. `+` (tab bar centre) → "iPhone camera is not available from Mac" → OK → the gallery thumbnail at the bottom left. TikTok has limited Photos access: on "Would Like to Access Your Photos" choose **Select More Photos…**, tick only the new video (newest, top left), ✓. Nothing else of the user's library is shared.
4. In TikTok's gallery ("Select multiple" is on) tap the video's circle (it shows 1) → Next → the editor → Next (no "Add sound").
5. Post screen: tap "Add description…", `type` the caption, then `key return` twice with short waits, then each hashtag as its own `type` with a trailing space and a ~1 s wait. Typing the whole block in one go put the line breaks after the first hashtag. `cmd+a` then `delete` clears the field. Zoom to check.
6. Edit cover: a frame strip under the preview, "+ Upload", text styles None/Standard. Drag the selector from the far left 5 px right (mouse down, small moves, up) until the preview shows the headline sticker → Save.
7. "Everyone can view this post" is the default. More options: AI-generated content → "Turn on" in the explainer sheet. Content disclosure and ads (loads for a few seconds) → Disclose commercial content → tick Your brand → Save → "Content disclosure setting is on… labeled Promotional content" → Continue. Close the sheet (×).
8. Stop for the user's OK, then Post. The app shows "Video posted! Everyone can view. Share:" and the post with "Promotional content" and "Creator labeled as AI-generated".

## From Chrome (TikTok Studio, post form not yet verified)

`navigate https://www.tiktok.com/tiktokstudio/upload` → check the account → `find` the "Select video to upload" file input → `file_upload` the scratchpad MP4 (Chrome only takes scratchpad files under 10,000,000 bytes) → the post form: replace the file-name caption, cover editor, visibility, the same labels, Post. Never press Escape in the form; leaving the page asks to discard the upload. Write the form's real layout into the `tiktok-upload` memory on its first use.

## After posting

- the link: in Chrome, `https://www.tiktok.com/tiktokstudio/content` → `find` the row's link (`/@lpm06557/video/<id>`). The public profile page sat on "Please wait…" in the MCP tab; Studio loads. Avoid the app's "Copy link": it goes through the shared clipboard.
- a new post shows "Content under review" (in queue, result within 12 hours) and Privacy "Only me" until the review finishes; it was posted as Everyone.
- append `- <YYYY-MM-DD> <slug> <link>` to `~/Movies/lpm-lessons/tiktok/POSTED.md` (create it with a `# TikTok posts` heading).
- report the link, the caption as posted, the labels, and the review status. The video stays in the iPhone's Photos; say so, and leave removing it to the user.
