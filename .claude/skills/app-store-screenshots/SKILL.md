---
name: app-store-screenshots
description: "Make the App Store screenshots for lpm Link (iPhone 6.3\" 1206x2622, iPad 13\" 2064x2752 and iPhone Duo closed 1398x2034 and open 2007x2853) from the current mobile/ source: a screenshot build of the app opens each screen straight into Demo Mode sample data in the iOS Simulator (no taps, no personal data), and each capture is laid into a store image with a headline, a subline and a device frame. Captions, order and screens live in shots.json. Use when the user asks for new, updated or regenerated App Store / App Store Connect screenshots, store images, or product page screenshots for the iOS app."
version: 1.0.0
argument-hint: "[--device iphone|ipad|duo-closed|duo-open] [--only name,name]"
metadata:
  lpm-created: "true"
---

Makes the lpm Link App Store screenshots again whenever the app changes, with no
clicking in the app: `scripts/shots.js` builds a screenshot copy of the app, launches it once
per screen in the iOS Simulator, and composes the store images. The one manual step is opening
the iPhone Duo (below).

```
node scripts/shots.js all          # build, prepare, capture, compose (~2.5 min)
node scripts/shots.js capture --only diff,stats --device iphone
node scripts/shots.js compose      # after editing captions only (seconds)
node scripts/shots.js cleanup      # clear status bars, shut down simulators it booted
```

- `build` copies `mobile/` to `~/Library/Caches/lpm-app-store-shots/src` (the repo is never
  touched), applies the `PATCHES` in `scripts/build.js`, adds `scripts/swift/*.swift`, runs
  `xcodegen` and a Release simulator build. The copy shows Demo Mode as a real Mac: no purple
  Demo banner, the Mac is "MacBook Pro", the status line reads "Connected · on your network",
  a busier sample seed (`ShotSeed.swift`), and the storefront Claude session already finished
  and waiting on you.
- `prepare` finds (or creates) the simulators named in `shots.json`, sets US English (the clock
  reads 9:41, not 09:41; reboots once), a full non-charging battery, light mode, installs the
  build and launches it once (the first launch after an install is slow).
- `capture` launches the app with `LPM_SHOT_ROUTE=<route>` (`ShotDriver.swift` enters Demo
  Mode and pushes the route), waits, and saves `simctl io screenshot` at native size (the
  device's `display` when it has one).
- `compose` (`compose.swift`) writes the store images without an alpha channel (App Store
  Connect rejects one) and a contact sheet per device.

Output: `~/Pictures/lpm-link-app-store/<version>/` with `iphone-6.3/NN-name.png`,
`ipad-13/NN-name.png`, `iphone-duo-outer/NN-name.png`, `iphone-duo-inner/NN-name.png`,
`sheet-<device>.png` and `source/raw/`. The version
comes from `mobile/ios/project.yml`; `--version <v>` writes elsewhere (use it to try changes
without replacing a set the user already has).

**shots.json**: `devices` (simulator name, folder, store size, `screenRadius` of the display in
raw pixels, one number or top-left/top-right/bottom-right/bottom-left, `cutout` for the camera
simctl leaves out as x/y/width/height in raw pixels, and for the Duo the `pose` and the
`display` to capture) and `shots` in store order, each with
`name`, `route`, `title` (`\n` for the line break, two lines at most), `subtitle` (one line,
about 50 characters on iPhone), `devices`, an optional `wait` in seconds (default 4), and
optional `captions` to give one device its own `title`/`subtitle`.
Route steps, joined by ` > `, are pushed in order:
`list` · `project:<name>` · `terminal:<project>/<terminalId>` · `changes:<project>` ·
`usage` · `stats` · `automations` · `automation:<project>/<jobId>`.
Demo names: projects `storefront`, `api-gateway`, `analytics`, `mobile-app`, `blog`, …;
terminal `demo-storefront-claude`; automation `nightly-tests`
(`mobile/ios/Sources/LpmMobile/DemoWorld.swift`, `DemoJobs`).

**iPhone Duo**
Apple lists two Duo sizes, closed (outer display, 1398x2034, `display: primary`) and open
(inner display, 2007x2853, `primary-1`), without saying yet whether a listing needs both, so
the skill makes both from one simulator: `duo-closed` has the iPhone set, `duo-open` the iPad
set. The display of the other pose is dark. The Duo boots closed, every boot, so `duo-closed`
captures on its own; nothing in `simctl` folds it, so `duo-open` waits (up to 5 minutes)
printing "set it to Open, in portrait, in Device Hub" until the inner display shows a portrait
picture. Run `all` in the background, and when that line appears open it with computer use:
Device Hub (`com.apple.dt.Devices`) → iPhone Duo → bottom bar, the rightmost pose button
("Open"; the first click may only focus the window), then the rotate button left of the poses
once, to portrait. Closed is the leftmost pose button. Then move the pointer off the device:
hovering over it acts as a pointer in iOS, and the terminal shows a scroll bar in the shots. The outer display's hinge-side corners
are nearly square and its camera is a circle top-right, which `compose` draws back in.

**After a run**
1. Read every contact sheet and one image per device at full size: every screen is the one its
   caption names, no "Demo" wording, nothing personal, text not clipped.
2. Give the user the full paths (`ls` the folders).
3. Uploading to App Store Connect replaces public listing images: only with the user's OK.
   Version page → App Previews and Screenshots → "iPhone with Dynamic Island (medium display)",
   "iPad 13\" display" and "iPhone Duo" → Remove All, then upload in order. The iPhone Duo slot
   (10 at most) takes both sizes in one set, and the user wants the terminal shown closed, then
   open: inner `projects`, outer `agent`, inner `agent` (captioned "Unfold for more room"), inner
   `diff`, `usage`, `stats`, `automation`, then outer `project` last (the only other closed shot
   whose caption the open set doesn't already use). Duo screenshots put an
   "optimized for iPhone Duo" badge on the product page, and from April 2027 Apple requires them
   for builds made with the iOS 27.1 SDK or later. Chrome's `file_upload` only reads files this
   session may read, and at most 10 MB per call: copy the PNGs into the scratchpad first and
   upload a set in batches.

**When the app changes**
- A screen moved or got a new look: just run `all`.
- `build` stops with "patch anchor … matched 0 times": the patched code changed. Update that
  entry in `PATCHES` (`scripts/build.js`) to the new code; each anchor must match once.
- A new screen to show: if no route step reaches it, add a case to `NotificationRoute` and its
  destination through `PATCHES`, and the step to `ShotDriver.path`.
- New sample data: `ShotSeed.swift` (screenshot only) or the Demo Mode seed itself.

**Traps**
- Store copy never mentions Tailscale (the user's call), and the first "Connect to your Mac"
  screen promotes it, so it isn't in the set.
- Xcode 27 has no Simulator.app (it's Device Hub, `com.apple.dt.Devices`); only opening the
  iPhone Duo needs its window. Other sessions may run their own simulators: `cleanup` only touches
  the ones named in `shots.json` and only shuts down those it booted.
- iPadOS runs the app in a window: the iPad status bar shows "lpm" and a resize corner.
- The iPhone Duo simulator needs the iOS 27.1 runtime (`xcodebuild -downloadPlatform iOS`,
  about 8 GB); `prepare` creates it on the newest runtime that runs the device.
- Usage and Stats figures come from the demo seed relative to now, so they shift a little
  between runs.
