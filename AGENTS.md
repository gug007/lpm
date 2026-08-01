# Agent Guide — lpm

lpm starts, stops, duplicates, and switches between local dev projects, with a built-in terminal for running AI coding agents alongside services. macOS only.

## Layout

- `desktop/frontend/` — Tauri 2 desktop app: React/TypeScript UI in `src/`, Rust backend in `src-tauri/`
- `cli/` — Rust CLI (`lpm`)
- `mobile/` — iOS companion app (SwiftUI); `.xcodeproj` is generated — run `xcodegen generate` after adding files
- `website/` — Next.js marketing site (lpm.cx)


## Conventions

- Clean code and best practices; no comments unless the reasoning isn't clear from the code itself
- The desktop UI ships on macOS only — don't add Windows code paths. Linux is a
  supported *host* target (a headless server running the same binary, controlled
  from a Mac), so core modules must stay portable: gate platform calls with
  `#[cfg(target_os = "macos")]` and give non-macOS a working path or a clear
  error, never an unconditional `scutil`/`lsof`/`pbcopy`/Keychain call
- One React component per file
- Keep files focused: don't grow a file past ~400 lines — put new features in their own module
- Bump `version` in `cli/Cargo.toml` on any `cli/` change — patch for fixes, minor for new commands/flags — so stale installed binaries stay detectable via `lpm --version`
- Never commit or push any changes

## Analytics
- **Google Search Console**: https://search.google.com/search-console?resource_id=sc-domain%3Alpm.cx
- **Google Analytics**: https://analytics.google.com/analytics/web/#/a389756177p531055430/reports/intelligenthome?params=_u..nav%3Dmaui