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
| `limits` | `false` leaves the Claude/Codex usage meters out |
| `music` | `false`, or a file, instead of the default bed |
| `zooms` | mux-time edits of the take's zooms by id, see below |
| `coldOpen` | `{ text, shots: [{ line, from, to }] }`: the video opens on the payoff. `text` is the hook (one or two sentences: what the viewer gets), spoken over the shots, which are cut from later in the take (`from`/`to` in seconds from that line's start, so they survive a new take). It replaces the first line's narration; the opening card follows, then the lesson from its second line. Pick the shots from a take's frames or `qa/sheet.jpg`; the hook is voiced on the first render that needs it, `--mux-only` included |
| `speedUpWaits` | `false` keeps waits real time. By default a stretch of more than 2.5 s with nothing said between two lines (an agent working) plays at 4× under a badge, faster when it is long |
| `cover` | `{ words, line, at, crop, style }`: the thumbnail from a moment of the take instead of the plain opening card. `words` 2–4, adding to the title rather than repeating it; `at` seconds into `line`; `crop` `[x, y, w, h]` in the window's points (1100×620, default: the pane right of the sidebar); `style` `"window"` (words left, the window right, off the edge) or `"closeup"` (the crop full width under a band of canvas) |
| `youtube` | `{ hook: [line, line], learn: [], tags: [], hashtags: [] }`, the upload's description and tags |

## beats.js

```js
const kit = require("<repo>/.claude/skills/video-lesson/scripts/kit");
module.exports = {
  async setup({ lpmDir, workspace, lesson, settings }) { … },   // before launch
  async title(s, line) { await s.card("Title"); },              // one per narration id
  …
};
```

`setup` seeds folders and settings (never a narration id called `setup`). A seeded folder needs a manifest the app can read (a `package.json` with a `dev`/`start` script, a Procfile, `manage.py`…) or adding it writes the `configure me` placeholder. `kit.writeProject(lpmDir, workspace, { name, port, services, files, gitInit })` writes a folder under `<workspace>/Projects` and its lpm config; `settings({ defaultProjectDirectory, projectOrder })` patches `settings.json`. `kit.neutralShell(lpmDir, workspace)` gives every pane a plain `%1~ %#` prompt (the real one shows the account and computer name) and wraps `claude`/`codex` to record their one-time folder trust. The workspace is `/Users/Shared/lpm-lessons` (no user name in on-screen paths); keep projects shallow so command lines don't wrap.

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

In the page, `window.__lc` has `find(sel)` (true when visible), `rect(sel)`, `typeText(text)`, `hover`, `tap`, `pressKey`.

Selectors: CSS, `text=<substring>`, `css:has-text("…")` and `a >> b` chains; the smallest visible match wins, so scope a name that appears in two places (`.switcher-in >> button:has-text("api")` for the services menu row, `.no-scrollbar.overflow-x-auto >> button:has-text("api")` for the tab).

## The kit (`scripts/kit.js`)

`PROJECT(name)`, `HEADER(name)` (header action buttons), `TABS`, `COMPOSER_INPUT`, `SEND`; `writeProject`, `neutralShell`; `openAgent(s, "Claude", { cue })` (clicks until a new terminal tab opens, returns when); `claudeDone(root, since, { prompt, configDir })`, `codexDone(root, since)`, `until(s, check, { timeout, label })`; `clickUntil(s, sel, done)`; `typeInto(s, text)`; `waitGone(s, sel)`; `scrollTo(s, css)` (smoothly, inside its own scroll container); `isVisible`, `count`, `tagByPosition`, `focusWindow`, `focusLeft` (a vertical push-in that keeps canvas out of frame; a plain `s.zoom` on a landscape stage), `park`.

## Recipes

- Agents: the seeded header actions are `HEADER("Claude")` / `HEADER("Codex")`; a click opens the agent in its own tab. The composer is open on a fresh install: type into `COMPOSER_INPUT`, click `SEND` (a Send click reads better than a key), then `s.waitForAgentReply(root, { since, prompt })` so the "and Claude answers" line starts with the answer on screen. Claude runs with the user's real login: its plan line, statusline, cost and effort label show.
- Folder trust: Claude looks for trust up through the parents but never past a git root. The preflight trusts the workspace root (covers plain folders); a git folder (a clone, a `writeProject` with `gitInit`) is trusted by the `neutralShell` wrapper when the agent starts, else the first launch shows the trust prompt.
- Local Folder: the open panel is a sheet inside the window. `s.keys("cmd+shift+g")`, `s.type(path)`, `s.keys("return")`, type-ahead the folder name, `s.keys("return")`. Its sidebar shows the user's own Favorites and home folder name.
- A "Clone Repository" beat performs a real `git clone`; use a small public repository.
- A right-click menu: `s.control.evaluate` a `contextmenu` MouseEvent at the target's centre.
- Zooms after the take: the mux log lists `zooms: title#1 add#1 …`; `lesson.json` `"zooms": { "add#1": { "scale": 1.5 } }` changes the scale, `at` re-aims inside the recorded target, `ms` changes the ease (same end), `drop` removes it.
- Takes can be started from inside a Claude Code session: the lesson app never inherits that session's markers, a pinned account's `CLAUDE_CONFIG_DIR`, or API keys.
