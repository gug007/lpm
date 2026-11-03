// An SSH project's own commands, kept in .lpm/commands on its host: the agent
// works there, and the files travel with that checkout's git. Each operation is
// one login-shell round trip; a listing streams every file length-framed so a
// prompt can hold any bytes.
use crate::config::{quote_remote_path, SshSettings};
use crate::lpm_commands::{command_name_of, is_visible_folder, CommandFile, CommandFs, Snapshot, MAX_FILE_BYTES};

pub(crate) struct RemoteFs {
    ssh: SshSettings,
    base: String,
}

impl RemoteFs {
    pub fn new(ssh: SshSettings, root: &str) -> Self {
        Self {
            ssh,
            base: format!("{}/.lpm/commands", root.trim_end_matches('/')),
        }
    }

    fn quoted(&self, rel: &str) -> String {
        if rel.is_empty() {
            quote_remote_path(&self.base)
        } else {
            quote_remote_path(&format!("{}/{rel}", self.base))
        }
    }

    fn run(&self, script: &str) -> Result<Vec<u8>, String> {
        let out = crate::sshexec::remote_login_script(&self.ssh, script)
            .output()
            .map_err(|e| e.to_string())?;
        if out.status.success() {
            return Ok(out.stdout);
        }
        let stderr = String::from_utf8_lossy(&out.stderr);
        Err(stderr
            .lines()
            .rev()
            .map(str::trim)
            .find(|l| !l.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| format!("{} didn't answer.", self.ssh.host)))
    }
}

fn snapshot_script(base: &str) -> String {
    format!(
        "B={base}
[ -d \"$B\" ] || exit 0
cd \"$B\" || exit 1
for d in */; do [ -d \"$d\" ] && printf 'D\\037%s\\n' \"${{d%/}}\"; done
for f in *.md */*.md; do
  [ -f \"$f\" ] || continue
  L=$(wc -c < \"$f\" | tr -d ' ')
  [ \"$L\" -gt {cap} ] && L={cap}
  printf 'F\\037%s\\037%s\\n' \"$f\" \"$L\"
  head -c \"$L\" \"$f\"
done
",
        cap = MAX_FILE_BYTES
    )
}

pub(crate) fn parse_snapshot(bytes: &[u8]) -> Snapshot {
    let mut out = Snapshot::default();
    let mut i = 0;
    while i < bytes.len() {
        let Some(nl) = bytes[i..].iter().position(|&b| b == b'\n') else { break };
        let header = String::from_utf8_lossy(&bytes[i..i + nl]).into_owned();
        i += nl + 1;
        let fields: Vec<&str> = header.split('\u{1f}').collect();
        match fields.as_slice() {
            ["D", name] if is_visible_folder(name) => out.folders.push(name.to_string()),
            ["F", path, len] => {
                let Ok(len) = len.trim().parse::<usize>() else { break };
                if len > MAX_FILE_BYTES || i + len > bytes.len() {
                    break;
                }
                let content = String::from_utf8_lossy(&bytes[i..i + len]).into_owned();
                i += len;
                let (folder, file) = match path.split_once('/') {
                    Some((f, file)) if is_visible_folder(f) => (Some(f.to_string()), file),
                    Some(_) => continue,
                    None => (None, *path),
                };
                if let Some(name) = command_name_of(file) {
                    out.files.push(CommandFile {
                        folder,
                        name: name.to_string(),
                        content,
                    });
                }
            }
            _ => {}
        }
    }
    out
}

impl CommandFs for RemoteFs {
    fn snapshot(&self) -> Result<Snapshot, String> {
        self.run(&snapshot_script(&self.quoted(""))).map(|bytes| parse_snapshot(&bytes))
    }

    fn write(&self, rel: &str, content: &str) -> Result<(), String> {
        if crate::hooks::write_remote_file(&self.ssh, &self.quoted(rel), content.as_bytes()) {
            Ok(())
        } else {
            Err(format!("Couldn't save the command on {}.", self.ssh.host))
        }
    }

    fn remove_file(&self, rel: &str) -> Result<(), String> {
        self.run(&format!("rm -f {}", self.quoted(rel))).map(|_| ())
    }

    fn create_dir(&self, rel: &str) -> Result<(), String> {
        self.run(&format!("mkdir -p {}", self.quoted(rel))).map(|_| ())
    }

    fn rename(&self, from: &str, to: &str) -> Result<(), String> {
        let to = self.quoted(to);
        self.run(&format!("mkdir -p \"$(dirname {to})\" && mv {} {to}", self.quoted(from)))
            .map(|_| ())
    }

    fn remove_dir(&self, rel: &str) -> Result<(), String> {
        self.run(&format!("rmdir {}", self.quoted(rel))).map(|_| ())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(path: &str, body: &str) -> Vec<u8> {
        let mut out = format!("F\u{1f}{path}\u{1f}{}\n", body.len()).into_bytes();
        out.extend_from_slice(body.as_bytes());
        out
    }

    #[test]
    fn reads_folders_and_files_from_the_stream() {
        let mut bytes = b"D\x1fReview\nD\x1f.hidden\n".to_vec();
        bytes.extend(frame("Review/fix-ticket.md", "Fix it.\nTwice.\n"));
        bytes.extend(frame("explain.md", "Explain."));
        bytes.extend(frame("bad name.md", "skip"));
        let snap = parse_snapshot(&bytes);
        assert_eq!(snap.folders, ["Review"]);
        let files: Vec<_> = snap
            .files
            .iter()
            .map(|f| (f.folder.clone(), f.name.clone(), f.content.clone()))
            .collect();
        assert_eq!(
            files,
            [
                (Some("Review".to_string()), "fix-ticket".to_string(), "Fix it.\nTwice.\n".to_string()),
                (None, "explain".to_string(), "Explain.".to_string()),
            ]
        );
    }

    #[test]
    fn a_truncated_stream_stops_without_inventing_content() {
        let mut bytes = frame("a.md", "whole");
        bytes.extend(b"F\x1fb.md\x1f99\nshort");
        assert_eq!(parse_snapshot(&bytes).files.len(), 1);
    }

    #[test]
    fn paths_stay_quoted_under_home() {
        let fs = RemoteFs::new(SshSettings::default(), "~/code/app");
        assert_eq!(fs.quoted("Bugs/x.md"), "\"$HOME\"'/code/app/.lpm/commands/Bugs/x.md'");
    }
}
