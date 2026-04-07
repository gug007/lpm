# Agent Status Notifications

## Status Flow

```
User sends prompt  --> [Running]

Agent uses a tool --> [Running]

Tool requires approval (permission prompt appears) --> [Waiting]

User approves --> [Running]
User rejects  --> Agent continues (PreToolUse) or gives up (Stop --> [Done])

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
