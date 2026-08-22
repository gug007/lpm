# Agent Status Notifications

## Status Flow

```
User sends prompt  --> [Running]

Agent uses a tool --> [Running]

Tool requires approval (permission prompt appears) --> [Waiting]

User approves --> [Running]
User rejects  --> [Done]

Agent finishes responding --> [Done]

API error / rate limit --> [Done]

Session exits --> status cleared
```

## Display Rules

| Status | Sidebar | Terminal Tab (inactive) | Terminal Tab (active) |
|--------|---------|----------------------|---------------------|
| Running | Rainbow shimmer | Rainbow shimmer | Rainbow shimmer |
| Waiting | Amber pulse | Amber pulse | Auto-cleared |
| Done | Blue check | Blue check | Auto-cleared |

- **Waiting** and **Done** auto-clear when the user switches to that terminal tab
- **Sound notifications** play when a new Done or Waiting status appears (if enabled in Settings)

## Who Gets to Report

A pane exports its `LPM_*` identity to every process under it, and the hooks are
installed globally — so an agent that shells out to another agent (a test, a
script, a nested run) fires the same hooks under the tab's pane id. Only the
tab's own agent counts: the socket places each report in the process tree by the
`--pid` its hook carries and drops the ones a launched agent sent (`agentnest.rs`),
so a nested run rings no chime, pushes no "done", and repoints no tab's Resume.

Where that check cannot run — a remote pane, a pane inside tmux, an older hook
install with no `--pid` — the report is accepted, and the sidebar folds a tab's
agents into one line carrying a `+N` count rather than listing the tab twice.
