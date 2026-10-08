# Agent Guide — lpm

lpm starts, stops, duplicates, and switches between local dev projects, with a built-in terminal for running AI coding agents alongside services. The desktop app runs on macOS, Linux and Windows.

## Layout

- `desktop/frontend/` — Tauri 2 desktop app: React/TypeScript UI in `src/`, Rust backend in `src-tauri/`
- `cli/` — Rust CLI (`lpm`)
- `mobile/` — iOS companion app (SwiftUI); `.xcodeproj` is generated — run `xcodegen generate` after adding files
- `website/` — Next.js marketing site (lpm.cx)
- `tailnet/` — built-in Tailscale (Go, tsnet): `cmd/lpm-tailnet` is the desktop
  sidecar (`scripts/build-tailnet.mjs`), `ios/` the static library lpm Link links
  (`mobile/build-tailnet.sh`). Needs Go (`brew install go`)


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
- Never commit or push any changes

## Analytics
- **Google Search Console**: https://search.google.com/search-console?resource_id=sc-domain%3Alpm.cx
- **Google Analytics**: https://analytics.google.com/analytics/web/#/a389756177p531055430/reports/intelligenthome?params=_u..nav%3Dmaui