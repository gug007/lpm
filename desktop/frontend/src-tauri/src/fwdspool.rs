// Statuses an SSH host kept while lpm's forward was down.
//
// A hook that can't reach the forward's socket appends its message to a spool
// beside it (sockdeliver.rs). Once a new forward has stayed up, the spool is
// taken (moved aside first, so a hook writing at that moment starts a new one)
// and its messages handled as if they had just come through the forward. Their
// pane ids may name a tab that reconnected since; the store follows those
// (status.rs `current_pane`).
use crate::config::{self, SshSettings};
use std::time::Duration;
use tauri::AppHandle;

/// Long enough for ssh to have bound the remote socket, or given up on it.
const SETTLE: Duration = Duration::from_secs(3);

/// Replay `remote_sock`'s spool once the forward has settled, if `alive` still
/// says it is up then.
pub fn replay_when_up(
    app: &AppHandle,
    ssh: &SshSettings,
    remote_sock: &str,
    alive: impl Fn() -> bool + Send + 'static,
) {
    let app = app.clone();
    let ssh = ssh.clone();
    let spool = format!("{remote_sock}{}", crate::sockdeliver::SPOOL_SUFFIX);
    std::thread::spawn(move || {
        std::thread::sleep(SETTLE);
        if !alive() {
            return;
        }
        let script = take_script(&spool);
        let cmd = crate::sshexec::remote_login_script(&ssh, &script);
        if let Some(out) = crate::statusfwd::run_with_timeout(cmd, Duration::from_secs(15)) {
            crate::socketsrv::replay_remote(&app, &String::from_utf8_lossy(&out));
        }
    });
}

fn take_script(spool: &str) -> String {
    let f = config::shell_quote(spool);
    format!("[ -f {f} ] || exit 0; mv -f {f} {f}.replay && cat {f}.replay && rm -f {f}.replay")
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[test]
    fn the_spool_is_handed_over_once() {
        let dir = tempfile::tempdir().unwrap();
        let spool = dir.path().join("s.sock.spool");
        std::fs::write(&spool, "set_status p k Running\nset_status p k Done\n").unwrap();
        let run = || {
            std::process::Command::new("sh")
                .args(["-c", &take_script(&spool.to_string_lossy())])
                .output()
                .unwrap()
        };
        let first = run();
        assert_eq!(
            String::from_utf8_lossy(&first.stdout),
            "set_status p k Running\nset_status p k Done\n"
        );
        assert!(!spool.exists());
        assert!(run().stdout.is_empty(), "nothing left to replay");
    }
}
