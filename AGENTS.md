# Agent Guide — lpm

lpm starts, stops, duplicates, and switches between local dev projects, with a built-in terminal for running AI coding agents alongside services. The desktop app runs on macOS, Linux and Windows.

## Layout

- `desktop/frontend/` — Tauri 2 desktop app: React/TypeScript UI in `src/`, Rust backend in `src-tauri/`
- `cli/` — Rust CLI (`lpm`)
- `mobile/` — lpm Link, the phone companion apps:
  - `PROTOCOL.md` — the wire contract both apps implement
  - `shared/web/` — xterm.js terminal and markdown pages, bundled into both apps' WebViews
  - `ios/` — iOS app (SwiftUI); `.xcodeproj` is generated — run `xcodegen generate` in `mobile/ios` after adding files
  - `android/` — Android app (Kotlin, Compose, Hilt, Navigation 3; modules built from
    the `build-logic` convention plugins). In `mobile/android` run `./gradlew spotlessApply`,
    then `./gradlew check assembleRelease`. It's a port of the iOS app on Google's
    architecture recommendations: read `mobile/android/PORTING.md` first
  - `parity/` — the same Maestro flows on both apps in an iPhone simulator and an
    Android emulator, with a side-by-side report (`node mobile/parity/parity.js all --open`)
- `website/` — Next.js marketing site (lpm.cx). Every interactive demo on it is the
  desktop UI itself in an iframe: `desktop/frontend/src/demo` answers its commands
  from sample data in memory and plays each page's tour against the real UI
  (`npm run dev:demo` in `desktop/frontend`, `?seed=sample` for the sample
  workspace), built into `website/public/demo-app`. `/changelog` shows each
  GitHub release's notes, which `scripts/release.sh` has Claude write into the
  tag; `website/lib/changelog.json` holds older releases' notes
- `relay/` — Cloudflare Worker that lets a browser join a shared tab: a Durable
  Object room per share, forwarding Noise-encrypted messages, and the guest page
  (lpm-share-relay.lpm-share-relay.workers.dev). `npm run dev` / `npm test` / `npm run deploy`; see its README.
  It's for tab sharing only: never give it other features' routes or storage
- `tailnet/` — built-in Tailscale (Go, tsnet): `cmd/lpm-tailnet` is the desktop
  sidecar (`scripts/build-tailnet.mjs`), `ios/` the static library lpm Link links
  (`mobile/ios/build-tailnet.sh`). Needs Go (`brew install go`)


## Conventions

- Clean code and best practices; no comments unless the reasoning isn't clear from the code itself
- The desktop app targets macOS, Linux and Windows, and Linux is also a
  headless *host* (the same binary on a server, driven from a Mac). macOS
  behaviour must not change when another platform is added: gate platform code
  with `#[cfg(target_os = "macos")]` / `#[cfg(windows)]` / `#[cfg(unix)]` and give
  every platform a working path or a clear error — never an unconditional
  `scutil`/`lsof`/`pbcopy`/`open`/`osascript`/Keychain call, `std::os::unix`
  import or `libc` call
- Use the shared seams instead of raw platform APIs: `ipc` (socket types),
  `osproc` (kill/alive/detach, and `osproc::command` so console children don't
  flash a window on Windows), `fsperm` (mode bits, locks), `sys` (PATH, `which`,
  login shell, `headless()`), and `src/platform.ts` in the frontend
- Windows runs shell lines through Git for Windows bash (`sys::login_shell`)
- Shortcuts: macOS uses ⌘; Linux/Windows use Ctrl+Shift for app chords and leave
  plain Ctrl+letter to the terminal and composer. Show platform-correct labels
- Check every Rust change for Windows with
  `AWS_LC_SYS_PREBUILT_NASM=1 cargo check --target x86_64-pc-windows-gnu`
  (needs `brew install mingw-w64`, the rustup target, a placeholder
  `binaries/lpm-cli-x86_64-pc-windows-gnu.exe`, and
  `node scripts/build-tailnet.mjs x86_64-pc-windows-gnu`)
- One React component per file
- Keep files focused: don't grow a file past ~400 lines — put new features in their own module
- Bump `version` in `cli/Cargo.toml` on any `cli/` change — patch for fixes, minor for new commands/flags — so stale installed binaries stay detectable via `lpm --version`
- When a lpm desktop app change touches CLI-supported functionality, update the lpm CLI and the `lpm-cli` skill in the same change.
- Keep lpm Link (`mobile/`) in step with the desktop app: when a desktop change
  touches something the phone also offers (actions, services, terminals,
  automations, Git, notes, memory, project config), update the mobile app in the
  same change so it looks and behaves the same — same fields, defaults, placement
  and colors. Data the phone needs goes through `remote.rs`, `mobile/PROTOCOL.md`
  and Demo Mode's seed (`mobile/ios/Sources/LpmMobile/Demo*.swift`, mirrored in
  `mobile/android/core/demo` — regenerate its goldens with
  `core/demo/ios-parity/generate.sh`), and a phone edit writes the config exactly
  as a desktop edit would. Once the Android app
  implements a feature, change it on both phones in the same change, and keep
  its parity flow in `mobile/parity/flows` passing on both
- Keep connected computers (Settings → Connections) in step with the desktop app: a project on a paired machine must work the same as a local one
- Give every new Tauri command a demo answer: handle it in a `desktop/frontend/src/demo`
  module, or list the empty value of its return type in `src/demo/defaults.ts`
  (`defaults.test.ts` fails until you do)
- Don't commit or push unless asked

 

