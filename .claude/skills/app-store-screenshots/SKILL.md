---
name: app-store-screenshots
version: 1.0.0
argument-hint: "[--device iphone|ipad] [--only name,name]"
description: "Make the App Store screenshots for lpm Link (iPhone 6.3\" 1206x2622 and iPad 13\" 2064x2752) from the current mobile/ source: a screenshot build of the app opens each screen straight into Demo Mode sample data in the iOS Simulator (no taps, no personal data), and each capture is laid into a store image with a headline, a subline and a device frame. Captions, order and screens live in shots.json. Use when the user asks for new, updated or regenerated App Store / App Store Connect screenshots, store images, or product page screenshots for the iOS app."
---

Makes the lpm Link App Store screenshots again whenever the app changes, with no
clicking: `scripts/shots.js` builds a screenshot copy of the app, launches it once per
screen in the iOS Simulator, and composes the store images.

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
  reads 9:41, not 09:41; reboots once), a full non-charging battery, light mode, and installs
  the build.
- `capture` launches the app with `LPM_SHOT_ROUTE=<route>` (`ShotDriver.swift` enters Demo
  Mode and pushes the route), waits, and saves `simctl io screenshot` at native size.
- `compose` (`compose.swift`) writes the store images without an alpha channel (App Store
  Connect rejects one) and a contact sheet per device.

Output: `~/Pictures/lpm-link-app-store/<version>/` with `iphone-6.3/NN-name.png`,
`ipad-13/NN-name.png`, `sheet-iphone.png`, `sheet-ipad.png` and `source/raw/`. The version
comes from `mobile/project.yml`; `--version <v>` writes elsewhere (use it to try changes
without replacing a set the user already has).

**shots.json**: `devices` (simulator name, folder, size) and `shots` in store order, each with
`name`, `route`, `title` (`\n` for the line break, two lines at most), `subtitle` (one line,
about 50 characters on iPhone), `devices`, and an optional `wait` in seconds (default 4).
Route steps, joined by ` > `, are pushed in order:
`list` · `project:<name>` · `terminal:<project>/<terminalId>` · `changes:<project>` ·
`usage` · `stats` · `activity` · `automations` · `automation:<project>/<jobId>`.
Demo names: projects `storefront`, `api-gateway`, `analytics`, `mobile-app`, `blog`, …;
terminal `demo-storefront-claude`; automation `nightly-tests`
(`mobile/Sources/LpmMobile/DemoWorld.swift`, `DemoJobs`).

**After a run**
1. Read both contact sheets and one image per device at full size: every screen is the one its
   caption names, no "Demo" wording, nothing personal, text not clipped.
2. Give the user the full paths (`ls` the folders).
3. Uploading to App Store Connect replaces public listing images: only with the user's OK.
   Version page → App Previews and Screenshots → "iPhone with Dynamic Island (medium display)"
   and "iPad 13\" display" → Remove All, then upload in order. Chrome's `file_upload` only reads
   files this session may read: copy the PNGs into the scratchpad first.

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
- Xcode 27 has no Simulator.app (it's Device Hub, `com.apple.dt.Devices`); this skill doesn't
  need a window at all. Other sessions may run their own simulators: `cleanup` only touches
  the ones named in `shots.json` and only shuts down those it booted.
- iPadOS runs the app in a window: the iPad status bar shows "lpm" and a resize corner.
- Usage and Stats figures come from the demo seed relative to now, so they shift a little
  between runs.
