---
name: lpm
version: 1.2.0
description: "Shortcut that loads the two lpm skills — `lpm-cli` (control projects: start/stop services, logs, agent status, duplicate into standalone copies or create Git worktrees) and `lpm-config` (create/edit project YAML configs). Use when the user types /lpm or asks about lpm without a clearly scoped task; when the task clearly fits one skill, invoke `lpm-cli` or `lpm-config` directly instead."
---

This skill is a shortcut for the two lpm skills, installed as sibling directories of this skill's folder. Read the one that matches the task and follow it; read both when the task spans them or is unclear:

- `../lpm-cli/SKILL.md` — controlling projects via the `lpm` command: start/stop projects and services, read service logs, check AI-agent status, wait for readiness, duplicate a project into standalone copies or create linked Git worktrees, queue work in app terminals.
- `../lpm-config/SKILL.md` — creating, modifying, and deleting lpm project configs and shared layers. Follow its routing instructions to load only the relevant reference files.
