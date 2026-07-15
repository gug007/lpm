# lpm-cli

Agent skill for the [lpm](https://lpm.cx) command-line tool. Lets your AI coding agent control running lpm projects from the terminal, resolve config targets, validate YAML, start/stop projects and services, read logs, check agent status, wait for a port, and duplicate projects for parallel work.

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

The skill uses `LPM_PROJECT_NAME` or the current directory to select a project after an lpm operation is requested. It can start/stop services, tail logs, check live agent status, wait for readiness, validate config files, and fan work out across duplicate copies with token-lean output by default.

For creating or editing lpm project YAML configs, use the companion [`lpm-config`](../lpm-config/README.md) skill.
