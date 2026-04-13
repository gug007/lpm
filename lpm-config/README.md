# lpm-config

Agent skill for [lpm](https://lpm.cx) (Local Project Manager). Lets your AI coding agent create, modify, and delete lpm project configs.

## Install

```bash
# Into your project
npx skills add gug007/lpm -s lpm-config

# Globally (all projects)
npx skills add gug007/lpm -s lpm-config -g
```

That's it. Your agent now knows how to set up and manage lpm configs.

## What it does

When you tell your agent things like:

- "Set up lpm for this project"
- "Add a deploy action with environment selection"
- "Add a button that tails logs in the same terminal"
- "Group the database commands together"
- "Duplicate this project for my other checkout"

The skill guides the agent to write correct lpm YAML configs at `~/.lpm/projects/<name>.yml`, asking smart follow-up questions (button or menu? reuse terminal? needs confirmation?).

## Supported features

- **Services** — long-running processes with ports, env vars, profiles
- **Actions** — one-shot commands with confirmation, display placement, user inputs
- **Terminal actions** — actions that run in a persistent terminal pane (`type: terminal`, `reuse: true`)
- **Action groups** — nested sub-actions under a parent with inherited cwd/env
- **Action inputs** — prompt users for parameters before running (text, password, radio)
- **Terminals** — interactive shells (database consoles, REPLs)
- **Profiles** — named subsets of services
- **Duplicate projects** — inherit config from a parent project (`parent_name`)
- **Global config** — shared actions/terminals across all projects

## Prerequisites

- [lpm](https://lpm.cx) installed: `curl -fsSL https://raw.githubusercontent.com/gug007/lpm/main/install.sh | bash`
- [tmux](https://github.com/tmux/tmux): `brew install tmux` (macOS) or `sudo apt install tmux` (Linux)

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
