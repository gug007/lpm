//! Shared plumbing for the control verbs (start / stop / service / set-status).
//! Control never touches `~/.lpm` or tmux directly — it asks the running app
//! over the unix socket, so the app stays the single owner of run-state.

use crate::config::Ctx;
use crate::error::RunError;
use crate::statussock;

/// Require the app to be reachable. A control verb is a no-op without it, so a
/// missing app is a usage error (exit 2) rather than an internal failure.
pub fn require_app(ctx: &Ctx) -> Result<(), RunError> {
    if statussock::ping(&ctx.socket_path()) {
        Ok(())
    } else {
        Err(RunError::NotFound(
            "lpm app is not running — start it to control projects".into(),
        ))
    }
}

/// Send one command line to the app and interpret the reply. A non-`ERROR`
/// reply (e.g. `OK`) is returned verbatim. An `ERROR:` reply is an app-side
/// failure (exit 1); `unknown command` is surfaced as an upgrade hint, since it
/// means the running app predates this verb.
pub fn send_command(ctx: &Ctx, line: &str) -> Result<String, RunError> {
    let reply = statussock::request(&ctx.socket_path(), line).map_err(RunError::Internal)?;
    if let Some(rest) = reply.strip_prefix("ERROR:") {
        let msg = rest.trim();
        if msg == "unknown command" {
            return Err(RunError::Internal(
                "the running lpm app doesn't support this command — restart the app with a newer build".into(),
            ));
        }
        return Err(RunError::Internal(msg.to_string()));
    }
    Ok(reply)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader, Write};
    use std::os::unix::net::UnixListener;

    /// A Ctx whose socket is served by a one-shot thread replying `reply`.
    fn ctx_with_server(reply: &'static str) -> (tempfile::TempDir, Ctx, std::thread::JoinHandle<()>) {
        let dir = tempfile::tempdir().unwrap();
        let ctx = Ctx {
            lpm_dir: dir.path().to_path_buf(),
            socket_override: None,
        };
        let listener = UnixListener::bind(ctx.socket_path()).unwrap();
        let handle = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            let mut line = String::new();
            reader.read_line(&mut line).unwrap();
            writeln!(stream, "{reply}").unwrap();
        });
        (dir, ctx, handle)
    }

    #[test]
    fn ok_reply_is_returned() {
        let (_d, ctx, h) = ctx_with_server("OK");
        assert_eq!(send_command(&ctx, "stop_project 'x'").unwrap(), "OK");
        h.join().unwrap();
    }

    #[test]
    fn unknown_command_becomes_upgrade_hint() {
        let (_d, ctx, h) = ctx_with_server("ERROR: unknown command");
        let err = send_command(&ctx, "start_project 'x'").unwrap_err();
        assert!(err.message().contains("restart the app with a newer build"));
        assert_eq!(err.code(), 1);
        h.join().unwrap();
    }

    #[test]
    fn generic_error_passes_through() {
        let (_d, ctx, h) = ctx_with_server("ERROR: no services to start for profile \"ghost\"");
        let err = send_command(&ctx, "start_project 'x' --profile=ghost").unwrap_err();
        assert!(err.message().contains("ghost"));
        assert_eq!(err.code(), 1);
        h.join().unwrap();
    }
}
