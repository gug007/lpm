---
name: lpm-memory
version: 1.5.0
argument-hint: "[session-id]"
description: "Shared project memory for AI coding agents: save or recall work-session logs in `~/.lpm/memory/<project>/<session>.md` so another agent CLI (Claude Code, Codex, Gemini) or a future session can continue the work by session name. Invoke with a session id (e.g. `/lpm-memory auth-refactor`) to continue that session. Use when the user asks to remember or save the session or progress, hand off work, record what was done, or recall/continue/resume/join a named work session. This is per-project memory shared between agent CLIs — distinct from any CLI's own built-in memory."
---

Project memory lives in `~/.lpm/memory/<project>/<session>.md`, shared by every agent CLI. `<project>` is the lpm project name — `$LPM_PROJECT_NAME` when set, else the working directory's folder name. `<session>` is a kebab-case slug for one workstream (e.g. `auth-refactor`); each file is both the current handoff state and the work history.

Invocation:

- `/lpm-memory <session-id>` — Recall that session and continue it. Unknown id: offer close matches, or create it.
- No argument — Remember work already done in this conversation; at the very start of one, pick or create the session instead.
- Either way, keep the memory current from then on without being asked: append a timeline entry and refresh `## Current state` after each milestone and when the user wraps up.

## Remember (save / hand off)

1. Session slug: the user's name for it, else the one existing file that matches the work, else derive one and confirm it before writing.
2. Create the folder if missing. Seed a new file with:

   ```markdown
   # <Work title>

   ## Goal
   <one or two lines>

   ## Current state
   <where things stand, next steps, blockers>

   ## Timeline
   ```

3. Re-read the file right before writing — another agent may have saved meanwhile. If it changed since you last read it, keep their changes: append your timeline entry after theirs and fold both realities into `## Current state`.
4. Rewrite `## Current state` to match reality now.
5. Append a new entry at the end of `## Timeline`. The timeline is strictly append-only: never edit or delete an existing entry — not even your own from earlier in the same conversation. Each entry covers only what happened since the previous save:

   ```markdown
   ### <YYYY-MM-DD HH:MM> — <agent>
   - Done: what shipped or changed, in outcome terms
   - Decided: choices made and why, including approaches tried and dropped
   - Learned: surprises and gotchas the next agent must know
   - Open: unresolved questions / blockers
   - Next: unfinished work / immediate next step
   ```

   `<agent>` = your CLI name (claude, codex, ...), local time. Drop empty lines; keep it brief.

6. Compaction — the one exception to append-only: when the timeline exceeds ten entries, condense the oldest into a single digest entry `### Archived through <YYYY-MM-DD>` kept first in `## Timeline`; keep the newest five entries verbatim. Condense only — preserve every decision and gotcha that still matters, never reinterpret, and fold into the existing digest on later compactions.

## Recall (continue / join)

1. List `~/.lpm/memory/<project>/*.md`; read the named session, or show the list (name, last modified, goal line) and ask which one.
2. `## Current state` is the source of truth; the newest timeline entries carry the freshest detail. Read those first — reach for older entries and the archive digest only when the work needs that history.
3. State the next step you inferred, confirm direction, then continue — and Remember at the next stopping point.
