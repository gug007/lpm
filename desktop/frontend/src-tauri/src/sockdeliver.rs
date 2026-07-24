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

/// Recover the LPM_* vars a hook needs when it runs without them — the case when
/// an agent runs inside a tmux server that predates the lpm terminal (panes
/// inherit the SERVER's env, not ours, so `$LPM_SOCKET_PATH` is unset/dead and
/// delivery is silent). Emitted as a single-line, single-quote-free POSIX-sh
/// preamble so it stays safe once the whole hook command is embedded in JSON and
/// again in `sh` single quotes on install. Two passes:
///  1. When the socket is dead AND we're in tmux, pull each var from the tmux
///     GLOBAL env (`showenv -g` prints `NAME=value`; `${v#*=}` strips through the
///     first `=`). The socket is refreshed unconditionally (it's dead by the
///     guard); project/pane only when still empty, never overriding inherited
///     values.
///  2. If the socket is STILL not a socket, glob for one: the forwarded remote
///     socket first (`status-*.sock`), then the local Mac socket (`lpm.sock`).
///     An unmatched glob stays a literal pattern and fails `-S`. The remote-relay
///     socket (`lpm-remote.sock`) is deliberately never a candidate.
/// The caller must place this BEFORE it stages `m` (which interpolates the vars).
pub fn env_recover_group() -> String {
    String::from(
        r#"if [ ! -S "$LPM_SOCKET_PATH" ] && [ -n "$TMUX" ]; then v=$(tmux showenv -g LPM_SOCKET_PATH 2>/dev/null); LPM_SOCKET_PATH=${v#*=}; [ -n "$LPM_PROJECT_NAME" ] || { v=$(tmux showenv -g LPM_PROJECT_NAME 2>/dev/null); LPM_PROJECT_NAME=${v#*=}; }; [ -n "$LPM_PANE_ID" ] || { v=$(tmux showenv -g LPM_PANE_ID 2>/dev/null); LPM_PANE_ID=${v#*=}; }; fi; if [ ! -S "$LPM_SOCKET_PATH" ]; then for s in "$HOME"/.lpm/fwd/status-*.sock "$HOME"/.lpm/lpm.sock; do [ -S "$s" ] && LPM_SOCKET_PATH=$s && break; done; fi;"#,
    )
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
        assert!(!DELIVER_PY.contains("$m"), "payload not interpolated into python");
        assert!(!DELIVER_PL.contains("$m"), "payload not interpolated into perl");
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
    fn env_recover_pulls_each_var_from_tmux_global_env() {
        let r = env_recover_group();
        // Gated on a dead socket while inside tmux.
        assert!(r.contains("[ ! -S \"$LPM_SOCKET_PATH\" ] && [ -n \"$TMUX\" ]"));
        for v in ["LPM_SOCKET_PATH", "LPM_PROJECT_NAME", "LPM_PANE_ID"] {
            assert!(r.contains(&format!("tmux showenv -g {v}")), "{v}: {r}");
            assert!(r.contains(&format!("{v}=${{v#*=}}")), "{v} strip: {r}");
        }
        // Project/pane are only filled when still empty, never overridden.
        assert!(r.contains("[ -n \"$LPM_PROJECT_NAME\" ] || {"));
        assert!(r.contains("[ -n \"$LPM_PANE_ID\" ] || {"));
    }

    #[test]
    fn env_recover_globs_fwd_socket_before_local_socket() {
        let r = env_recover_group();
        let fwd = r.find("\"$HOME\"/.lpm/fwd/status-*.sock").expect("fwd glob");
        let local = r.find("\"$HOME\"/.lpm/lpm.sock").expect("local socket");
        assert!(fwd < local, "forwarded socket tried before lpm.sock: {r}");
        // The remote-relay socket is never a delivery target from a hook.
        assert!(!r.contains("lpm-remote.sock"), "must not target the relay socket");
    }

    #[test]
    fn env_recover_has_no_single_quotes() {
        // The preamble is embedded in JSON and later inside sh single quotes on
        // install, so it must contain no single quote of its own.
        assert!(!env_recover_group().contains('\''), "no single quotes allowed");
    }
}
