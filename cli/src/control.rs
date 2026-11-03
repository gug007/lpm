//! Shared plumbing for the control verbs (start / stop / service / set-status).
//! Control never touches `~/.lpm` or the session daemon directly — it asks the running app
//! over the unix socket, so the app stays the single owner of run-state.

use crate::config::Ctx;
use crate::error::RunError;
use crate::statussock;
use serde_json::Value;

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
    app_reply(reply)
}

/// A reply as the app sent it, or the error its `ERROR: <msg>` stands for.
pub fn app_reply(reply: String) -> Result<String, RunError> {
    match reply.strip_prefix("ERROR:") {
        Some(rest) => Err(app_error(rest.trim())),
        None => Ok(reply),
    }
}

/// The error an app's `ERROR: <msg>` reply stands for.
fn app_error(msg: &str) -> RunError {
    if msg == "unknown command" {
        return RunError::Internal(
            "the running lpm app doesn't support this command — restart the app with a newer build"
                .into(),
        );
    }
    RunError::Internal(msg.to_string())
}

/// Read the reply of a verb that answers in JSON. Such a verb has no `OK` form,
/// so anything unparseable means the app answered with something this build
/// doesn't understand — an internal failure, not a usage error.
/// Send an agent's request (`lpm cp`, `lpm exec`) as `<verb> --request-hex=`,
/// with the tab it runs in, passing on each `PROGRESS` line, and read the JSON
/// reply. A refusal comes back as `{ ok: false, error }`: see [`agent_ok`].
pub fn agent_request(
    ctx: &Ctx,
    verb: &str,
    mut request: Value,
    on_progress: impl FnMut(&str),
) -> Result<Value, RunError> {
    require_app(ctx)?;
    let env = |k: &str| std::env::var(k).unwrap_or_default();
    request["pane"] = env("LPM_PANE_ID").into();
    request["project"] = env("LPM_PROJECT_NAME").into();
    let line = format!(
        "{verb} --request-hex={}",
        statussock::hex_encode(&request.to_string())
    );
    let reply = statussock::request_lines(&ctx.socket_path(), &line, on_progress)
        .map_err(RunError::Internal)?;
    parse_json(&app_reply(reply)?)
}

/// An agent request's reply, as an error unless it says `ok`.
pub fn agent_ok(reply: &Value, fallback: &str) -> Result<(), RunError> {
    if reply.get("ok").and_then(Value::as_bool) == Some(true) {
        return Ok(());
    }
    let error = reply
        .get("error")
        .and_then(Value::as_str)
        .unwrap_or(fallback);
    Err(RunError::Internal(error.to_string()))
}

pub fn parse_json(reply: &str) -> Result<Value, RunError> {
    serde_json::from_str(reply)
        .map_err(|e| RunError::Internal(format!("could not read the app's reply: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_non_json_reply_is_an_error_not_a_panic() {
        assert!(parse_json("OK").is_err());
    }
    use crate::statussock::net::UnixListener;
    use std::io::{BufRead, BufReader, Write};

    /// A Ctx whose socket is served by a one-shot thread replying `reply`.
    fn ctx_with_server(
        reply: &'static str,
    ) -> (tempfile::TempDir, Ctx, std::thread::JoinHandle<()>) {
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
