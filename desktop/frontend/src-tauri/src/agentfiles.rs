// What agents on a paired computer may do here: copy files, run commands. The
// paths that always need a person's yes, and the log both computers keep of
// every copy and command.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::Write;
use std::path::PathBuf;

/// Advertised in `ready`: this host answers the agent* frames (peer/agentfiles.rs).
pub(crate) const FEATURE: &str = "agentFiles";

const LOG_FILE: &str = "agent-files.jsonl";
/// Past this the log is cut back to its newer half, so it never grows unbounded.
const LOG_MAX_BYTES: u64 = 512 * 1024;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Access {
    #[default]
    Off,
    Read,
    Write,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Scope {
    #[default]
    Projects,
    Home,
}

/// On the wire and in peer.json: `{ "files": "off"|"read"|"write", "scope":
/// "projects"|"home", "run": bool }`, each defaulting to the narrowest.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub(crate) struct Policy {
    #[serde(rename = "files")]
    pub access: Access,
    pub scope: Scope,
    /// Its agents may run commands here (`lpm exec --on`), as this account.
    pub run: bool,
}

impl Policy {
    pub(crate) fn is_off(&self) -> bool {
        self.access == Access::Off && !self.run
    }

    /// `incoming` laid over this policy: what it leaves out stays as it is, so
    /// a screen sends only what it changed, and an lpm from before commands,
    /// which sends only what agents may copy, leaves `run` alone.
    pub(crate) fn merged(self, incoming: &Value) -> Result<Policy, String> {
        let mut next = json!(self);
        if let (Some(next), Some(incoming)) = (next.as_object_mut(), incoming.as_object()) {
            next.extend(incoming.clone());
        }
        serde_json::from_value(next).map_err(|e| e.to_string())
    }

    pub(crate) fn allows_run(self) -> Result<(), String> {
        if self.run {
            return Ok(());
        }
        Err(
            "agents from that computer can't run commands here. Turn it on in lpm: Settings → \
             Connections, on the computer the agent runs on"
                .into(),
        )
    }

    pub(crate) fn allows(self, write: bool) -> Result<(), String> {
        match (self.access, write) {
            (Access::Off, _) => Err(
                "agents from that computer can't copy files here. Turn it on in lpm: Settings → \
                 Connections, on the computer the agent runs on"
                    .into(),
            ),
            (Access::Read, true) => {
                Err("agents from that computer may only copy files from here, not to it".into())
            }
            _ => Ok(()),
        }
    }
}

/// The settings a screen changed, in the shape `Policy::merged` takes.
pub(crate) fn changes(files: Option<Access>, scope: Option<Scope>, run: Option<bool>) -> Value {
    let mut v = json!({});
    if let Some(files) = files {
        v["files"] = json!(files);
    }
    if let Some(scope) = scope {
        v["scope"] = json!(scope);
    }
    if let Some(run) = run {
        v["run"] = json!(run);
    }
    v
}

const SECRET_DIRS: &[&str] = &[
    ".ssh",
    ".aws",
    ".azure",
    ".gnupg",
    ".kube",
    ".docker",
    ".password-store",
    ".lpm",
    "keychains",
];

const SECRET_NAMES: &[&str] = &[
    "gradle.properties",
    ".netrc",
    ".npmrc",
    ".pypirc",
    ".git-credentials",
    "credentials",
    "credentials.json",
];

const SECRET_EXTS: &[&str] = &[
    "pem",
    "key",
    "p12",
    "pfx",
    "jks",
    "keystore",
    "p8",
    "mobileprovision",
    "kdbx",
];

const SECRET_PREFIXES: &[&str] = &[".env", "id_rsa", "id_ed25519", "id_ecdsa", "id_dsa"];

/// Folders whose files run on their own: a login item, a shell's startup file.
const STARTUP_DIRS: &[&str] = &[
    "library/launchagents",
    "library/launchdaemons",
    ".config/autostart",
    ".config/systemd",
    "start menu/programs/startup",
];

fn normalized(path: &str) -> String {
    path.replace('\\', "/").trim_end_matches('/').to_lowercase()
}

/// Whether copying `path` on a paired computer always needs a person's yes,
/// however much the tab was already allowed: keys and credentials, and the files
/// that run on their own there. `home` is that computer's home folder.
pub(crate) fn sensitive(path: &str, home: &str) -> bool {
    let path = normalized(path);
    let home = normalized(home);
    let rel = path
        .strip_prefix(&home)
        .filter(|r| r.is_empty() || r.starts_with('/'))
        .map(|r| r.trim_start_matches('/'));
    if let Some(rel) = rel {
        if !rel.is_empty() && !rel.contains('/') && rel.starts_with('.') {
            return true;
        }
        if STARTUP_DIRS
            .iter()
            .any(|d| rel == *d || rel.starts_with(&format!("{d}/")))
        {
            return true;
        }
    }
    let parts: Vec<&str> = path.split('/').filter(|p| !p.is_empty()).collect();
    let Some(name) = parts.last() else {
        return false;
    };
    if parts[..parts.len() - 1]
        .iter()
        .any(|p| SECRET_DIRS.contains(p))
    {
        return true;
    }
    SECRET_NAMES.contains(name)
        || SECRET_PREFIXES.iter().any(|p| name.starts_with(p))
        || name
            .rsplit_once('.')
            .is_some_and(|(_, ext)| SECRET_EXTS.contains(&ext))
}

fn log_path() -> PathBuf {
    crate::config::lpm_dir().join(LOG_FILE)
}

/// Add one line to this computer's record of agent copies.
pub(crate) fn log(mut entry: Value) {
    entry["at"] = json!(crate::status::now_millis());
    let path = log_path();
    if std::fs::metadata(&path).is_ok_and(|m| m.len() > LOG_MAX_BYTES) {
        if let Ok(bytes) = std::fs::read(&path) {
            let keep = bytes.len() / 2;
            let cut = bytes[keep..]
                .iter()
                .position(|&b| b == b'\n')
                .map_or(bytes.len(), |i| keep + i + 1);
            let _ =
                crate::fsatomic::write(&path, &bytes[cut..], crate::fsatomic::Mode::Exact(0o600));
        }
    }
    let mut options = std::fs::OpenOptions::new();
    options.create(true).append(true);
    if let Ok(mut file) = crate::fsperm::open_mode(&mut options, 0o600).open(&path) {
        let _ = writeln!(file, "{entry}");
    }
}

/// The newest `n` lines of the log, oldest first.
pub(crate) fn recent(n: usize) -> Vec<Value> {
    let Ok(text) = std::fs::read_to_string(log_path()) else {
        return Vec::new();
    };
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    lines[lines.len().saturating_sub(n)..]
        .iter()
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const HOME: &str = "/Users/me";

    #[test]
    fn keys_and_credentials_always_ask() {
        for path in [
            "/Users/me/keys/lpm-upload.jks",
            "/Users/me/.gradle/gradle.properties",
            "/Users/me/Projects/app/.env",
            "/Users/me/Projects/app/.env.local",
            "/Users/me/.ssh/config",
            "/Users/me/certs/server.PEM",
            "/opt/app/id_ed25519.pub",
            "/Users/me/Library/Keychains/login.keychain-db",
            "C:\\Users\\me\\.aws\\config",
        ] {
            assert!(sensitive(path, HOME), "{path}");
        }
    }

    #[test]
    fn files_that_run_on_their_own_always_ask() {
        for path in [
            "/Users/me/.zshrc",
            "/Users/me/.bashrc",
            "/Users/me/Library/LaunchAgents/x.plist",
            "/Users/me/Library/LaunchAgents",
            "/Users/me/.config/autostart/x.desktop",
        ] {
            assert!(sensitive(path, HOME), "{path}");
        }
    }

    #[test]
    fn ordinary_project_files_do_not() {
        for path in [
            "/Users/me/Projects/app/src/main.rs",
            "/Users/me/Projects/app/.gitignore",
            "/Users/me/Projects/app/README.md",
            "/Users/me/Downloads/report.pdf",
            "/Users/me/Projects/app/keys.ts",
            "/Users/me",
        ] {
            assert!(!sensitive(path, HOME), "{path}");
        }
    }

    #[test]
    fn a_home_level_dotfile_is_judged_against_that_computers_home() {
        assert!(sensitive("/home/dev/.profile", "/home/dev"));
        assert!(!sensitive("/home/dev/project/.prettierrc", "/home/dev"));
    }

    #[test]
    fn policy_reads_what_a_device_stored() {
        let read = |v: Value| serde_json::from_value::<Policy>(v);
        assert_eq!(read(json!({})).unwrap(), Policy::default());
        assert_eq!(
            read(json!({ "files": "write", "scope": "home" })).unwrap(),
            Policy {
                access: Access::Write,
                scope: Scope::Home,
                run: false,
            }
        );
        assert!(read(json!({ "files": "everything" })).is_err());
        assert_eq!(
            json!(Policy::default()),
            json!({ "files": "off", "scope": "projects", "run": false })
        );
    }

    #[test]
    fn running_commands_is_its_own_permission() {
        let runs = Policy {
            run: true,
            ..Default::default()
        };
        assert!(!runs.is_off(), "kept in peer.json though copies are off");
        assert!(runs.allows_run().is_ok());
        assert!(runs.allows(false).is_err());
        assert!(Policy::default().allows_run().is_err());
    }

    #[test]
    fn an_older_lpm_setting_copies_leaves_commands_as_they_were() {
        let runs = Policy {
            run: true,
            ..Default::default()
        };
        let old = runs
            .merged(&json!({ "files": "read", "scope": "home" }))
            .unwrap();
        assert!(old.run);
        assert_eq!(old.access, Access::Read);
        let off = runs
            .merged(&json!({ "files": "read", "run": false }))
            .unwrap();
        assert!(!off.run);
    }

    #[test]
    fn a_change_to_one_setting_leaves_the_others() {
        let set = Policy {
            access: Access::Write,
            scope: Scope::Home,
            run: false,
        };
        let next = set.merged(&changes(None, None, Some(true))).unwrap();
        assert_eq!(next, Policy { run: true, ..set });
        assert!(set.merged(&json!({ "files": "everything" })).is_err());
    }

    #[test]
    fn read_access_refuses_writes() {
        let policy = |access| Policy {
            access,
            scope: Scope::Projects,
            run: false,
        };
        assert!(policy(Access::Read).allows(false).is_ok());
        assert!(policy(Access::Read).allows(true).is_err());
        assert!(Policy::default().allows(false).is_err());
        assert!(policy(Access::Write).allows(true).is_ok());
    }
}
