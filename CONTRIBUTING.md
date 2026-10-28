# Contributing to lpm

Found a bug or have an idea? See [Feedback](README.md#feedback-and-contributing). Before a big change, open an issue or idea first.

## Build

You need Node.js 22, Rust, Go and Tauri's [prerequisites](https://v2.tauri.app/start/prerequisites/). [desktop-ci.yml](.github/workflows/desktop-ci.yml) shows the exact setup for Linux and Windows.

```sh
cd desktop/frontend
npm ci
npm run tauri dev
```

The dev build shares `~/.lpm` with the installed app. Run it with `LPM_DIR="$HOME/.lpm-dev"` to start empty.

For the UI alone, run `npm run dev:demo` and open http://127.0.0.1:9246/?seed=sample.

## Test

- UI: `npx tsc --noEmit && npm test` in `desktop/frontend`
- App: `cargo test --lib` in `desktop/frontend/src-tauri`, after `npx vite build`
- CLI: `cargo test` in `cli`

`relay/` and `mobile/` have their own READMEs. Pull requests also run these in CI on Linux and Windows.

## Conventions

[AGENTS.md](AGENTS.md) has the layout and the rules, and coding agents in your clone read it too. The main ones: keep macOS, Linux and Windows working, one React component per file, and bump `version` in `cli/Cargo.toml` when you change `cli/`.

## Pull requests

One change per pull request. Say what changed and why and which systems you tried, and add a screenshot for UI changes. Contributions are licensed under [MIT](LICENSE).
