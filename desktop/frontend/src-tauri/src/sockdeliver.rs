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
}
