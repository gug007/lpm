# Agent Guide — lpm

lpm starts, stops, duplicates, and switches between local dev projects, with a built-in terminal for running AI coding agents alongside services.

## Layout

- `desktop/frontend/` — Tauri 2 desktop app: React/TypeScript UI in `src/`, Rust backend in `src-tauri/`
- `cli/` — Rust CLI (`lpm`)
- `mobile/` — lpm Link, the iOS and Android companion apps. Read `mobile/AGENTS.md`
  and `mobile/android/PORTING.md` before changing anything in it
- `website/` — Next.js marketing site (lpm.cx). Every interactive demo on it is the
  desktop UI itself in an iframe, answered by `desktop/frontend/src/demo` and built
  into `website/public/demo-app` (`npm run dev:demo` in `desktop/frontend`,
  `?seed=sample` for the sample workspace)
- `relay/` — Cloudflare Worker that lets a browser join a shared tab (see its README).
  It's for tab sharing only: never give it other features' routes or storage
- `ping/` — Cloudflare Worker that counts the desktop app's daily usage pings
  (see its README). It keeps daily totals only
- `tailnet/` — built-in Tailscale (Go, tsnet): `cmd/lpm-tailnet` is the desktop
  sidecar (`scripts/build-tailnet.mjs`), `ios/` and `android/` the libraries
  lpm Link links

## Conventions

- No comments unless the reasoning isn't clear from the code itself
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
  `headless()`, and the login shell, which on Windows is Git for Windows bash),
  and `src/platform.ts` in the frontend
- Shortcuts: macOS uses ⌘; Linux/Windows use Ctrl+Shift for app chords and leave
  plain Ctrl+letter to the terminal and composer. Show platform-correct labels
- Check every Rust change for Windows with
  `AWS_LC_SYS_PREBUILT_NASM=1 cargo check --target x86_64-pc-windows-gnu`
  (needs `brew install mingw-w64`, the rustup target, a placeholder
  `binaries/lpm-cli-x86_64-pc-windows-gnu.exe`, and
  `node scripts/build-tailnet.mjs x86_64-pc-windows-gnu`)
- One React component per file
- Keep files focused: don't grow a file past ~400 lines — put new features in their own module
- On any `cli/` change, bump `version` in `cli/Cargo.toml` — patch for fixes, minor
  for new commands/flags — so stale installed binaries stay detectable via
  `lpm --version`. When a desktop change touches CLI-supported functionality,
  update the CLI and the `lpm-cli` skill in the same change
- Keep lpm Link (`mobile/`) in step with the desktop app: when a desktop change
  touches something the phone also offers (actions, services, terminals,
  automations, Git, notes, memory, project config), update the mobile app in the
  same change so it looks and behaves the same — same fields, defaults, placement
  and colors. Data the phone needs goes through `remote.rs`, `mobile/PROTOCOL.md`
  and Demo Mode's seed, and a phone edit writes the config exactly as a desktop
  edit would
- Keep connected computers (+ above your projects → Another computer or Server) in step with the desktop app: a project on a paired machine must work the same as a local one
- Give every new Tauri command a demo answer: handle it in a `desktop/frontend/src/demo`
  module, or list the empty value of its return type in `src/demo/defaults.ts`
  (`defaults.test.ts` fails until you do)
- Crash reports reach Sentry only through `src-tauri/src/crashreport.rs` and
  `src/crashReports.ts`, which honor the owner's off switch and strip home folder
  names and credentials. Report an error with `reportError` (frontend) or a panic
  (Rust): never a second Sentry client, an SDK's own integrations, or user content
  (code, terminal output, prompts, project names). `website/app/privacy/page.tsx`
  says what a report holds — keep it true
- The daily usage ping leaves only through `src-tauri/src/dailyping.rs`, honors
  the owner's off switch, and carries no ID: never add a per-install identifier,
  a field that tells computers apart, or user content, and never store a ping or
  its address in `ping/`. The privacy page and the security page's network list
  (`website/app/security/_components/network-list.tsx`) say what a ping holds —
  keep them true
- Clean up when you're done: delete what you made just for the task — throwaway
  copies and their build output (in the `lpm-linux` Lima VM, then `sudo fstrim -av`
  so the Mac gets the space back), one-off simulators and emulators, repro folders.
  Keep the main checkout's build folders for incremental builds
- Don't commit or push unless asked
