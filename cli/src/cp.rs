//! `lpm cp [--force] [--json] <SRC> <DST>` — copy files between this computer
//! and one it connects to, one side written `NAME:PATH`. The app reads both
//! ends (from this folder), checks what that computer lets this one's agents
//! copy, and asks the person in lpm before anything moves.

use crate::config::Ctx;
use crate::control;
use crate::error::RunError;
use crate::statussock;
use crate::util::{files_count, print_json};
use serde_json::{json, Value};

fn size(bytes: u64) -> String {
    const UNITS: [&str; 4] = ["KB", "MB", "GB", "TB"];
    if bytes < 1024 {
        return format!("{bytes} B");
    }
    let mut value = bytes as f64 / 1024.0;
    let mut unit = 0;
    while value >= 1024.0 && unit + 1 < UNITS.len() {
        value /= 1024.0;
        unit += 1;
    }
    format!("{value:.1} {}", UNITS[unit])
}

/// What the app says while the copy goes, said on stderr.
struct Progress {
    quiet: bool,
    shown_pct: Option<u64>,
}

impl Progress {
    fn line(&mut self, payload: &str) {
        if self.quiet {
            return;
        }
        if payload == "waiting" {
            eprintln!("Waiting for you to allow the copy in lpm…");
            return;
        }
        let mut words = payload.split_whitespace().map(|w| w.parse::<u64>().unwrap_or(0));
        let (sent, total) = (words.next().unwrap_or(0), words.next().unwrap_or(0));
        if total < 8 * 1024 * 1024 {
            return;
        }
        let pct = sent * 100 / total;
        if self.shown_pct.is_none_or(|shown| pct >= shown + 10) {
            self.shown_pct = Some(pct);
            eprintln!("  {pct}% of {}", size(total));
        }
    }
}

pub fn run(ctx: &Ctx, src: &str, dst: &str, force: bool, as_json: bool) -> Result<(), RunError> {
    control::require_app(ctx)?;
    let cwd = std::env::current_dir().map_err(|e| RunError::Internal(e.to_string()))?;
    let env = |k: &str| std::env::var(k).unwrap_or_default();
    let request = json!({
        "src": src,
        "dst": dst,
        "force": force,
        "cwd": cwd,
        "pane": env("LPM_PANE_ID"),
        "project": env("LPM_PROJECT_NAME"),
    });
    let line = format!(
        "agent_cp --request-hex={}",
        statussock::hex_encode(&request.to_string())
    );
    let mut progress = Progress {
        quiet: as_json,
        shown_pct: None,
    };
    let reply = statussock::request_lines(&ctx.socket_path(), &line, |p| progress.line(p))
        .map_err(RunError::Internal)?;
    let value = control::parse_json(&control::app_reply(reply)?)?;
    if as_json {
        print_json(&value);
    }
    if value.get("ok").and_then(Value::as_bool) != Some(true) {
        let error = value
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("the copy failed");
        return Err(RunError::Internal(error.to_string()));
    }
    if !as_json {
        println!("{}", summary(&value));
    }
    Ok(())
}

fn summary(v: &Value) -> String {
    let n = |k: &str| v.get(k).and_then(Value::as_u64).unwrap_or(0);
    let text = |k: &str| v.get(k).and_then(Value::as_str).unwrap_or_default();
    let replaced = match n("replaced") {
        0 => String::new(),
        r => format!(", replacing {}", files_count(r)),
    };
    format!(
        "Copied {} ({}) from {} to {}{replaced}.",
        files_count(n("files")),
        size(n("bytes")),
        text("from"),
        text("to")
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_summary_says_what_moved_and_where() {
        let v = json!({ "ok": true, "files": 1, "bytes": 2150, "from": "mini:/k/a.jks",
            "to": "/Users/me/keys/a.jks", "replaced": 0 });
        assert_eq!(
            summary(&v),
            "Copied 1 file (2.1 KB) from mini:/k/a.jks to /Users/me/keys/a.jks."
        );
        let v = json!({ "files": 3, "bytes": 10, "from": "a", "to": "b", "replaced": 2 });
        assert_eq!(summary(&v), "Copied 3 files (10 B) from a to b, replacing 2 files.");
    }

    #[test]
    fn sizes_read_in_the_nearest_unit() {
        assert_eq!(size(0), "0 B");
        assert_eq!(size(1536), "1.5 KB");
        assert_eq!(size(5 * 1024 * 1024), "5.0 MB");
    }
}
