# Writing a lesson: lesson.json and beats.js

A lesson lives in `~/Movies/lpm-lessons/<slug>/`. `scripts/new.js` writes a starting point.

## lesson.json

| key | what it does |
| --- | --- |
| `title` | the video title and the opening card; no "(Mac Tutorial)"-style suffix |
| `narration` | `[{ id, text, chapter? }]`, one beat per id, spoken in order; a line without `text` is a silent pause of `ms` (the outro) |
| `narration[].chapter` | starts a YouTube chapter at that line (topic cards start one too) |
| `source` | `"app"` (the default) or `"demo"` (the website demo in headless Chromium) |
| `voice`, `style` | override the TTS voice (`marin`) and style prompt (`DEFAULT_STYLE` in `scripts/make.js`) |
| `env` | environment for the lesson app, applied after the scrub (lesson 14: `CLAUDE_SECURESTORAGE_CONFIG_DIR: ""`, `CLAUDE_CODE_HIDE_CWD: "1"`) |
| `settings` | seeded into the app's `settings.json` before launch |
| `limits` | `false` leaves the Claude/Codex usage meters out (and Claude's status line); keep them in: the user wants them on every lesson |
| `claudeStatusLine` | `false` runs Claude Code without the user's status line while the sidebar meters stay (a lesson about setting the status line up, or one that stages its own readings) |
| `power` | `true` makes the preflight refuse a take on battery (a lesson that shows Keep this Mac awake) |
| `music` | `false`, or a file, instead of the default bed |
| `zooms` | mux-time edits of the take's zooms by id, see below |
| `coldOpen` | `{ text, shots: [{ line, from, to }] }`: the video opens on the payoff. `text` is the hook (one or two sentences: what the viewer gets), spoken over the shots, which are cut from later in the take (`from`/`to` in seconds from that line's start, so they survive a new take). It replaces the first line's narration; the opening card follows, then the lesson from its second line. Pick the shots from a take's frames or `qa/sheet.jpg`; the hook is voiced on the first render that needs it, `--mux-only` included |
| `speedUpWaits` | `false` keeps waits real time. By default a stretch of more than 2.5 s with nothing said between two lines (an agent working) plays at 4× under a badge, faster when it is long (up to 16×) |
| `keepWaits` | line ids whose wait after them plays in real time, when the wait is the point (lpm Link reconnecting over Tailscale) |
| `waitMaxSeconds` | the longest one wait may play, in seconds: a race that runs for half an hour plays at whatever speed fits (the badge shows it) |
| `cover` | `{ words, line, at, crop, style }`: the thumbnail from a moment of the take instead of the plain opening card. `words` 2–4, adding to the title rather than repeating it; `at` seconds into `line`; `crop` `[x, y, w, h]` in the window's points (1100×620, default: the pane right of the sidebar; in the capture's points with a phone); `style` `"window"` (words left, the window right, off the edge), `"closeup"` (the crop full width under a band of canvas) or `"phone"` (words left, lpm Link's screen right in a drawn iPhone; no crop). `{ "image": "cover.jpg" }` instead uses a picture in the lesson folder as it is, for a cover composed outside the pipeline (lesson 41's: frames of the take and a page screenshot layered on the canvas) |
| `guest` | `{ env, settings, labels }`: a second lpm on its own data directory (`<data dir>-guest`) standing in for another person's Mac, side by side with the lesson app and recorded with it (see "Two Macs" below). `env` and `settings` are its own on top of the lesson's; `labels` (`["Your Mac", "Your teammate's Mac"]`) are drawn over the two windows. `browser: true` puts a browser there instead, for someone without lpm (see "A browser beside the app"). Not with `phone` |
| `phone` | `{ device, env }`: lpm Link in the iOS Simulator beside the app, recorded with it and shown as a drawn iPhone right of the window (see "The phone" below). `env` reaches the app (`LPM_LESSON_ONLY_MAC` limits its "On this Wi-Fi" list to that Mac name) |
| `youtube` | `{ hook: [line, line], learn: [], tags: [], hashtags: [] }`, the upload's description and tags |

## beats.js

```js
const kit = require("<repo>/.claude/skills/lesson/scripts/kit");
module.exports = {
  async setup({ lpmDir, workspace, lesson, settings }) { … },   // before launch
  async title(s, line) { await s.card("Title"); },              // one per narration id
  …
};
```

`setup` seeds folders and settings (never a narration id called `setup`); with a `guest` it also gets `guestDir` and `guestSettings` for the second app. A seeded folder needs a manifest the app can read (a `package.json` with a `dev`/`start` script, a Procfile, `manage.py`…) or adding it writes the `configure me` placeholder. `kit.writeProject(lpmDir, workspace, { name, port, services, files, gitInit })` writes a folder under `<workspace>/Projects` and its lpm config; `settings({ defaultProjectDirectory, projectOrder })` patches `settings.json`. `kit.neutralShell(lpmDir, workspace)` gives every pane a plain `%1~ %#` prompt (the real one shows the account and computer name) and wraps `claude`/`codex` to record their one-time folder trust. The workspace is `/Users/Shared/lpm-lessons` (no user name in on-screen paths); keep projects shallow so command lines don't wrap.

The runner waits for each line's clip plus a 450 ms gap before the next beat; a beat that runs longer delays the next line (the mux log and the checks call that dead air).

## The stage (`s`)

| call | notes |
| --- | --- |
| `s.moveTo(sel, { at, ms, cue, pause, after })` | glides the drawn cursor and the real pointer; `at` is `[x, y]` inside the target (0–1, beyond for a spot next to it); `cue` finishes the glide on that word |
| `s.click(sel, { at, ms, cue, settle, verify, verifyMs })` | moves, then presses where the target is at that moment (it follows a target that shifted while the pointer travelled). `verify` (selector or async fn) must pass afterwards: while the target is still there it is pressed again, twice at most, then the take stops; once the target has gone it waits up to 6 s more for `verify` |
| `s.type(text, { words, after })` | real keystrokes through cliclick; refuses to type unless the lesson window is in front. In web form fields prefer `kit.typeInto(s, text)` (macOS capitalises the first letter of real keystrokes) |
| `s.press("Enter" \| "Escape" \| "Tab" \| …)`, `s.keys("cmd+shift+g")` | System Events key codes (a cliclick key press never reaches the page); same focus check |
| `s.waitFor(sel, timeout)` | until visible |
| `s.hold(ms)`, `s.holdUntil(msIntoLine)`, `s.cueMs("phrase")` | the narration clock; `cueMs` is when the phrase is spoken in the current line |
| `s.card(title, { hold, until, ms })` | a card: the title on the left, the app shown live at its right (the cover layout); `until: "<cue>"` ends it on that word so the rest of the line plays over the app. Whatever a beat does behind a card shows in that window, so seed or click before the card, or keep it still |
| `s.zoom(sel, { scale, at, ms, cue })`, `s.zoomOut({ ms, cue })` | push the picture in on a small control (1.6–2, 700–900 ms, finishing on the cue) and back out once the next thing is bigger; a few per lesson |
| `s.hideCursor()`, `s.showCursor()` | the drawn cursor |
| `s.waitForAgentReply(root, { since, prompt, configDir, endOfTurn, timeout, required })` | reads Claude's transcript: a reply after `since`, anchored on `prompt` when given (so an earlier answer or a fork never counts); `configDir` for a lesson's own account; `endOfTurn` waits for the end of the turn. A miss is a warning and a QA FAIL; `required: true` stops the take |
| `s.warn(kind, message)` | a note for the reviewer, listed after the take and in the checks |
| `s.frame(name)` | an extra frame into `frames/` |
| `s.control.evaluate(fn, ...args)` | runs `fn` in the app's page (JSON args); `s.control.call("window", { focus: true })` brings the window to the front |
| `s.point(sel, at)`, `s.origin`, `s.realMove(x, y)`, `s.mouse`, `s.log(m)` | page coordinates, the window's screen rectangle, a bare pointer move, `"real"` or `"dom"`, the take log |

In the page, `window.__lc` has `find(sel)` (true when visible), `el(sel)` (the matched element, or null), `rect(sel)`, `typeText(text)`, `hover`, `tap`, `pressKey`.

Selectors: CSS, `text=<substring>`, `css:has-text("…")` and `a >> b` chains; the smallest visible match wins, so scope a name that appears in two places (`.switcher-in >> button:has-text("api")` for the services menu row, `.no-scrollbar.overflow-x-auto >> button:has-text("api")` for the tab).

## The kit (`scripts/kit.js`)

`PROJECT(name)`, `HEADER(name)` (header action buttons), `TABS`, `COMPOSER_INPUT`, `SEND`; `writeProject`, `neutralShell`; `openAgent(s, "Claude", { cue })` (clicks until a new terminal tab opens, returns when); `claudeDone(root, since, { prompt, configDir })`, `codexDone(root, since)`, `until(s, check, { timeout, label })`; `clickUntil(s, sel, done)`; `typeInto(s, text)`; `waitGone(s, sel)`; `scrollTo(s, css)` (smoothly, inside its own scroll container); `isVisible`, `count`, `tagByPosition`, `focusWindow`, `focusLeft` (a vertical push-in that keeps canvas out of frame; a plain `s.zoom` on a landscape stage), `park`.

## The phone

With `"phone"` in lesson.json the stage also drives lpm Link (`scripts/phonestage.js`). The app window is 980×640 points, shown at 0.88 beside the phone. Phone elements come from the simulated iPhone's accessibility tree: `"Done"` is the exact label, `{ contains: "MacBook Pro" }` a part of it, `{ label, type: "Button", index }` narrows it.

| call | notes |
| --- | --- |
| `s.tap(sel, { cue, lead, at, verify, verifyMs, tries })` | a tap on the phone on its cue word, drawn as a touch mark: the element with that label nearest the point is pressed through Device Hub's accessibility bridge. `verify` (a phone selector or async fn) must pass afterwards; while the target is still there it is tapped again, `tries` times in all (2). The project screen's toolbar (back, +, ···) isn't in the tree, so it can't be tapped |
| `s.phoneWaitFor(sel, timeout)`, `s.phoneGone(sel, timeout)`, `s.phoneFind(sel)` | the phone's screen; `phoneFind` gives the element (`frame` in device points) or null |
| `s.phoneZoom(sel, { scale, at, ms, cue })` | `s.zoom` on a phone element, or on `{ point: [x, y] }` in device points (a terminal's text has no element); the phone sits at the frame's right edge, so the picture stops there |
| `s.zoomBoth(macSel, phoneSel, { scale, margin, cue, ms })` | one push-in that frames a Mac element and a phone element together, as close as both fit (the same account on both, the two match codes) |
| `s.phoneBack(label, { cue, verify, mark })` | iOS's back gesture (AXCancel) sent to the element labelled `label`, for screens whose toolbar has no element (the project screen); waits until that screen is gone, so two backs in a row both land. `mark: [x, y]` draws the tap on the back chevron it stands for |
| `s.phoneTouch(x, y, { cue })` | a touch mark at device point (x, y) that presses nothing: a tap on a stand-in picture (a provider on the pictured sign-in page) |
| `s.phoneStatusBar({ dataNetwork: "5g" })` | `simctl status_bar override` keys for the phone, e.g. cellular once the story leaves home |
| `s.phoneHome({ cue })`, `s.phoneOpenApp("lpm", { cue, verify, verifyMs })` | the Home button, then lpm Link opened afresh from its icon: the icon gets the touch mark and the app is launched again with `phone.env` (a real tap on the icon would start it without the lesson's environment) |
| `s.phoneMask(rect, { color, image, fit })` | paints over `[x, y, w, h]` (device points) until the returned function is called, in a colour or with a PNG; `fit: true` fits it to the recording (`scripts/maskfit.js`): on from the frame its spot settles (a page still loading under it included) to the frame it starts to move, and while the sheet slides in and out it follows the dark marks it hides up and down the screen |

`scripts/headscale.js` gives a lesson its own tailnet (`startHeadscale({ approveAfterMs, page })` in `setup`, account `alex`): both apps reach it through `TS_CONTROL_URL` (`http://127.0.0.1:18480`), the phone's sign-in sheet shows a plain "Signing in…" page, or `page` (a PNG of Tailscale's real sign-in page at the phone's width), and is let in by itself after `approveAfterMs`, and the Mac's sign-in link (caught in `window.__lessonOpened`, never opened) is let in with `tailnet.approve(link)`. Stop it in the last beat. The sheet's address bar reads 127.0.0.1: lesson 32 paints `login.tailscale.com` over it with a fitted `phoneMask`, and shows the Mac's browser as an inset (`lesson.json` `"insets"`: `{ line, from, to, image, url, box: [x, y, w] }`, a screenshot drawn as a browser window over the picture; `click: { at: [x, y], t }` glides the drawn pointer onto that share of the screenshot and clicks it `t` seconds into the line). `startHeadscale({ approveAfterMs: null })` leaves the phone's sign-in waiting for `tailnet.approvePending()`, so a beat can draw the tap on a provider first. A phone env `LPM_LESSON_AWAY_FLAG` (a file path) makes the lesson build of lpm Link skip the Mac's local addresses while that file exists, so a relaunch shows "Connected · over Tailscale". To fill the phone's terminal composer, send the Mac's draft for that terminal (`remote_set_composer_draft` with the `data-terminal-id`, a word at a time): lpm's draft sync puts it in the phone's composer, whose send button then sends it. Lesson 32 (`32-connect-your-iphone-to-lpm`) is the worked example, Claude Code from the phone included.

## Two Macs

With `"guest"` in lesson.json the take starts a second app beside the first (`scripts/twomacstage.js`): both windows are 840×640 points, side by side in the middle of the display, recorded in one capture and shown on the canvas at about 0.7 with a label over each (`scripts/twomac.js`). Every call drives one app at a time: `await s.use("guest")` moves the stage to the right-hand window (the drawn cursor leaves by the facing edge and comes in on the other window's, and that window comes to the front for keys), `await s.use("host")` back; `s.control`, `s.zoom`, `s.click`, `kit.park` and the rest follow. Give each app its own machine name through `env` (`LPM_LESSON_MACHINE_NAME`) so the real one never shows. Two apps that talk over the network need a port the user's own lpm doesn't hold (theirs keeps 8766: seed the host's `peer.json`). On a card the window beside the title is the left one at a lone window's size, fading in and out with the card (`crossfadeSpans` in compose.js). The cover's `crop` is in the capture's points (1704 wide). Lesson 41 (`41-share-claude-code-terminal`) is the worked example.

## A browser beside the app

With `"guest": { "browser": true, "labels", "window" }` the right-hand window is Chromium (Playwright's Chrome for Testing) on a throwaway profile instead of a second lpm (`scripts/browserside.js`), recorded and framed exactly as a second Mac is. `s.use("guest")` drives the page: selectors, `s.click`, `s.type`, `s.press`, `s.zoom` and `s.zoomBoth` work as on the app, with clicks and keys sent into the page as Playwright input events (never the real pointer, which stays in the gap between the windows; don't `kit.park` there). `s.app.page` is the Playwright page for navigation (`await s.app.page.goto(url)`); from the host side it is `s.sides.guest.app.page`. The drawn cursor comes back where it was after a navigation. Pages follow the Mac's appearance, CSP is bypassed so the cursor can be drawn on strict pages, and the browser reports a Safari user agent, so lpm.cx/join waits for a click instead of opening the user's own lpm. `s.zoomBoth(hostSel, guestSel, { scale, margin, cue, ms })` frames one element in each window together, on two Macs too. Lesson 42 (`42-share-terminal-in-browser`) is the worked example: the real lpm.cx/join page and the deployed share relay.

## Recipes

- Agents: the seeded header actions are `HEADER("Claude")` / `HEADER("Codex")`; a click opens the agent in its own tab. The composer is open on a fresh install: type into `COMPOSER_INPUT`, click `SEND` (a Send click reads better than a key), then `s.waitForAgentReply(root, { since, prompt })` so the "and Claude answers" line starts with the answer on screen. Claude runs with the user's real login: its plan line, statusline, cost and effort label show.
- Folder trust: Claude looks for trust up through the parents but never past a git root. The preflight trusts the workspace root (covers plain folders); a git folder (a clone, a `writeProject` with `gitInit`) is trusted by the `neutralShell` wrapper when the agent starts, else the first launch shows the trust prompt.
- Local folder: the open panel is a sheet inside the window. `s.keys("cmd+shift+g")`, `s.type(path)`, `s.keys("return")`, type-ahead the folder name, `s.keys("return")`. Its sidebar shows the user's own Favorites and home folder name.
- A "Clone repository" beat performs a real `git clone`; use a small public repository.
- A right-click menu: `s.control.evaluate` a `contextmenu` MouseEvent at the target's centre.
- Zooms after the take: the mux log lists `zooms: title#1 add#1 …`; `lesson.json` `"zooms": { "add#1": { "scale": 1.5 } }` changes the scale, `at` re-aims inside the recorded target, `ms` changes the ease (same end), `drop` removes it.
- Takes can be started from inside a Claude Code session: the lesson app never inherits that session's markers, a pinned account's `CLAUDE_CONFIG_DIR`, or API keys.
