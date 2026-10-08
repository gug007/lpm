---
name: app-review-video
version: 1.1.0
argument-hint: "[--device \"iPhone 18 Pro\"] [--build <n>]"
description: "Record the App Store review demo video for lpm Link: the lpm desktop app and lpm Link on a physical iPhone (live through iPhone Mirroring) side by side, pairing and then controlling the Mac from the phone, driven with computer use. Isolated review Mac with demo projects, recorder that captures only those two windows plus a log of the clicks, waits between clicks cut, tap ripples, close-ups on the phone, other people's Mac names blurred, numbered step captions, title and closing cards, 1920x1080 MP4. Use when the user asks for an App Store / App Review / Apple review video, a physical-device demo video, or a video of connecting the iPhone to the Mac."
---

App Review asks for a video of lpm Link on a **physical device** connected to the Mac (the
earlier one: unlisted YouTube, linked from App Review Information → Notes). This skill makes it:
the left half is the lpm desktop app, the right half is the real iPhone through iPhone Mirroring,
and every tap and click is a real one made with computer use.

`scripts/review.js` runs the session (`node scripts/review.js` prints the commands):
- `setup` builds (first run, or `--build` after desktop changes) an isolated debug app named
  **lpm Review** (bundle `cx.lpm.appreview`, so computer use can see it and never touches the
  user's own lpm), wipes and seeds `~/.lpm-review` with three demo projects under
  `/Users/Shared/lpm-review` (`storefront` with `api` :4000 and `web` :5173, `payments-api`,
  `docs-site`), turns remote control on (port 8792), names the Mac **MacBook Pro**
  (`--name`; no owner name, no dev marker), neutral shell prompt, and places its window to the
  left of the iPhone Mirroring window, as tall as the phone.
- `record` starts a ScreenCaptureKit recording of the rectangle around both windows, with
  every other app left out (notifications, the user's windows and dialogs never show) and the
  pointer drawn. It also logs every mouse press, release and move and the moment of each
  key press (never which key) to `events.jsonl`, through a listen-only event tap. It returns
  at once; the capture keeps running.
- `mark "<caption>" "<subtitle>"` starts the next numbered step caption.
- `checkpoint` before an uncertain action; `cut` if it went wrong drops everything since the
  checkpoint from the video. Redo the action after the cut.
- `stop`, then `render --device "<model>" [--build <n>] [--version <v>] [--cut a-b,…]
  [--redact <regex>] [--no-camera]` writes
  `~/Movies/lpm-app-review/<stamp>/lpm-link-<version>-app-review.mp4` and `steps.txt` (where
  each step starts). The version defaults to `mobile/project.yml`. The render:
  - keeps each click's response (the screen changes until the next click, at most 12 s) with a
    short hold, and drops everything between: waits, a server's log, a clock (`edit.js`);
  - draws a ripple at every click;
  - eases in up to 1.8x on the part of the phone a tap changed (a menu, the message field)
    when the response stays on the phone, and back out when it reaches the Mac or the next
    click is on the Mac; the header then names only the device in view (`camera.js`);
  - reads the kept frames twice a second with Vision and blurs any line in someone's
    possessive form ("Someone's MacBook Pro"), any email address and any `--redact` pattern,
    for as long as it is on screen; the review Mac's own name stays readable (`redact.js`);
  - with no `events.jsonl` (an older take) it cuts on screen changes alone.
- `teardown` quits the review Mac (the phone hears it close), stops its servers and deletes
  its data and demo projects.

**Before the take**
1. The iPhone has the build under review installed (Xcode or TestFlight) and is near the Mac,
   locked, on the Mac's Wi-Fi. Ask the user for the device model and build number for the
   title card if they matter.
2. `request_access(["iPhone Mirroring"])`, `open_application("iPhone Mirroring")`, screenshot.
   "iPhone in Use" means the user has the phone: ask them to lock it. Bring lpm Link to its
   first screen ("Connect to your Mac"): ⌘2 (App Switcher), swipe its card up, ⌘3 (Spotlight),
   type `lpm Link`, open the top hit. If it lists saved Macs instead, ask the user before
   removing any.
3. `node scripts/review.js setup`, then `request_access(["cx.lpm.appreview"])` and a
   screenshot: lpm Review on the left with the three projects, the phone on the right.

**The take** (`record`, then for each step `mark` first, then act). Call
`open_application` for the app you are about to click before every batch: a screenshot hands
focus to another granted app, and the click then lands in the wrong one.

| # | mark | actions | must be on screen |
|---|---|---|---|
| 1 | Pair lpm Link with the Mac / Same Wi-Fi: pick the Mac on the iPhone, then approve it on the Mac | Mac: sidebar **More → Mobile app** (Mobile devices: Remote control On, Same network Ready). Phone: **Pair for this Wi-Fi only** → the row named MacBook Pro with "Tap, then approve on the Mac". Mac: "Allow this device to connect?" with a match code; rest the pointer on the Mac's code, then the phone's, then **Allow** | phone "Connected to MacBook Pro"; Mac "iPhone · Connected now" |
| 2 | The Mac's projects appear on the iPhone / The same list as the Mac's sidebar | phone **Done**; point at the Mac sidebar, then the phone list; Mac: click **storefront** | the same three projects on both |
| 3 | Start a project from the iPhone / Its dev servers start on the Mac | phone: **storefront → ··· → Start**; Mac: click the **All** tab; phone: tap **api** (its output sheet), wait for the output | Mac Stop button + both servers listening; phone "Running" and the same output |
| 4 | Stop it from the iPhone / The Mac stops the dev servers | phone: **Close**, **··· → Stop** | Mac back to Start; phone "Stopped" |
| 5 | Open a terminal on the Mac from the iPhone / Type on the iPhone; the command runs on the Mac | phone **+** (opens Terminal 1 on the Mac) → tap **Terminal 1** → tap Message, type `git status && ls src`, send (↑) | Mac "Active in iPhone · Take control"; the output on the phone |
| 6 | Take the terminal back on the Mac / The same session, with what the iPhone ran | Mac: **Take control** | the command and its output in the Mac terminal; phone "Active on Main window" |

Then wait 2 s and `stop`. The raw take runs about three minutes; the render keeps every change
with a short hold and drops the waits between actions, so about 1:20 plus the cards.

**After**
1. `render`, then look at it before showing anyone: `ffmpeg -i <mp4> -vf
   "fps=1/3,scale=480:-2,tile=5x7" -frames:v 1 sheet.png` and read `steps.txt`. Check each
   step shows its result on both sides. To drop a fumble, find its raw seconds (frames of
   `raw.mov`) and render again with `--cut a-b`. Look at a frame of step 1 at full size: the
   other Macs' names must be blurred.
2. Clean up the phone (it would keep MacBook Pro as an offline Mac): back to the projects
   list, title **MacBook Pro ⌄ → Manage machines… → MacBook Pro → Remove from this iPhone →
   Remove → Done**; the app is on "Connect to your Mac" again. Then
   `node scripts/review.js teardown`.
3. Give the user the MP4 path and the step times. Uploading it (unlisted YouTube, as before)
   and editing App Review Information in App Store Connect publish or change things outside
   this Mac: only with their explicit OK. Notes should name the version and build, say the
   right half is a physical iPhone through iPhone Mirroring, and keep the Demo Mode steps.

**Traps**
- Real input only through computer use. Never System Events, cliclick or CGEvent posting:
  synthetic keys go to whatever the user has focused.
- iOS smart punctuation turns `--` into `—` and straight quotes into curly ones as you type
  on the phone, and the Mac's composer mirrors the draft. Type commands with no double dashes
  or quotes (`git status && ls src`). If one slips in: ⌘A, delete, retype, and `--cut` the
  stretch (or `checkpoint`/`cut` around it).
- The phone's Wi-Fi list shows every lpm Mac on the network, the user's own included (their
  names are blurred in the render), and an entry from an earlier `setup` can linger for a
  minute. Tap the one with the `--name` name and "Tap, then approve on the Mac".
- Anything that changes the screen on its own keeps footage: periodic log output, a scrolling
  log, a spinner. The seed servers print one line and stay quiet; keep demos that way. An
  output sheet left open on the phone while a server logs scrolls on every line.
- The phone is a fifth of the frame, so the render weighs its changes separately (strong: Mac
  1000+ or phone 450+ changed pixels of a 640-wide copy; bursts of 3+ small changes count as
  typing). A lone small change is cut as idle.
- Computer use's clicks and pointer moves reach the event tap; its key presses (Escape, at
  least) may not. Typing is still kept: it falls inside the response window of the click on
  the field, where screen changes decide.
- ffmpeg: a split → crop → overlay pair per blurred box, chained, doubles the frame requests
  per box (12 boxes took seconds, 16 never finished). One split feeds every crop instead.
- The review app loads its UI from Vite on :9245; `setup` starts one with HMR off when none
  runs. `teardown` stops only the one it started.
- The macOS recording indicator in the menu bar and computer use hiding other apps happen
  outside the captured rectangle and never reach the video.
