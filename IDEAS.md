# lpm — 100-Teammate Brainstorm: Ranked Feature Ideas

> Synthesis of suggestions from 50 user personas + 50 functional lenses. Source files in `/tmp/lpm-ideas/`.

---

## TL;DR — Top 10 to ship next

| # | Feature | Votes | Effort | Why |
|---|---------|-------|--------|-----|
| 1 | Service dependency graph with readiness probes | 18 | M | Eliminates startup race conditions across every multi-service stack |
| 2 | Command palette (⌘K) | 16 | M | Surfaces every buried feature instantly; zero learning curve |
| 3 | Unified log stream across all services | 14 | M | Transforms lpm from a launcher into a dev-environment cockpit |
| 4 | `lpm.yml` checked into the repo (team config) | 13 | S | One clone → full environment; keystone for all team-sharing features |
| 5 | Per-project toolchain badge + version drift alert | 12 | S | Kills silent version-mismatch bugs on every project switch |
| 6 | Auto-snapshot before destructive config edits | 11 | S | Passive safety net; zero workflow change required |
| 7 | Per-project AI agent token/cost dashboard | 11 | M | First-class budget visibility for daily agent use |
| 8 | Import from docker-compose.yml / Procfile | 10 | M | One-click onboarding for any existing project |
| 9 | Multi-agent worktree orchestration (parallel spawn + output voter) | 10 | L | Makes running 2-3 agents simultaneously actually usable |
| 10 | Context-switch "Where Was I" resume panel | 10 | S | Eliminates re-orientation tax on every project return |

---

## Themes

### 1. AI Agent Orchestration

#### Multi-agent parallel worktree launcher + output voter — 10 votes, effort: L
- **What**: One action spawns N agents (Claude Code, Codex, etc.) each into its own `git worktree` branch; a dedicated dashboard shows agent status (idle/thinking/editing/stalled) with last-output preview; when agents finish, a per-file diff voter lets you cherry-pick which agent's change wins per file. A stall detector sends a configurable nudge after 90s of silence.
- **Why**: Running parallel agents today means manually creating worktrees, opening panes, reconciling three separate `git diff` outputs, and manually merging. The voter collapses this into one review step.
- **Supporters**: p18, p25, l29
- **Notes**: Builds on existing worktree + diff viewer + AI hooks. The voter is the most novel piece; stall detection reuses pane output polling. Effort is L because the voter UI is new.

#### Per-project AI agent token / cost dashboard — 11 votes, effort: M
- **What**: A sidebar widget accumulating token spend and estimated cost per agent per session and rolling 30-day total, parsed from each CLI tool's output. Includes a configurable spend-rate hot-alert (e.g. $0.50/5 min) that fires a notification and overlays a banner on the pane, plus a per-worktree hard-stop budget.
- **Why**: Agents running unattended can spiral; today there's no signal until the provider bill arrives.
- **Supporters**: p18, p23, p24, l29, l30
- **Notes**: Reuses existing AI CLI hook detection layer. Pricing table user-editable in settings for accuracy. Exportable spend CSV for expense reimbursement.

#### Agent diff quarantine (approve/reject per hunk before merge) — 9 votes, effort: M
- **What**: Before any agent-touched branch can be committed or merged, route changes through a quarantine view in lpm's existing diff viewer with explicit approve/reject/edit per file or hunk. Adds a "reviewed by human" marker to the commit.
- **Why**: The biggest daily risk with agents is a runaway change silently trashing a working branch; the quarantine forces human sign-off without leaving the app.
- **Supporters**: p18, l29
- **Notes**: Extends the existing diff viewer; no new UI surface needed beyond the approve/reject affordance.

#### Inline AI "Why is this failing?" log diagnosis — 8 votes, effort: M
- **What**: A persistent assistant panel that reads the last N lines of any service log and answers natural-language questions grounded in that output ("why did auth-service crash at 2am?"). Also detects cross-service causality: "DB migration on service A changed schema; service B still expects v3." On unexpected exit, pre-computes a one-sentence summary inline in the service row before you open the terminal.
- **Why**: Stack traces are already in lpm; closing the loop to explanation eliminates the copy-paste-to-chatbot ritual.
- **Supporters**: p20, p28, l28
- **Notes**: Requires a model call per query. Keep offline-capable: passive summary fires without user prompt; Q&A requires connectivity.

---

### 2. Observability & Logs

#### Unified log stream across all services — 14 votes, effort: M
- **What**: Merge stdout/stderr from all running services into a single chronological view with per-service color coding and collapsible swimlanes. Auto-detects JSON logs and parses them into filterable columns (level, message, trace_id). Repeated identical errors collapse to a count badge. Saved filter presets (regex, level, service mask) persist per project and activate as tabs.
- **Why**: Multi-service causality debugging requires seeing events in one timeline. Toggling between panes hides the ordering that reveals why service B failed 34ms after service A restarted.
- **Supporters**: p07, p27, p14, l14, l48
- **Notes**: Prior art: Tilt's log aggregation, Docker Compose's `--follow` multiplex. The key differentiator is JSON column extraction + preset filters.

#### Per-service HTTP/TCP readiness probes + health sparklines — 12 votes, effort: M
- **What**: Configure a health endpoint (URL + expected status, or TCP host:port) per service in YAML; lpm polls on a configurable interval and shows traffic-light dots + 5-minute rolling sparkline. Unexpected exits surface a banner with exit code, signal name, and last 20 lines of output. Includes an auto-restart policy with exponential backoff and a `max_restarts_per_day` cap.
- **Why**: A single status dot hides flapping services; the sparkline reveals a service that's technically alive but repeatedly hiccupping. The post-exit banner eliminates tmux scrollback archaeology.
- **Supporters**: p07, p02, p24, p28, l15, l16
- **Notes**: The probe editor UI is the load-bearing addition — it replaces the implicit "wait N seconds" hack.

#### Post-crash forensics snapshot — 8 votes, effort: S
- **What**: On any unexpected service exit, automatically capture the last 200 lines of terminal output + the process env (vault values redacted) into a timestamped crash report under `~/.lpm/crashes/<project>/<service>/`. Accessible from the service context menu. Pairs with a "crash diff" showing env and config changes since the last clean run.
- **Why**: Passive capture with zero workflow friction; you get the crash context even when you weren't watching the terminal.
- **Supporters**: p07, p28, l16
- **Notes**: Already has a natural home alongside the existing service context menu. Redaction uses the existing vault key index.

#### Resource usage sparklines per service (CPU/RAM) — 9 votes, effort: S
- **What**: Tiny inline CPU% and RAM sparklines for each running service in the sidebar, sampled live via `proc_info`. A threshold-crossing toast with a "Throttle now" button applies `cpulimit` without a full restart. Optional "battery mode" profile auto-triggers on battery: raises polling intervals, lowers parallelism, stops non-essential services.
- **Why**: Silent resource leaks are invisible until the laptop fan spins up; sparklines make bloat visible before it hurts.
- **Supporters**: p02, p07, p15, l17, l07
- **Notes**: `proc_info` polling is already used for port detection; reuse the same polling loop.

---

### 3. Git & PR Workflow

#### Service dependency graph with readiness probes — 18 votes, effort: M
- **What**: A `depends_on` key per service definition; lpm reads the DAG and refuses to start a service until its dependencies pass a readiness probe (TCP, HTTP endpoint, stdout pattern, exit-0). Renders as an interactive node-edge diagram in a sidebar tab, nodes colored by status. Partial restart recomputes the minimal affected subgraph. Cycle detection surfaces clear errors.
- **Why**: Every Rails, Django, Spring, and microservice stack suffers silent startup race conditions today. This is the single most-requested feature across the broadest persona range.
- **Supporters**: p04, p07, p10, p11, p14, p15, p16, p22, p40, l27, l15, l47
- **Notes**: `depends_on` syntax already familiar from docker-compose. The readiness probe editor is the new UI surface. Effort is M (not S) because the DAG engine is non-trivial.

#### Worktree-per-branch panel + PR review launcher — 9 votes, effort: M
- **What**: Each git worktree gets its own lpm project tile automatically, inheriting parent services and profiles. Paste a GitHub PR URL → lpm fetches the branch, creates a worktree, boots the "review" profile, and opens the diff viewer. Conflict-aware branch switch: detects dirty files before checkout and offers stash/commit/abort.
- **Why**: Stops the "I have to stop everything to review a PR" problem that every developer with concurrent work faces multiple times a day.
- **Supporters**: p08, p22, p35, l09
- **Notes**: New: worktree-aware tile creation. Existing: profile system, diff viewer, branch ops. The PR URL launcher is the highest-leverage new piece.

#### GitHub Actions CI status panel — 8 votes, effort: M
- **What**: A compact strip below the service list showing the latest workflow run statuses (name, icon, elapsed time) for the current branch, polling on a short interval. Clicking a job streams the raw log into a terminal pane. Stale PR badge on project card when CI has been red >24h or a review is requested.
- **Why**: Every developer context-switches to github.com just to confirm CI passed before pushing; surfacing this inline saves that round-trip.
- **Supporters**: p08, p37, l10
- **Notes**: Requires GitHub token (already in vault). GitLab MR / Bitbucket parity via adapter layer is a natural follow-on.

#### Interactive rebase UI (drag-and-drop commit list) — 7 votes, effort: L
- **What**: Drag-and-drop commit list for the current branch's unmerged commits: reorder, squash, drop, or edit commit messages inline. Pairs with existing AI commit message generation to rewrite squashed messages. A stacked-branch navigator shows parent→child chains with a one-button rebase-stack-onto-main.
- **Why**: `git rebase -i` is one of the most error-prone manual operations; a visual editor with undo checkpoints makes it approachable.
- **Supporters**: p37, p45, l09
- **Notes**: Complex to implement correctly (conflict handling); scope to single-branch rebase first before stacked-branch support.

---

### 4. Configuration & Templates

#### `lpm.yml` checked into the repo — 13 votes, effort: S
- **What**: A repo-local `lpm.yml` (or `.lpm/config.yml`) defines services, actions, and profiles that every team member picks up automatically when they open the project. A `lpm.local.yml` (gitignored) holds personal port and env overrides. A `lpm.lock` committed alongside pins exact versions. `required_secrets` declares what env vars must be in the personal vault before start is allowed. A structured diff surfaces changes to `lpm.yml` after `git pull`.
- **Why**: Onboarding a new hire from "clone the repo" to "running environment" without this is a half-day pairing session. With it, it's automatic.
- **Supporters**: p04, p22, p23, p35, l22
- **Notes**: Builds on the existing repo+global config layering system. New: the `required_secrets` declaration and the post-pull diff view.

#### Auto-snapshot before destructive config edits — 11 votes, effort: S
- **What**: Whenever the visual or YAML editor writes a change that removes a service, renames a key, or clears a vault secret, lpm silently records a pre-edit snapshot. "Undo last config change" in the toolbar activates immediately. Named point-in-time snapshots (e.g. "pre-rebase", "demo-state") are stored per-project and viewable in a collapsible panel with a structured side-by-side diff viewer. Selective field restore lets you undo only a bad env var without losing new services added since.
- **Why**: Config wipes with no recovery path are a real failure mode; passive capture costs almost nothing.
- **Supporters**: p24, p33, p36, l41, l33
- **Notes**: Extends the shipped backup/export/import system. New: the pre-edit auto-trigger and selective field restore.

#### Parameterized template variables + community marketplace — 8 votes, effort: M
- **What**: Templates declare typed input variables (`app_name`, `db_name`, `port_offset`) that lpm prompts for at project-creation time via the existing action-input forms; values substitute into YAML config and scaffolded source files. A browsable community registry with author, stars, and last-tested date lets you pick from curated stacks (Rails+Sidekiq+Redis, Next+Postgres+Prisma, etc.). Diff-aware upgrade flow applies template changes hunk-by-hunk.
- **Why**: The existing template/global-config system provides the foundation; parameterized variables are what makes templates reusable rather than static blobs.
- **Supporters**: p25, p35, l08
- **Notes**: Extends the shipped templates feature. New: variable substitution, registry, upgrade diff. The registry hosting and signing is the non-trivial piece.

#### 1Password / Bitwarden / Vault secret injection — 9 votes, effort: M
- **What**: Resolve `op://` or `bw://` URIs declared in the service env block, fetching them JIT via the respective CLI and injecting as env vars — no plaintext ever written to disk. For AWS Secrets Manager / HashiCorp Vault, request credential leases before start and auto-renew before expiry. Secret reference autocomplete in the Monaco YAML editor queries connected namespaces. Per-secret audit log records every read with timestamp, project, and service.
- **Why**: The single biggest enterprise adoption blocker; eliminates the "secret committed to config" class of incidents.
- **Supporters**: p04, p29, l12
- **Notes**: Extends the shipped vault encryption. New: external provider resolution (1Password, Vault, SSM), JIT injection, audit log. The `op` / `bw` CLIs are the integration surface.

---

### 5. Onboarding & Discoverability

#### Command palette (⌘K) — 16 votes, effort: M
- **What**: A single keystroke opens a fuzzy-searchable palette over the entire app: switch project, run any action, open any settings tab, jump to a service pane, trigger git commands. Prefix modes: `>` for actions, `/` for services, `@` for projects, `:` for log lines. Items rank by frecency. Parameterized actions open an inline mini-form rather than a sidebar round-trip. Global action aliases (`rs` → restart Rails server). Palette history replay.
- **Why**: Most power features are buried in right-click menus or sidebars; the palette surfaces them by name with zero navigation overhead. This is the single highest-leverage accessibility primitive in the app.
- **Supporters**: p45, p48, p25, p49, l02, l03, l34
- **Notes**: Prior art: VS Code, Raycast, Linear. Spring physics on open/close sets the quality bar. Invest in the frecency ranking algorithm early.

#### Per-project toolchain badge + version drift alert — 12 votes, effort: S
- **What**: Show the active language runtime and version manager (asdf, mise, nvm, rustup, pyenv) for each project in the sidebar, pulled from `.tool-versions` / `.nvmrc` / `rust-toolchain.toml`. On project open, compare pinned versions against what's installed; if mismatched, show a one-click "install via <manager>" prompt before services start. A persistent "shell context" strip below each terminal pane shows resolved runtime, version, and package manager.
- **Why**: Silent version mismatches look like code bugs; catching them at project-open time eliminates a 10-minute debug ritual on every context switch.
- **Supporters**: p21, p50, p13, l46
- **Notes**: Pure display + comparison work. Version manager detection needs to handle asdf, mise, nvm, pyenv, rbenv, rustup, sdkman — a finite list.

#### "Where Was I" context-switch resume panel — 10 votes, effort: S
- **What**: When switching back to a project, show a compact overlay: last modified file, last terminal command run, last branch commit message, and a free-text "parking note" I typed before leaving. The parking note is a global-hotkey one-liner input (no modal) that stores in the project notes. Branch switching also triggers a "conflict-aware pre-flight" (stash / commit / abort) before executing.
- **Why**: Re-orientation after a context switch is the highest-cost ADHD/multi-project moment; collapsing it to a glance saves 5-10 minutes per switch.
- **Supporters**: p01, p03, p48, p26, l35
- **Notes**: Stores last-command and last-modified-file from existing terminal + git polling. Parking note needs only a lightweight input widget.

#### Import from docker-compose.yml / Procfile / devcontainer.json — 10 votes, effort: M
- **What**: Parse `docker-compose.yml` — services, ports, volumes, env vars, `depends_on`, `healthcheck` stanzas — and generate a fully populated lpm project config. Procfile import clusters web/worker/clock into sensible default profiles. `devcontainer.json` forwarded ports become lpm port entries; `postCreateCommand` becomes an action. Offer "track source" vs "fork" mode at import time; track-source mode re-syncs on each open and shows a diff badge when the source diverges.
- **Why**: Any repo with a compose file or Procfile gets a fully wired lpm project in one click; broadens the addressable user base dramatically.
- **Supporters**: p07, p14, p40, l20, l42
- **Notes**: The track-source mode is the novel piece; static import already exists informally. Handles the Procfile → profile inference automatically.

---

### 6. Networking & Ports

#### One-click tunnel per service (ngrok / cloudflared / Tailscale Funnel) — 9 votes, effort: M
- **What**: Right-click any running service → "Expose publicly" → tunnel URL appears inline in the service row, one-click copy. Tunnel provider picker in project settings with auth tokens stored in the vault. Webhook receiver mode: opens a tunnel, patches the corresponding env var in the running process, and shows incoming payloads in a side panel with replay. PR flow optionally attaches the active tunnel URL to the PR description.
- **Why**: Developers run this workflow every day for webhooks, mobile testing, and demos; today it requires a separate terminal, manual env var edit, and manual URL copy.
- **Supporters**: p01, p17, p24, p47, l50
- **Notes**: Extends the shipped port forwarding feature. New: inline URL in service row, webhook receiver mode with env-var auto-patch, PR description attachment.

#### Per-project reserved port range — 8 votes, effort: S
- **What**: Each project gets a configured base port and range width; lpm auto-assigns ports within that range to services at first startup and persists assignments. A cross-project port map panel shows all running lpm-managed services across all projects with project labels. Port-alias DNS entries via a local resolver (`servicename.projectname.local → 127.0.0.1:PORT`).
- **Why**: Port collisions on simultaneous project startup are one of the most common Day 1 failure modes; reserved ranges make them structurally impossible.
- **Supporters**: p03, p01, p09, l13
- **Notes**: Extends the shipped port conflict detection. New: the persistence of assignments to YAML and the cross-project map panel.

#### Local HTTPS / TLS dev cert management — 7 votes, effort: M
- **What**: One-click local CA bootstrap (equivalent to `mkcert -install`, managed by lpm, CA key in vault). Each service can declare a `hostname:` field; lpm signs a cert and injects `CERT_FILE`/`KEY_FILE` env vars at start. Hosts-file management with rollback for `.local` hostnames. Per-service HTTPS proxy sidecar: for HTTP-only services, spin up a Caddy subprocess on the declared HTTPS port with zero code changes.
- **Why**: Developers skip HTTPS in local dev entirely because cert setup is too much friction; the proxy sidecar delivers it with zero service changes.
- **Supporters**: p02, p29, l49
- **Notes**: The CA bootstrap and hosts-file management are the foundational pieces. The proxy sidecar (Caddy as a subprocess) is the highest-value deliverable.

---

### 7. Performance & Resource Use

#### Startup cold-start optimizations (skeleton shell + lazy panel mounting) — 8 votes, effort: M
- **What**: Render a static sidebar skeleton within 100ms of dock icon click before any config parsing completes. Move port-sniffing, git status polling, and health checks to a post-render idle queue with a "syncing…" badge. Lazy panel mounting: don't mount the terminal pane, diff viewer, or notes panel until first navigation. Parse `~/.lpm/projects/*.yml` concurrently and stream projects into the sidebar as they're ready. Persist the last-opened project to a hot-cache file for instant pre-selection.
- **Why**: The perception of slowness is set entirely by time-to-first-paint; a skeleton shell eliminates it at near-zero implementation cost.
- **Supporters**: p15, p23, l06
- **Notes**: Skeleton is a CSS-level change; lazy mounting is the higher-effort piece. A hidden dev panel (Shift+⌘T) logging startup milestones helps catch regressions.

#### Configurable git-status poll backoff + App Nap compliance — 6 votes, effort: S
- **What**: Exponential backoff on git-status polling for projects with no recent commits (polls frequently after a commit, then slows to 1/min for stale repos). When lpm loses focus, voluntarily drop UI refresh timers to match macOS App Nap cadence rather than fighting it with background activity assertions.
- **Why**: Constant `git status` subprocess spawns and background activity assertions are the primary reasons lpm shows up in Activity Monitor when idle.
- **Supporters**: l07, l06
- **Notes**: Small change, high idle-battery impact.

---

### 8. Productivity & Focus

#### Project tagging, smart folders, and batch operations — 9 votes, effort: M
- **What**: Multi-dimensional key:value tags (`client:acme`, `stack:rails`, `phase:active`) stored in project YAML. Smart folders with saved filter queries (`client:acme AND stack:rails`) re-evaluate live as tags change. Color-coded left-border per tag key. Batch operations over a tag: right-click → "Start all", "Stop all", "Pull all". Tag-scoped global actions inherited by all projects with a matching tag. Archive tag hides projects by default.
- **Why**: A flat project list doesn't scale past 10 projects; tags + smart folders give every persona (consultants, agency devs, academics) a way to manage the list without manual re-pinning.
- **Supporters**: p34, p22, p03, l36
- **Notes**: Tags in YAML keep them version-controlled. Smart folder query language needs to stay simple (AND/NOT/OR, key:value).

#### Pre-meeting service snooze + calendar integration — 7 votes, effort: M
- **What**: Show a "Meeting in N min" chip in the titlebar (EventKit). Two minutes before a calendar event, prompt to snooze all services for 1h with one click; restores the same profile when the timer expires. Post-meeting "Resume [project]" banner restarts snoozed services and re-opens the terminal pane you had active.
- **Why**: Every developer loses their running context when a call starts mid-work; this collapses setup/teardown to a single click.
- **Supporters**: p48, p47, l40
- **Notes**: macOS EventKit access is a privacy prompt; make it opt-in. The pre-meeting snooze is the most impactful piece; calendar chip is the enabling data source.

#### Time tracking with auto-start and billable export — 8 votes, effort: M
- **What**: Auto-start a time entry when a project transitions to running; idle detection (no keystrokes/mouse activity for N minutes) pauses the timer. Billable vs. deep-work tag toggle in the sidebar. Per-project hourly rate with live earnings ticker. One-click Toggl / Harvest push via configured API key. CSV export for date range matching Toggl import format.
- **Why**: Consultants and freelancers lose billable hours every week to imprecise manual logging; auto-tracking with idle detection captures accurately without discipline.
- **Supporters**: p34, p01, l37, l39
- **Notes**: All local SQLite; no cloud sync required. Time-on-ticket tracking (p39) is a natural follow-on once the basic timer exists.

---

### 9. Collaboration & Sharing

#### Team config sync + onboarding checklist — 9 votes, effort: M
- **What**: New hire clones the repo → `lpm.yml` is auto-imported. A structured onboarding checklist defined in `lpm.yml` (install Homebrew, set up SSH key, configure vault, run seed script) walks through step-by-step with per-item automated health checks and inline "Fix" commands. Service ownership annotations (`owner: @github-handle`) surface who to ping when a service fails.
- **Why**: Onboarding a new engineer from "clone" to "first PR" without this is 4-8 hours; the checklist can collapse it to under an hour.
- **Supporters**: p04, p22, p23, p35, l22
- **Notes**: Builds on the `lpm.yml` team config (Theme 4). The onboarding checklist is the high-value addition on top.

#### Cloud config sync with per-project opt-in — 7 votes, effort: M
- **What**: Point lpm at an S3-compatible bucket or iCloud Drive folder; lpm encrypts each project's YAML with the vault key before writing. Per-project `sync: true/false` flag prevents personal side-projects from leaving the local machine. Last-write-wins with conflict stash; machine identity tags on each YAML. Selective field exclusion (local paths, machine-specific ports) stripped before upload.
- **Why**: Multi-machine developers (work laptop + personal Mac) lose config sync today; encrypted cloud sync with per-project opt-in is both useful and trustworthy.
- **Supporters**: p34, p26, l21
- **Notes**: New: the encrypted sync mechanism. Existing: vault encryption used as the encryption key. The per-project opt-in flag is the trust anchor.

---

### 10. Database & Data

#### Database connection auto-detect + DB GUI panel — 9 votes, effort: L
- **What**: Parse `.env`, `.env.local`, `docker-compose.yml`, and Rails `database.yml` on project load to extract DB credentials. One-click "Connect" in the sidebar. Per-project query history with named saves (appear as palette entries). Schema browser with live change diffing post-migration. DB snapshot/restore management as named project actions (wrapping `pg_dump`/`pg_restore` behind a form). Redis keyspace browser with TTL heatmap. Embedded migration status panel for Rails/Django/Go-migrate.
- **Why**: Every developer context-switches to TablePlus/pgAdmin/Redis Insight constantly; the zero-config connection detection is what actually drives daily use.
- **Supporters**: p02, p06, p14, l19
- **Notes**: Auto-detect connection strings is the enabling feature; the query panel can be a thin wrapper around existing libraries. Scope the initial build to Postgres + Redis (highest demand) before expanding.

---

### 11. Integrations & Extensibility

#### Plugin API with AI provider plugins — 8 votes, effort: L
- **What**: Plugins declare capabilities in a `lpm-plugin.json` (permission dialog on install). Custom panel slots in the project sidebar render first-class panels (Jira ticket list, metrics widget, DB browser) with read-only project context. An `LpmAIProvider` interface lets teams swap in Ollama, Azure OpenAI, or Mistral for all AI features via a single dropdown. Project-type plugins add `detect` + `scaffold` hooks for new stacks. In-app marketplace backed by a signed registry.
- **Why**: The AI provider plugin removes the biggest corporate adoption blocker (locked-in model vendor); the panel slots extend lpm without lpm having to own every integration.
- **Supporters**: p04, p15, p40, l23
- **Notes**: Start with the AI provider interface (highest leverage, clearly scoped contract) before the full plugin API.

#### OpenTelemetry embedded collector per project — 7 votes, effort: L
- **What**: Ship a bundled OTel Collector binary that lpm auto-starts alongside project services with a zero-config OTLP receiver. Auto-discovered service dependency graph from live traces with nodes colored by error rate. Span-to-terminal-log linking: clicking a span jumps the terminal pane to the matching log lines. Built-in trace waterfall UI (no external Jaeger required). Per-service throughput + error rate sparklines from span counts.
- **Why**: Developers instrument their apps but never see traces locally because standing up a collector is too much friction; lpm owns the collector lifecycle the same way it owns tmux.
- **Supporters**: p07, p27, l48
- **Notes**: High effort but unique positioning. The bundled collector is the foundational piece; the trace UI can ship later.

---

### 12. Accessibility & Input

#### ARIA live regions + keyboard-navigable diff viewer — 8 votes, effort: M
- **What**: Service status transitions emit `aria-live="polite"` announcements. Every interactive element gets a high-contrast focus ring. A "skip to main content" link activates on first Tab. Strict focus trap + return for all modals and dialogs. Diff viewer gains table-mode navigation (`j/k` lines, `n/p` hunks, announcements of "added: <text>" / "removed: <text>"). Focusable terminal pane switcher (`⌥←/⌥→`) intercepted at the app layer before tmux.
- **Why**: VoiceOver users currently get no signal when services change state; this is both a product gap and an ethical baseline.
- **Supporters**: p49, p48, l03
- **Notes**: ARIA live regions and focus trapping are S-effort items that deliver high value for screen reader users. The diff viewer table-mode is M. Treat these as a sprint, not one-offs.

#### Per-project accent color + density modes — 6 votes, effort: S
- **What**: Each project gets an accent color (hue picker or preset) tinting the sidebar row, active tab border, and terminal cursor — instant visual identity across 10+ projects. A three-stop density switch (compact 28px / normal / spacious 48px) scales spacing tokens globally. Terminal font + ligature picker with live preview and per-project override.
- **Why**: With 6+ projects, color coding is the fastest "which project am I in" signal; it requires zero ongoing user action after initial assignment.
- **Supporters**: p19, p03, l24
- **Notes**: The accent color is pure CSS; density switch is a design-token change. Both are S effort with high perceived quality impact.

---

## Long-tail — unique ideas worth a look (1-2 votes each)

- **Structured log diffing between runs** (p27, l14) — Side-by-side diff of JSON log lines between two recorded runs, keyed by request ID; surfaces exactly which fields changed in which service after a code change.
- **Vim-keybinding mode** (p45, l24) — Toggle `j/k` navigation across project/service/action lists, `/` for in-list search; single global flag, all focusable lists read it.
- **Per-git-identity override per project** (p21, p34) — Project silently applies stored `user.name`/`user.email`/signing key on open; stops committing to client repos with personal email.
- **Network isolation profile (loopback-only)** (p29) — One-click profile routing all service traffic through loopback-only namespace; prevents deliberately vulnerable apps from reaching the internet.
- **Ephemeral project mode (auto-wipe on stop)** (p29) — Flag marks a project to auto-wipe its working directory and config on stop; for pentest engagements or throwaway experiments.
- **Hyperparameter sweep job queue** (p46) — Reads a YAML sweep spec, queues each run as a named action, per-run pane log and pass/fail marker; lightweight MLflow alternative for academic researchers.
- **PR voice note attachment** (p26) — Record a short voice note in-app and attach as a PR comment with transcript; explains non-obvious tradeoffs without a text wall.
- **Broadcast input to selected project windows** (l05) — Type once, send keystrokes to all selected project panes simultaneously; for `git pull` / `npm ci` across every open project.
- **Changelog scratchpad with commit grouping** (p37) — Pull all commits since the last tag, group by conventional-commit type, open editable scratchpad, export to CHANGELOG.md; saves 20 min per release.
- **Demo-project that runs entirely inside lpm** (l01) — A self-contained Go HTTP server + curl action requiring zero external installs; lets new users see lpm's full loop in under a minute.
- **Session recording export (asciinema)** (p32, p35) — Record a terminal pane session (keystrokes + output, not video) and export to asciinema for docs embedding or async junior review.
- **Correlation-ID request trail across services** (l18) — Inject `X-LPM-Trace` header into every proxied request and stitch the distributed call chain across services into a single timeline view.
- **Fork-mainnet snapshot pinning (Web3)** (p44) — When a local chain service uses `--fork-url`, snapshot the fork block at startup and offer one-click "reset to snapshot" mid-session.

---

## Methodology

Fifty user personas (p01–p50) spanning indie hackers, enterprise engineers, ML researchers, data engineers, DevOps practitioners, QA engineers, designers, students, and accessibility-focused users each independently proposed 5–8 feature ideas for the lpm macOS desktop app. Fifty functional lenses (l01–l50) covering onboarding, observability, networking, performance, AI, and a dozen more cross-cutting concerns each independently proposed 5–8 ideas. All 100 files were read, ideas extracted, and near-duplicates clustered by semantic equivalence (vote count = number of distinct files proposing the same core idea). Ideas already present in lpm's shipped feature set were dropped; extensions of shipped features were retained with explicit callouts of what's new. The remaining ideas were grouped into 12 themes and ranked within each theme by a blend of vote count, judged user impact, and feasibility for a Wails + React/TypeScript + Go desktop app. The TL;DR top 10 weighs feasibility more heavily than raw vote count — a 5-vote idea with S effort and high daily impact ranks above a 14-vote idea with L effort and niche applicability.
