// A machine lpm writes agent settings on through a shell: an SSH host, or a WSL
// distro on this PC. The agent hook installs (hooks/) take either.
use std::process::Command;

pub trait RemoteShell: Send + Sync {
    /// `script` in the user's login bash there, with the script's output on
    /// stdout and anything the login prints on stderr.
    fn login_script(&self, script: &str) -> Command;
}

impl RemoteShell for crate::config::SshSettings {
    fn login_script(&self, script: &str) -> Command {
        crate::sshexec::remote_login_script(self, script)
    }
}

/// A WSL distro, by name.
#[cfg_attr(not(windows), allow(dead_code))]
pub struct Wsl(pub String);

/// `$1` in a login bash, its output as sshexec's login script keeps it.
#[cfg_attr(not(windows), allow(dead_code))]
const WSL_LOGIN: &str = r#"exec bash -lc "exec 1>&3 3>&-; $1" 3>&1 1>&2"#;

impl RemoteShell for Wsl {
    fn login_script(&self, script: &str) -> Command {
        #[cfg(windows)]
        let mut cmd = crate::osproc::command(crate::wsl::exe());
        #[cfg(not(windows))]
        let mut cmd = crate::osproc::command("wsl.exe");
        cmd.args(["-d", &self.0, "--exec", "sh", "-c", WSL_LOGIN, "sh", script]);
        cmd
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[test]
    fn the_wsl_login_keeps_only_the_script_on_stdout() {
        let out = Command::new("sh")
            .args(["-c", WSL_LOGIN, "sh", "echo noise >&2; printf '%s' \"it's $((1 + 1))\""])
            .output()
            .unwrap();
        assert!(out.status.success());
        assert_eq!(String::from_utf8_lossy(&out.stdout), "it's 2");
    }

    #[test]
    fn a_distro_is_reached_through_wsl_exe() {
        let cmd = Wsl("Ubuntu".into()).login_script("true");
        let args: Vec<_> = cmd.get_args().map(|a| a.to_string_lossy().into_owned()).collect();
        assert_eq!(args, ["-d", "Ubuntu", "--exec", "sh", "-c", WSL_LOGIN, "sh", "true"]);
    }
}
