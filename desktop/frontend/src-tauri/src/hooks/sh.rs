// The POSIX-sh form of an lpm hook: one line an agent runs on each event, which
// stages a socket frame and hands it to a delivery — backgrounded, unless the
// caller waits for it.
use super::MARKER;
use crate::agentkind::AgentKind;

/// Who is reporting, in the only terms the socket can check: the pid the hook
/// ran under. A pane's whole process tree inherits its LPM_* identity and the
/// hooks are installed for every agent on the machine, so an agent the tab's
/// agent launched reports under the tab's pane id and would show up as a second
/// agent on it. The pid places the reporter in the tree, where the two are
/// distinguishable (agentnest.rs). `$PPID` in the hook shell is the agent — or,
/// if the harness wraps its hooks in a shell, something under it, which lands in
/// the same place.
///
/// Deliberately NOT `--pid`, which the socket stores as `StatusEntry.agent_pid`
/// for a liveness sweep that reaps entries whose process is gone (status.rs).
/// That sweep judges pids against THIS machine's process table, so a remote
/// pane's reporter — a pid in the SSH host's namespace — would read as long dead
/// and take the badge with it; and a wrapper shell's pid dies seconds after the
/// hook that ran in it. Placing a reporter in a tree and watching an agent live
/// are different questions about different processes.
const REPORTER_PID_OPT: &str = " --reporter-pid=$PPID";

/// `$pq`: the project name ready to sit between single quotes in a frame, the
/// way the socket splits it — an apostrophe in the name (`Bob's app`) otherwise
/// ended the quote early and the whole frame failed to parse. Runs after the
/// env recovery, which may fill in the name, and costs nothing for a plain one.
const PROJECT_ARG: &str =
    r#"pq=$LPM_PROJECT_NAME; case "$pq" in *\'*) pq=$(printf '%s' "$pq" | sed "s/'/'\"'\"'/g");; esac;"#;

/// Reads the payload's own `session_id`. Agents serialize it as the payload's
/// first key, so the match is anchored there: a tool's input or result can hold a
/// `session_id` key of its own, and an unanchored match took that one — filing
/// the turn's Running under a key its Stop never ends.
pub(super) const SID_SED: &str = r#"sed -n 's/^[^"]*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'"#;

/// One hook line. Each part is sh that ends in `;`, empty when not needed.
#[derive(Default)]
pub(super) struct Hook<'a> {
    /// Runs first, before the env is recovered: reads or drains the payload, or
    /// exits when the event is not one to report.
    pub read: &'a str,
    /// Runs once the env is recovered and `$pq` set, ahead of staging the frame.
    pub prep: &'a str,
    /// The socket frame; the reporter pid is appended to it.
    pub frame: &'a str,
    /// A test delivery also needs, checked ahead of the socket's.
    pub only_if: &'a str,
    /// A test delivery also needs, checked after the socket's.
    pub and_if: &'a str,
    /// Deliver before the line returns, for a caller that runs its hooks one at
    /// a time: the app takes each connection on a thread of its own, so frames
    /// sent a moment apart can otherwise land in either order.
    pub waits: bool,
}

impl Hook<'_> {
    /// The socket write; only runs when the socket exists. Ends with the
    /// `# lpm-hook` marker so installs are idempotent. A recovery preamble first
    /// restores LPM_* from the tmux global env / a socket glob (agents in a
    /// pre-existing tmux server otherwise see none), then the message is staged in
    /// `m` so the portable nc/python3/perl fallback chain can regenerate it. The
    /// gate also requires a known project and pane so a recovered-socket-only case
    /// never sends `set_status ''`.
    ///
    /// The line ends on `:` because its status is what the agent judges the hook
    /// by: zsh backgrounds only the last command of `a && b &`, so a gate that
    /// holds the frame back would otherwise exit 1 — which Codex, running hooks in
    /// the user's shell, reports as a failed hook.
    pub(super) fn line(&self) -> String {
        let recover = crate::sockdeliver::env_recover_group();
        let deliver = crate::sockdeliver::delivery_group();
        let read = spaced(self.read);
        let prep = spaced(self.prep);
        let frame = self.frame;
        let only_if = gated(self.only_if);
        let and_if = gated(self.and_if);
        let end = if self.waits { ";" } else { " &" };
        format!(
            "{read}{recover} {PROJECT_ARG} {prep}m=\"{frame}{REPORTER_PID_OPT}\"; {{ {only_if}[ -n \"$LPM_SOCKET_PATH\" ] && [ -S \"$LPM_SOCKET_PATH\" ] && [ -n \"$LPM_PROJECT_NAME\" ] && [ -n \"$LPM_PANE_ID\" ] && {and_if}{deliver}{end} }} >/dev/null 2>&1; :; {MARKER}"
        )
    }
}

fn spaced(sh: &str) -> String {
    if sh.is_empty() {
        String::new()
    } else {
        format!("{sh} ")
    }
}

fn gated(test: &str) -> String {
    if test.is_empty() {
        String::new()
    } else {
        format!("{test} && ")
    }
}

/// A hook that reports `frame` whatever the payload says.
///
/// It ignores the JSON payload, but must still drain it: the agent writes it to
/// the hook's stdin, and a payload larger than the pipe buffer (a tool result,
/// say) leaves the agent blocked on a write that fails the moment the hook exits
/// — Codex surfaces that as `failed to write hook stdin: Broken pipe` in the
/// session UI. The `[ -t 0 ]` guard keeps an interactively-run hook from hanging
/// on a terminal stdin.
pub(super) fn send_cmd(frame: &str) -> String {
    Hook {
        read: "[ -t 0 ] || cat >/dev/null 2>&1;",
        frame,
        ..Default::default()
    }
    .line()
}

/// Captures the payload's `session_id` into `$sid`, so a frame can key the
/// status by the agent's own session — `<prefix>${sid:-$LPM_PANE_ID}`. Keying by
/// session id means one session's Running->Done/Error/clear shares a key even if
/// the resolved pane id changes mid-session, and two sessions visible in one tab
/// never clobber each other; `--pane=$LPM_PANE_ID` still carries the (now
/// correctly resolved) tab attribution. `${sid:-$LPM_PANE_ID}` expands at staging
/// time — after the id is captured — and keeps a defensive pane-keyed path if a
/// payload ever lacks session_id. stdin is consumed synchronously by `sed` BEFORE
/// the backgrounded delivery, which reads only the staged `$m`: a failed or
/// backgrounded reader must never re-read the already-drained stdin.
pub(super) fn sid_prep() -> String {
    format!("sid=$({SID_SED} | head -n1);")
}

/// The frames for lpm's usual states under the key `kind` reports by:
/// `<prefix>${sid:-$LPM_PANE_ID}` for an agent keyed by its session (the hook
/// runs `sid_prep` first), `<prefix>$LPM_PANE_ID` for one keyed by its pane.
pub(super) struct Frames {
    kind: AgentKind,
    key: String,
}

impl Frames {
    pub(super) fn of(kind: AgentKind) -> Self {
        let id = if kind.keyed_by_session() {
            "${sid:-$LPM_PANE_ID}"
        } else {
            "$LPM_PANE_ID"
        };
        Frames {
            kind,
            key: format!("{}{id}", kind.key_prefix()),
        }
    }

    pub(super) fn running(&self) -> String {
        let (icon, color) = self.kind.running_look();
        self.set(&format!("Running --icon={icon} --color={color}"))
    }

    pub(super) fn waiting(&self) -> String {
        self.set("Waiting --icon=bell --color=#f59e0b")
    }

    /// A Waiting only the agent's own hooks end: keys typed into the pane are
    /// left alone (StatusEntry::held).
    pub(super) fn held_waiting(&self) -> String {
        format!("{} --hold", self.waiting())
    }

    pub(super) fn done(&self) -> String {
        self.set("Done --icon=checkmark --color=#4ade80")
    }

    pub(super) fn error(&self) -> String {
        self.set("Error --icon=warning --color=#ef4444")
    }

    /// Takes back a Running or Waiting the agent can no longer end, leaving a
    /// finish the user hasn't seen.
    pub(super) fn clear_live(&self) -> String {
        format!("clear_status '$pq' {} --live", self.key)
    }

    fn set(&self, state: &str) -> String {
        format!("set_status '$pq' {} {state} --pane=$LPM_PANE_ID", self.key)
    }
}
