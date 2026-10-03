//! Opening a folder or file on another machine in a VS Code-family editor over
//! its Remote-SSH extension, for SSH projects and for paired machines alike.

use std::process::Command;

use serde_json::{json, Value};

use crate::openin::{format_path_spec, run, vscode_cli, InstalledApp};

/// The authority Remote-SSH connects with. Plain `user@host` leaves the rest to
/// ~/.ssh/config; anything that can't ride in it (a port, an IPv6 address, a
/// key) goes in the extension's hex-encoded JSON form.
pub(crate) fn authority(host: &str, user: &str, port: u16, key: &str) -> String {
    let (host, user, key) = (host.trim(), user.trim(), key.trim());
    if (port == 0 || port == 22) && !host.contains(':') && key.is_empty() {
        let dest = if user.is_empty() {
            host.to_string()
        } else {
            format!("{user}@{host}")
        };
        return format!("ssh-remote+{dest}");
    }
    let mut spec = json!({ "hostName": host, "port": if port == 0 { 22 } else { port } });
    if !user.is_empty() {
        spec["user"] = Value::from(user);
    }
    if !key.is_empty() {
        spec["sshArgs"] = json!(["-i", key]);
    }
    format!("ssh-remote+{}", hex::encode(spec.to_string()))
}

/// What Remote-SSH accepts as a host and user (its own validation); anything
/// else it reads as a hostname to resolve, and fails.
pub(crate) fn can_name(host: &str, user: &str) -> bool {
    let ok = |s: &str, extra: char| {
        s.chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-') || c == extra)
    };
    let host = host.trim();
    !host.is_empty() && ok(host, ':') && ok(user.trim(), '.')
}

fn folder_uri(authority: &str, abs: &str) -> String {
    let path: Vec<_> = abs
        .split('/')
        .map(|seg| urlencoding::encode(seg).into_owned())
        .collect();
    format!("vscode-remote://{authority}{}", path.join("/"))
}

/// Preferring the embedded CLI over `open -a --args` is what makes this reliable
/// when the app is already running.
pub(crate) fn open_folder(app: &InstalledApp, authority: &str, abs: &str) -> Result<(), String> {
    let uri = folder_uri(authority, abs);
    match embedded_cli(&app.path) {
        Some(cli) => run(Command::new(cli).args(["--folder-uri", &uri])),
        None => run(Command::new("open").args(["-a", app.label, "--args", "--folder-uri", &uri])),
    }
}

/// The editor goes to the line, as it does for a file on this Mac. `--remote`
/// takes the path as it is, so nothing in it needs escaping.
pub(crate) fn open_file(
    app: &InstalledApp,
    authority: &str,
    abs: &str,
    line: i64,
    col: i64,
) -> Result<(), String> {
    let cli = vscode_cli(app.id, &app.path)
        .ok_or_else(|| format!("{} can't open a remote file", app.label))?;
    run(Command::new(cli).args([
        "--remote",
        authority,
        "-g",
        &format_path_spec(abs, line, col),
    ]))
}

/// The launcher binary inside `<App>.app/Contents/Resources/app/bin` (VS Code
/// forks ship exactly one primary CLI there), detected rather than hardcoded.
/// The `*-tunnel` companion is skipped; the remaining name wins.
fn embedded_cli(app_path: &str) -> Option<String> {
    let bin = std::path::Path::new(app_path).join("Contents/Resources/app/bin");
    let mut names: Vec<String> = std::fs::read_dir(&bin)
        .ok()?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|ft| ft.is_file()).unwrap_or(false))
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|n| !n.ends_with("-tunnel"))
        .collect();
    names.sort();
    names
        .into_iter()
        .next()
        .map(|n| bin.join(n).to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn decoded(auth: &str) -> Value {
        let hex = auth.strip_prefix("ssh-remote+").unwrap();
        serde_json::from_slice(&hex::decode(hex).unwrap()).unwrap()
    }

    #[test]
    fn folder_uri_has_ssh_remote_authority_and_absolute_path() {
        // ssh.dir "~/code/app" resolves (remotely) to an absolute path, which the
        // URI carries after the user@host authority.
        let uri = folder_uri(
            &authority("example.com", "dev", 0, ""),
            "/Users/dev/code/app",
        );
        assert_eq!(
            uri,
            "vscode-remote://ssh-remote+dev@example.com/Users/dev/code/app"
        );
    }

    #[test]
    fn folder_uri_path_is_escaped_per_segment() {
        assert_eq!(
            folder_uri("ssh-remote+box", "/home/dev/my app#1"),
            "vscode-remote://ssh-remote+box/home/dev/my%20app%231"
        );
    }

    #[test]
    fn default_port_is_a_plain_destination() {
        assert_eq!(
            authority("203.0.113.10", "root", 0, ""),
            "ssh-remote+root@203.0.113.10"
        );
        assert_eq!(authority("box", "", 22, ""), "ssh-remote+box");
    }

    #[test]
    fn what_a_plain_destination_cant_carry_travels_in_the_json_form() {
        assert_eq!(
            decoded(&authority("example.com", "dev", 2222, "")),
            json!({ "hostName": "example.com", "user": "dev", "port": 2222 })
        );
        assert_eq!(
            decoded(&authority("2001:db8::1", "dev", 0, "")),
            json!({ "hostName": "2001:db8::1", "user": "dev", "port": 22 })
        );
        assert_eq!(
            decoded(&authority(
                "example.com",
                "dev",
                0,
                "/Users/me/.ssh/host_ed25519"
            )),
            json!({
                "hostName": "example.com",
                "user": "dev",
                "port": 22,
                "sshArgs": ["-i", "/Users/me/.ssh/host_ed25519"]
            })
        );
    }

    #[test]
    fn names_only_what_its_parser_accepts() {
        assert!(can_name("203.0.113.10", "ubuntu"));
        assert!(can_name("2001:db8::1", ""));
        assert!(can_name("build-box.local", "first.last"));
        assert!(!can_name("[2001:db8::1]", "dev"));
        assert!(!can_name("fe80::1%en0", "dev"));
        assert!(!can_name("box", "DOMAIN\\dev"));
    }

    #[test]
    fn embedded_cli_detects_launcher_and_skips_tunnel() {
        let app = tempfile::tempdir().unwrap();
        let bin = app.path().join("Contents/Resources/app/bin");
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::write(bin.join("code"), "#!/bin/sh\n").unwrap();
        std::fs::write(bin.join("code-tunnel"), "#!/bin/sh\n").unwrap();
        let cli = embedded_cli(&app.path().to_string_lossy()).unwrap();
        assert!(cli.ends_with("/bin/code"), "{cli}");
    }

    #[test]
    fn embedded_cli_none_when_bin_missing() {
        let app = tempfile::tempdir().unwrap();
        assert!(embedded_cli(&app.path().to_string_lossy()).is_none());
    }
}
