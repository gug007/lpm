# lpm-cli

Agent skill for the [lpm](https://lpm.cx) command-line tool. Lets your AI coding agent control running lpm projects from the terminal — start/stop projects and services, restart a dev server, read service logs, check agent status, wait for a port, and duplicate a project into parallel copies for multi-agent work.

## Install

```bash
# Interactive — shows available skills
npx skills add gug007/lpm

# Or install this skill directly
npx skills add gug007/lpm -s lpm-cli

# Globally (all projects)
npx skills add gug007/lpm -s lpm-cli -g
```

The `lpm` command itself is installed from the lpm app's Settings; this skill teaches your agent how to use it.

In Claude Code you can also trigger it explicitly as a slash command: `/lpm-cli`.

## What it does

Inside an lpm terminal (`LPM_PROJECT_NAME` is set) or a project directory, the skill lets your agent run the `lpm` CLI to start/stop services, tail logs, check live agent status, wait for readiness, and fan work out across duplicate copies — with token-lean output by default.

For creating or editing lpm project YAML configs, use the companion [`lpm-config`](../lpm-config/README.md) skill.
