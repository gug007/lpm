# Agent Guide — lpm

## Overview

lpm starts, stops, duplicates, and switches between local dev projects, with a built-in terminal for running AI coding agents alongside services. The repo ships a macOS desktop app (Tauri 2 — React/TypeScript frontend, Rust backend), and a Next.js marketing site under `website/`

## Conventions

- Use clean code and best practices
- Do not add comments. Only comment when the purpose or reasoning is unclear from the code itself
- macOS-only: don't add Windows/Linux code paths
- For each react component use separate file
- Bump `version` in `cli/Cargo.toml` whenever you change the CLI (`cli/`) — patch for fixes, minor for new commands/flags. It's the version `lpm --version` reports on local builds, so bumping it keeps a stale installed binary detectable
- Never commit or push any changes
