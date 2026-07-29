// Portable delivery of a one-line status message to the lpm status socket at
// $LPM_SOCKET_PATH. `nc -U` (AF_UNIX) is not universal — netcat-traditional on
// some Linux hosts lacks `-U`, so the send failed silently there. The generated
// shell therefore tries `nc -U`, then python3, then perl, each connecting to the
// same stream socket; the message lands as long as one of them exists.
//
// The caller stages the message in shell var `m` first. The fallbacks re-read it
// from `$m` (never from stdin, which a failed `nc` may already have drained) and
// receive it through the environment (LPM_MSG/LPM_SOCK) so the payload is never
// interpolated into the python/perl source — the only quoting-safe option.

const DELIVER_PY: &str = r#"import os,socket
s=socket.socket(socket.AF_UNIX)
s.settimeout(1)
s.connect(os.environ["LPM_SOCK"])
s.sendall((os.environ["LPM_MSG"]+chr(10)).encode())
try:
 s.recv(32)
except Exception:
 pass"#;

const DELIVER_PL: &str =
    "my $s=IO::Socket::UNIX->new(Peer=>$ENV{LPM_SOCK}) or exit 1; print $s $ENV{LPM_MSG}.chr(10); close $s;";

/// A brace group that delivers `$m` to `$LPM_SOCKET_PATH`, trying nc → python3 →
/// perl in order and stopping at the first success. Returned already wrapped in
/// `{ …; }` so a caller can guard it as `<tests> && <group>` without the `||`
/// fallbacks slipping past the guard when a test fails.
pub fn delivery_group() -> String {
    let mut s = String::from(
        r#"{ printf '%s\n' "$m" | nc -w1 -U "$LPM_SOCKET_PATH" || LPM_MSG="$m" LPM_SOCK="$LPM_SOCKET_PATH" python3 -c '"#,
    );
    s.push_str(DELIVER_PY);
    s.push_str(r#"' || LPM_MSG="$m" LPM_SOCK="$LPM_SOCKET_PATH" perl -MIO::Socket::UNIX -e '"#);
    s.push_str(DELIVER_PL);
    s.push_str("'; }");
    s
}

// The LPM_* identity vars, resolved together from the tmux context, and the shell
// temporaries that hold each var's INHERITED (process-env) value while the tmux
// block rebuilds the vars strictly by priority. The held names are distinct from
// the block's own scratch (`v`, `cp`, `ce`) and from the socket-glob loop var `s`.
const RECOVER_VARS: [&str; 3] = ["LPM_PANE_ID", "LPM_PROJECT_NAME", "LPM_SOCKET_PATH"];
const RECOVER_HELD: [&str; 3] = ["ipane", "iproj", "isock"];

/// One lazy `tmux showenv` fallback for `var`, filling it only when still empty.
/// `showenv` prints `NAME=value` when set or the bare `-NAME` marker when the var
/// is explicitly unset in that scope; the `case` accepts ONLY the `NAME=value`
/// form, so `-NAME` (and an error's empty output) is never taken as a value — the
/// bare `${v#*=}` idiom would otherwise pass `-NAME` straight through. `target` is
/// `-t "$TMUX_PANE"` (session env) or `-g` (server global).
fn tmux_showenv_fallback(var: &str, target: &str) -> String {
    format!(
        "[ -n \"${var}\" ] || {{ v=$(tmux showenv {target} {var} 2>/dev/null); case \"$v\" in {var}=*) {var}=${{v#*=}};; esac; }}; "
    )
}

/// Extract `var` from the attached client's environ dump staged in `$ce` (one
/// `NAME=value` per line). Fills the (already-cleared) var when found; the first
/// `=` splits name from value, so values with `=` survive.
fn tmux_client_extract(var: &str) -> String {
    format!("v=$(printf \"%s\\n\" \"$ce\" | grep -e \"^{var}=\" | head -n1); [ -n \"$v\" ] && {var}=${{v#*=}}; ")
}

/// Resolve the LPM_* vars a hook needs from the tmux context, then fall back to a
/// socket glob. Without this an agent inside a tmux server that predates (or is
/// shared across) the lpm terminals misattributes its status: panes inherit the
/// SERVER's env — one global LPM_PANE_ID slot overwritten by each new tab — so the
/// hook reports under the wrong tab's id, or against a dead socket.
///
/// Emitted as a single-line, single-quote-free POSIX-sh preamble so it stays safe
/// once the whole hook command is embedded in JSON and again in `sh` single quotes
/// on install (see `env_recover_has_no_single_quotes`). The caller must place it
/// BEFORE it stages `m` (which interpolates the vars).
///
/// WHENEVER we are inside tmux — regardless of socket liveness, because the
/// forwarded socket path is host-stable and live yet the pane id is still wrong —
/// each var is resolved in strict priority, each source filling only a var still
/// empty (so the highest-priority non-empty value wins and lower sources are
/// queried lazily):
///  1. The attached client's process env — ground truth for "which lpm tab is
///     displaying this session": the tmux client runs inside that tab's (remote)
///     login shell and carries its exact LPM_* exports. Linux-only (`/proc`);
///     absent on macOS, where we fall through. NUL-separated so values with spaces
///     survive.
///  2. The session env (`showenv -t`), correct once `update-environment` has
///     copied the attaching client's values in (see statusfwd.rs).
///  3. The inherited process env, snapshotted before the cascade clears the vars.
///  4. The server global env (`showenv -g`) — last resort, today's behavior.
/// When NOT inside tmux the tmux block is skipped entirely, leaving only the
/// socket glob — behavior identical to before.
///
/// Finally, if the resolved socket is still not live, glob for one: the forwarded
/// remote socket first (`status-*.sock`), then the local Mac socket (`lpm.sock`).
/// An unmatched glob stays a literal pattern and fails `-S`; the remote-relay
/// socket (`lpm-remote.sock`) is deliberately never a candidate.
pub fn env_recover_group() -> String {
    let mut s = String::new();
    s.push_str("if [ -n \"$TMUX\" ]; then ");
    // Snapshot the inherited values, then clear so the priority cascade rebuilds.
    for (var, held) in RECOVER_VARS.iter().copied().zip(RECOVER_HELD) {
        s.push_str(&format!("{held}=${var}; "));
    }
    for var in RECOVER_VARS {
        s.push_str(&format!("{var}=; "));
    }
    // Priority 1 — the attached client's process env.
    s.push_str(
        "cp=$(tmux list-clients -t \"$TMUX_PANE\" -F \"#{client_pid}\" 2>/dev/null | head -n1); ",
    );
    s.push_str("if [ -n \"$cp\" ] && [ -r \"/proc/$cp/environ\" ]; then ");
    s.push_str("ce=$(tr \"\\000\" \"\\n\" < \"/proc/$cp/environ\" 2>/dev/null); ");
    for var in RECOVER_VARS {
        s.push_str(&tmux_client_extract(var));
    }
    s.push_str("fi; ");
    // Priority 2 — the session env (update-environment copies).
    for var in RECOVER_VARS {
        s.push_str(&tmux_showenv_fallback(var, "-t \"$TMUX_PANE\""));
    }
    // Priority 3 — the inherited process env snapshotted above.
    for (var, held) in RECOVER_VARS.iter().copied().zip(RECOVER_HELD) {
        s.push_str(&format!("[ -n \"${var}\" ] || {var}=${held}; "));
    }
    // Priority 4 — the server global env.
    for var in RECOVER_VARS {
        s.push_str(&tmux_showenv_fallback(var, "-g"));
    }
    s.push_str("fi; ");
    // Final socket fallback, in or out of tmux.
    s.push_str("if [ ! -S \"$LPM_SOCKET_PATH\" ]; then for s in \"$HOME\"/.lpm/fwd/status-*.sock \"$HOME\"/.lpm/lpm.sock; do [ -S \"$s\" ] && LPM_SOCKET_PATH=$s && break; done; fi;");
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tries_nc_then_python_then_perl_in_order() {
        let g = delivery_group();
        let nc = g.find("nc -w1 -U").expect("nc attempt");
        let py = g.find("python3 -c").expect("python3 fallback");
        let pl = g.find("perl -MIO::Socket::UNIX").expect("perl fallback");
        assert!(nc < py && py < pl, "must fall back nc -> python3 -> perl");
        // Each fallback is reached only when the prior one fails.
        assert_eq!(g.matches("||").count(), 2, "two `||` fallbacks");
    }

    #[test]
    fn passes_payload_via_env_never_interpolated() {
        let g = delivery_group();
        assert!(g.contains("LPM_MSG=\"$m\" LPM_SOCK=\"$LPM_SOCKET_PATH\" python3"));
        assert!(g.contains("LPM_MSG=\"$m\" LPM_SOCK=\"$LPM_SOCKET_PATH\" perl"));
        // The interpreters read the message from the environment, not from an
        // inlined copy of the payload.
        assert!(DELIVER_PY.contains("os.environ[\"LPM_MSG\"]"));
        assert!(DELIVER_PL.contains("$ENV{LPM_MSG}"));
        assert!(
            !DELIVER_PY.contains("$m"),
            "payload not interpolated into python"
        );
        assert!(
            !DELIVER_PL.contains("$m"),
            "payload not interpolated into perl"
        );
    }

    #[test]
    fn nc_reads_from_staged_variable_not_a_pipe() {
        let g = delivery_group();
        // The primary send regenerates the message from `$m`; a failed nc can have
        // consumed stdin, so no fallback may read from a pipe/stdin.
        assert!(g.contains("printf '%s\\n' \"$m\" | nc -w1 -U \"$LPM_SOCKET_PATH\""));
    }

    #[test]
    fn interpreter_code_is_single_quote_safe() {
        // Both one-liners are wrapped in sh single quotes, so neither may contain a
        // single quote or the sh quoting breaks.
        assert!(!DELIVER_PY.contains('\''));
        assert!(!DELIVER_PL.contains('\''));
    }

    #[test]
    fn is_a_guardable_brace_group() {
        let g = delivery_group();
        assert!(g.starts_with("{ "), "opens a brace group");
        assert!(g.ends_with("; }"), "closes the brace group");
    }

    #[test]
    fn env_recover_resolves_in_tmux_regardless_of_socket_liveness() {
        let r = env_recover_group();
        // The tmux resolution runs whenever we are in tmux — NOT only on a dead
        // socket (the whole point: a live host-stable socket still carries a wrong
        // inherited pane id).
        assert!(r.contains("if [ -n \"$TMUX\" ]; then"), "{r}");
        assert!(
            !r.contains("[ ! -S \"$LPM_SOCKET_PATH\" ] && [ -n \"$TMUX\" ]"),
            "resolution must not be gated on a dead socket: {r}"
        );
    }

    #[test]
    fn env_recover_reads_attached_client_process_env() {
        let r = env_recover_group();
        // The tmux client's pid, then its NUL-separated environ (Linux /proc).
        assert!(
            r.contains("tmux list-clients -t \"$TMUX_PANE\" -F \"#{client_pid}\""),
            "{r}"
        );
        assert!(r.contains("[ -r \"/proc/$cp/environ\" ]"), "{r}");
        assert!(
            r.contains("tr \"\\000\" \"\\n\" < \"/proc/$cp/environ\""),
            "{r}"
        );
        for v in RECOVER_VARS {
            assert!(
                r.contains(&format!("grep -e \"^{v}=\"")),
                "{v} client grep: {r}"
            );
        }
    }

    #[test]
    fn env_recover_prefers_client_then_session_then_inherited_then_global() {
        let r = env_recover_group();
        // For LPM_PANE_ID: client env (/proc grep) < session (`showenv -t`) <
        // inherited restore (`LPM_PANE_ID=$ipane`) < global (`showenv -g`).
        let client = r.find("grep -e \"^LPM_PANE_ID=\"").expect("client extract");
        let session = r
            .find("tmux showenv -t \"$TMUX_PANE\" LPM_PANE_ID")
            .expect("session env");
        let inherited = r.find("LPM_PANE_ID=$ipane").expect("inherited restore");
        let global = r.find("tmux showenv -g LPM_PANE_ID").expect("global env");
        assert!(client < session, "client before session: {r}");
        assert!(session < inherited, "session before inherited: {r}");
        assert!(inherited < global, "inherited before global: {r}");
        // Every source only fills a var still empty (lazy, priority-ordered).
        assert!(r.contains("[ -n \"$LPM_PANE_ID\" ] || "), "{r}");
    }

    #[test]
    fn env_recover_rejects_showenv_unset_marker() {
        let r = env_recover_group();
        // showenv's `-NAME` unset marker must never be accepted as a value: each
        // showenv fallback assigns only inside a `case NAME=*` match, both -t and -g.
        for v in RECOVER_VARS {
            assert!(
                r.contains(&format!("case \"$v\" in {v}=*) {v}=${{v#*=}};; esac")),
                "{v} must guard against the -NAME marker: {r}"
            );
        }
    }

    #[test]
    fn env_recover_not_in_tmux_only_globs_socket() {
        let r = env_recover_group();
        // The whole tmux resolution is inside `if [ -n "$TMUX" ]; ... fi;`, so when
        // not in tmux only the socket glob runs — exactly as before.
        let tmux_open = r.find("if [ -n \"$TMUX\" ]; then").expect("tmux block");
        let glob = r
            .find("if [ ! -S \"$LPM_SOCKET_PATH\" ]; then for s in")
            .expect("socket glob");
        assert!(tmux_open < glob, "socket glob follows the tmux block: {r}");
    }

    #[test]
    fn env_recover_globs_fwd_socket_before_local_socket() {
        let r = env_recover_group();
        let fwd = r
            .find("\"$HOME\"/.lpm/fwd/status-*.sock")
            .expect("fwd glob");
        let local = r.find("\"$HOME\"/.lpm/lpm.sock").expect("local socket");
        assert!(fwd < local, "forwarded socket tried before lpm.sock: {r}");
        // The remote-relay socket is never a delivery target from a hook.
        assert!(
            !r.contains("lpm-remote.sock"),
            "must not target the relay socket"
        );
    }

    #[test]
    fn env_recover_has_no_single_quotes() {
        // The preamble is embedded in JSON and later inside sh single quotes on
        // install, so it must contain no single quote of its own.
        assert!(
            !env_recover_group().contains('\''),
            "no single quotes allowed"
        );
    }
}
