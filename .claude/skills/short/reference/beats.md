# beats.js

Beats are written as in `lesson` ([its beats API](../../lesson/reference/beats-api.md) has the stage, the selectors and the kit). `exports.setup` seeds the folders and settings; then one beat per line id. This page is what a vertical take adds.

| Call | Notes |
| --- | --- |
| `s.focus(sel, { scale, at, ms, cue })` | Pushes the camera in on an element and stays. 1.4–1.6 for a whole terminal line or a settings preview, 1.8–2.2 for a button, a tab or a row. `at` aims inside the target. With `cue` the move finishes on that word; when its beat gets there too late the render starts it earlier, in the pause before the line, but never before the click or glide it came after. `s.zoom` is the same call |
| `s.wide({ ms, cue })` | Back to the whole window. `s.zoomOut` is the same call |
| `kit.focusLeft(s, sel, { scale, at, ms, cue })` | A push-in near the window's left edge that shows no canvas |
| `s.label(text, { cue, plain })` | A step sticker mid-line; `null` clears it. `plain` leaves the number off, and one plain label after another changes in place, so calling it once a second makes a running clock |
| `s.payoff({ cue })` | Marks the shot the video opens on. Put it on the final result and hold that shot for the whole opening; the last line usually does. Hide the cursor first unless it points at something |
| `await s.skip(() => work, { keepMs })` | Starts `work` now (typing, an agent thinking) and cuts everything from the end of this line's words until it is done |
| `s.keys("cmd+shift+t", { cue, badge })`, `s.press("Escape", { cue, badge })` | A shortcut shows as keycaps for a moment. `badge: true` shows a lone key too, `false` hides a shortcut |
| `s.click`, `s.moveTo` | `cue` lands the pointer on its word; a late one warns, and a dry run with a warning can't be the take. `verify` (a selector that must show up) wherever a lost click would ruin the rest |
| `s.frame(name)` | An extra raw frame in `frames/` |

No `s.card()`: a vertical lesson has stickers, not cards.

The camera pans after the pointer when it leaves a push-in (inside is the middle 80% of the width, 12–78% of the height), so click a wide row near where the camera looks. Anything whose right edge lands past 88% of the frame at 36–78% of the height sits under TikTok's buttons.
