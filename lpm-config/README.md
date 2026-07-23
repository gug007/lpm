# lpm-config

Agent skill for [lpm](https://lpm.cx) (Local Project Manager). Lets your AI coding agent create, modify, and delete lpm project configs.

> Renamed from `lpm` to `lpm-config`. If you installed the old `lpm` skill, re-add it under the new name (`npx skills add gug007/lpm -s lpm-config`).

The repo ships two skills: **`lpm-config`** (this one — authoring project config YAML) and **`lpm-cli`** ([controlling running projects](../lpm-cli/README.md) from the command line: start/stop/logs/status/duplicate). `npx skills add gug007/lpm` lists both.

## Install

```bash
# Interactive — shows available skills
npx skills add gug007/lpm

# Or install directly
npx skills add gug007/lpm -s lpm-config

# The CLI-control skill
npx skills add gug007/lpm -s lpm-cli

# Globally (all projects)
npx skills add gug007/lpm -s lpm-config -g
```

That's it. Your agent now knows how to set up and manage lpm configs.

In Claude Code you can also trigger it explicitly as a slash command: `/lpm-config`.

## What it does

When you tell your agent things like:

- "Set up lpm for this project"
- "Add a deploy action with environment selection"
- "Add a button that tails logs in the same terminal"
- "Group the database commands together"
- "Duplicate this project for my other checkout"

The skill guides the agent to prepare correct lpm YAML and apply it through a revision-checked CLI transaction. Invalid candidates never replace the live config.

## Supported features

- **Services** — long-running processes with ports, env vars, profiles
- **Actions** — one-shot commands with confirmation, display placement, user inputs
- **Terminal actions** — actions that run in a persistent terminal pane (`type: terminal`, `reuse: true`)
- **Active-terminal actions** — actions that submit a command into the currently focused terminal (`type: command`)
- **Action groups** — nested sub-actions under a parent with inherited cwd/env
- **Action inputs** — prompt users for parameters before running (text, password, radio); `persist: true` remembers the last value chosen
- **Profiles** — named subsets of services
- **Duplicate projects** — inherit config from a parent project (`parent_name`)
- **Global config** — shared actions across all projects
- **Repo and template layers** — `.lpm.yml`, reusable templates, and sparse overrides
- **Safe config writes** — pre-save validation, revision conflict detection, and atomic replacement through `lpm config get/apply`

## Prerequisites

- [lpm](https://lpm.cx) installed: download the macOS app from [lpm.cx](https://lpm.cx)
- [tmux](https://github.com/tmux/tmux): `brew install tmux`

## Compatible agents

Works with any agent that supports the [agentskills.io](https://agentskills.io) standard:

- Claude Code
- Cursor
- GitHub Copilot
- Cline
- Windsurf
- Gemini CLI
- [and 30+ more](https://skills.sh)

Install to a specific agent with `-a`:

```bash
npx skills add gug007/lpm -s lpm-config -a cursor
```
