// Wire protocol between the app (and the `lpm` CLI) and the session daemon.
//
// One JSON object per line, one reply line per request — the same shape as the
// status socket (socketsrv.rs), and readable enough that `nc -U` is a debugger.
// The daemon owns processes and screens; it knows nothing about projects,
// profiles or ssh. Callers hand it a shell line and a directory to run it in,
// which keeps every config decision on the app side (see sessions.rs).
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Read, Write};

/// A pane to launch: the service it runs, the shell line to type into it, and
/// the directory its shell starts in.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PaneSpec {
    pub service: String,
    pub command: String,
    pub dir: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum Request {
    /// Every live session name.
    Sessions,
    /// Panes of one session, in creation order. `detail` additionally resolves
    /// each pane's foreground command, cwd and title — process lookups the log
    /// poller has no use for, so they are asked for only when something renders
    /// them.
    Panes {
        session: String,
        #[serde(default)]
        detail: bool,
    },
    /// (session, pane) for every pane the daemon owns — the port classifier
    /// walks listening pids up to these.
    AllPanes,
    /// Rendered scrollback for a pane: `history` lines of it, plus the screen.
    Capture { pane: String, history: usize },
    /// Replace a session: tear down any session of this name (reaping its
    /// process trees) and open one pane per spec.
    Start {
        session: String,
        panes: Vec<PaneSpec>,
    },
    /// Add panes to an existing session.
    Split {
        session: String,
        panes: Vec<PaneSpec>,
    },
    /// Type a line into a pane's shell (the text, then Enter).
    Send { pane: String, text: String },
    /// SIGINT the pane's foreground job, then clear its screen and scrollback.
    /// The shell stays, so the service can be started again in place.
    Interrupt { pane: String },
    KillPane { pane: String },
    /// Tear down a session. `wait` reaps the process trees before replying, so
    /// a restart can't race a still-bound port.
    KillSession { session: String, wait: bool },
    /// Tear every session down and retire the daemon. Uninstall, and nothing
    /// else — stopping the app must never end the work it started.
    Shutdown,
}

/// One pane as the daemon reports it. The fields mirror what tmux's
/// `#{pane_id}`, `#{pane_pid}`, `#{pane_current_command}`,
/// `#{pane_current_path}` and `#{pane_title}` used to supply.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct PaneInfo {
    pub id: String,
    #[serde(default)]
    pub session: String,
    #[serde(default)]
    pub service: String,
    #[serde(default)]
    pub pid: i64,
    #[serde(default)]
    pub command: String,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub title: String,
}

/// One reply. `ok` is the only field always present; each op fills in exactly
/// the payload it answers with, and a failure carries `error` instead.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Response {
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sessions: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub panes: Option<Vec<PaneInfo>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
}

impl Response {
    pub fn ok() -> Self {
        Response {
            ok: true,
            ..Default::default()
        }
    }

    pub fn error(message: impl Into<String>) -> Self {
        Response {
            ok: false,
            error: Some(message.into()),
            ..Default::default()
        }
    }

    /// Collapse a reply into the Result shape every caller wants. An `ok:false`
    /// with no message still fails — a reply we can't read is not a success.
    pub fn into_result(self) -> Result<Response, String> {
        if self.ok {
            return Ok(self);
        }
        Err(self
            .error
            .unwrap_or_else(|| "session daemon reported failure".into()))
    }
}

/// A capture can be megabytes; everything else is small. The cap is generous
/// enough for the largest capture the CLI can ask for and still bounds a peer
/// that decides to send an endless line.
const MAX_LINE: u64 = 64 * 1024 * 1024;

pub fn write_line<W: Write, T: Serialize>(w: &mut W, value: &T) -> std::io::Result<()> {
    let mut line = serde_json::to_vec(value)?;
    line.push(b'\n');
    w.write_all(&line)?;
    w.flush()
}

pub fn read_line<R: Read, T: for<'de> Deserialize<'de>>(r: &mut BufReader<R>) -> Option<T> {
    let mut line = String::new();
    let read = r.by_ref().take(MAX_LINE).read_line(&mut line).ok()?;
    if read == 0 {
        return None;
    }
    serde_json::from_str(line.trim()).ok()
}
