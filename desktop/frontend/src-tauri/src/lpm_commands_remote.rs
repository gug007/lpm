// An SSH project's own skills, kept in .agents/skills on its host: the agent
// works there, and the files travel with that checkout's git. Each operation is
// one login-shell round trip; a listing streams every file length-framed so a
// prompt can hold any bytes.
use crate::config::{quote_remote_path, SshSettings};
use crate::lpm_commands::{
    is_visible_folder, legacy_name_of, skill_file, ClaudeEntry, CommandFs, Layout, LegacyFile, LegacyList, RawList,
    Snapshot, MAX_FILE_BYTES,
};
use crate::lpm_commands_git::{GitView, CLAUDE_ROOT, SHARED_ROOT};
use crate::lpm_commands_layout as layout;
use crate::lpm_commands_local::{LEGACY_DIR, LEGACY_DONE, LEGACY_DONE_NOTE};
use std::path::{Path, PathBuf};

pub(crate) struct RemoteFs {
    ssh: SshSettings,
    root: String,
    layout: Option<PathBuf>,
}

fn snapshot_script(root: &str, skills: &str, claude: &str, lpm: &str) -> String {
    format!(
        "R={root}
S={skills}
C={claude}
L={lpm}
send() {{
  N=$(wc -c < \"$3\" | tr -d ' ')
  [ \"$N\" -gt {cap} ] && N={cap}
  printf '%s\\037%s\\037%s\\n' \"$1\" \"$2\" \"$N\"
  head -c \"$N\" \"$3\"
}}
if [ -d \"$L/{legacy}\" ] && [ ! -e \"$L/{legacy}/{done}\" ]; then printf 'L\\n'; fi
for f in \"$S\"/*/SKILL.md; do
  [ -f \"$f\" ] || continue
  d=${{f%/SKILL.md}}
  send S \"${{d##*/}}\" \"$f\"
done
for d in \"$C\"/*; do
  n=${{d##*/}}
  if [ -L \"$d\" ]; then printf 'K\\037%s\\037%s\\n' \"$n\" \"$(readlink \"$d\")\"
  elif [ -f \"$d/SKILL.md\" ]; then send C \"$n\" \"$d/SKILL.md\"
  fi
done
(
  cd \"$R\" 2>/dev/null && git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0
  printf 'G\\n'
  git ls-files -- {shared} {claude_root} | while IFS= read -r p; do printf 'T\\037%s\\n' \"$p\"; done
  git ls-tree -r --name-only HEAD -- {shared} {claude_root} 2>/dev/null | while IFS= read -r p; do printf 'H\\037%s\\n' \"$p\"; done
  printf '%s\\n' {shared}/* {claude_root}/* | git check-ignore --stdin 2>/dev/null | while IFS= read -r p; do printf 'I\\037%s\\n' \"$p\"; done
)
true
",
        cap = MAX_FILE_BYTES,
        shared = SHARED_ROOT,
        claude_root = CLAUDE_ROOT,
        legacy = LEGACY_DIR,
        done = LEGACY_DONE,
    )
}

fn legacy_script(base: &str) -> String {
    format!(
        "B={base}
[ -d \"$B\" ] || exit 0
cd \"$B\" || exit 1
for d in */; do [ -d \"$d\" ] && printf 'D\\037%s\\n' \"${{d%/}}\"; done
for f in *.md */*.md; do
  [ -f \"$f\" ] || continue
  N=$(wc -c < \"$f\" | tr -d ' ')
  [ \"$N\" -gt {cap} ] && N={cap}
  printf 'F\\037%s\\037%s\\n' \"$f\" \"$N\"
  head -c \"$N\" \"$f\"
done
",
        cap = MAX_FILE_BYTES
    )
}

/// The next header line of a stream, and where what follows it starts.
fn next_line(bytes: &[u8], at: usize) -> Option<(String, usize)> {
    let nl = bytes[at..].iter().position(|&b| b == b'\n')?;
    Some((String::from_utf8_lossy(&bytes[at..at + nl]).into_owned(), at + nl + 1))
}

/// `len` bytes of file at `at`, or None for a stream cut short.
fn framed(bytes: &[u8], at: usize, len: &str) -> Option<(String, usize)> {
    let len = len.trim().parse::<usize>().ok()?;
    if len > MAX_FILE_BYTES || at + len > bytes.len() {
        return None;
    }
    Some((String::from_utf8_lossy(&bytes[at..at + len]).into_owned(), at + len))
}

pub(crate) fn parse_snapshot(bytes: &[u8], skills_dir: &str, claude_dir: &str, layout: Layout) -> Snapshot {
    let mut raw = RawList {
        skills_dir: skills_dir.to_string(),
        claude_dir: claude_dir.to_string(),
        layout,
        ..RawList::default()
    };
    let mut i = 0;
    while i < bytes.len() {
        let Some((header, next)) = next_line(bytes, i) else { break };
        i = next;
        let fields: Vec<&str> = header.split('\u{1f}').collect();
        match fields.as_slice() {
            ["L"] => raw.legacy = true,
            ["G"] => raw.git = Some(GitView::default()),
            ["T", path] => raw.git.get_or_insert_default().tracked.push(path.to_string()),
            ["H", path] => raw.git.get_or_insert_default().committed.push(path.to_string()),
            ["I", path] => {
                raw.git.get_or_insert_default().ignored.insert(path.to_string());
            }
            ["K", name, target] if is_visible_folder(name) => {
                raw.claude.push((name.to_string(), ClaudeEntry::Link(target.to_string(), None)));
            }
            ["S" | "C", name, len] => {
                let Some((content, end)) = framed(bytes, i, len) else { break };
                i = end;
                if !is_visible_folder(name) {
                    continue;
                }
                if fields[0] == "S" {
                    raw.skills.push((name.to_string(), content));
                } else {
                    raw.claude.push((name.to_string(), ClaudeEntry::Copy(content)));
                }
            }
            _ => {}
        }
    }
    raw.sorted_out()
}

pub(crate) fn parse_legacy(bytes: &[u8]) -> LegacyList {
    let mut out = LegacyList::default();
    let mut i = 0;
    while i < bytes.len() {
        let Some((header, next)) = next_line(bytes, i) else { break };
        i = next;
        let fields: Vec<&str> = header.split('\u{1f}').collect();
        match fields.as_slice() {
            ["D", name] if is_visible_folder(name) => out.folders.push(name.to_string()),
            ["F", path, len] => {
                let Some((content, end)) = framed(bytes, i, len) else { break };
                i = end;
                let (folder, file) = match path.split_once('/') {
                    Some((f, file)) if is_visible_folder(f) => (Some(f.to_string()), file),
                    Some(_) => continue,
                    None => (None, *path),
                };
                if let Some(name) = legacy_name_of(file) {
                    out.files.push(LegacyFile { folder, name: name.to_string(), content });
                }
            }
            _ => {}
        }
    }
    out
}

impl RemoteFs {
    pub fn new(ssh: SshSettings, root: &str) -> Self {
        Self {
            ssh,
            root: root.trim_end_matches('/').to_string(),
            layout: None,
        }
    }

    pub fn with_layout(mut self, path: PathBuf) -> Self {
        self.layout = Some(path);
        self
    }

    fn at(&self, rel: &str) -> String {
        format!("{}/{rel}", self.root)
    }

    fn quoted(&self, rel: &str) -> String {
        quote_remote_path(&self.at(&format!(".agents/skills/{rel}")))
    }

    fn claude(&self, name: &str) -> String {
        quote_remote_path(&self.at(&format!(".claude/skills/{name}")))
    }

    fn lpm(&self, rel: &str) -> String {
        quote_remote_path(&self.at(&format!(".lpm/{rel}")))
    }

    /// git names its own files from the project's folder, or in full from a
    /// linked worktree.
    fn git_file(&self, path: &str) -> String {
        if path.starts_with('/') {
            quote_remote_path(path)
        } else {
            quote_remote_path(&self.at(path))
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

    fn unlink_script(&self, name: &str) -> String {
        format!(
            "C={claude}
if [ -L \"$C\" ]; then
  case \"$(readlink \"$C\")\" in *.agents/skills/{name}) rm -f \"$C\";; esac
elif [ -f \"$C/SKILL.md\" ] && grep -q 'lpm-created: \"true\"' \"$C/SKILL.md\"; then
  rm -f \"$C/SKILL.md\"
  rmdir \"$C\" 2>/dev/null
fi
true
",
            claude = self.claude(name),
        )
    }
}

impl CommandFs for RemoteFs {
    fn snapshot(&self) -> Result<Snapshot, String> {
        let script = snapshot_script(&quote_remote_path(&self.root), &self.quoted(""), &self.claude(""), &self.lpm(""));
        let (skills, claude) = (self.at(".agents/skills"), self.at(".claude/skills"));
        let saved = layout::read(self.layout.as_deref());
        self.run(&script).map(|bytes| parse_snapshot(&bytes, &skills, &claude, saved))
    }

    fn write(&self, rel: &str, content: &str) -> Result<(), String> {
        if crate::hooks::write_remote_file(&self.ssh, &self.quoted(rel), content.as_bytes()) {
            Ok(())
        } else {
            Err(format!("Couldn't save the skill on {}.", self.ssh.host))
        }
    }

    fn link_claude(&self, name: &str) -> Result<(), String> {
        let script = format!(
            "C={claude}
D={skill}
mkdir -p \"$(dirname \"$C\")\"
if [ -L \"$C\" ]; then
  case \"$(readlink \"$C\")\" in *.agents/skills/{name}) rm -f \"$C\";; *) exit 0;; esac
elif [ -d \"$C\" ]; then
  if grep -q 'lpm-created: \"true\"' \"$C/SKILL.md\" 2>/dev/null; then cp \"$D/SKILL.md\" \"$C/SKILL.md\"; fi
  exit 0
fi
ln -s ../../.agents/skills/{name} \"$C\"
",
            claude = self.claude(name),
            skill = self.quoted(name),
        );
        self.run(&script).map(|_| ())
    }

    fn rename_skill(&self, from: &str, to: &str) -> Result<(), String> {
        let script = format!(
            "if [ -d {from_dir} ]; then mv {from_dir} {to_dir}\nelse mv {claude_from} {claude_to}\nfi\n{unlink}",
            from_dir = self.quoted(from),
            to_dir = self.quoted(to),
            claude_from = self.claude(from),
            claude_to = self.claude(to),
            unlink = self.unlink_script(from),
        );
        self.run(&script).map(|_| ())
    }

    fn remove_skill(&self, name: &str) -> Result<(), String> {
        let dir = self.quoted(name);
        let script = format!(
            "D={dir}
rm -f \"$D/SKILL.md\" \"$D/agents/openai.yaml\"
rmdir \"$D/agents\" 2>/dev/null
rmdir \"$D\" 2>/dev/null
{}",
            self.unlink_script(name)
        );
        self.run(&script).map(|_| ())
    }

    fn layout_path(&self) -> Option<&Path> {
        self.layout.as_deref()
    }

    fn skill_files(&self, name: &str) -> Result<Vec<(String, String)>, String> {
        let roots = [self.quoted(name), self.claude(name)];
        let mut out = Vec::new();
        for (dir, path) in roots.iter().zip([self.quoted(&skill_file(name)), self.claude(&skill_file(name))]) {
            let script = format!("if [ ! -L {dir} ] && [ -f {path} ]; then cat {path}; else exit 3; fi");
            if let Ok(bytes) = self.run(&script) {
                out.push((path, String::from_utf8_lossy(&bytes).into_owned()));
            }
        }
        Ok(out)
    }

    fn rewrite(&self, path: &str, content: &str) -> Result<(), String> {
        if crate::hooks::write_remote_file(&self.ssh, path, content.as_bytes()) {
            Ok(())
        } else {
            Err(format!("Couldn't save the skill on {}.", self.ssh.host))
        }
    }

    fn location(&self, name: &str) -> String {
        self.at(&format!(".agents/skills/{name}"))
    }

    fn git(&self, args: &[&str]) -> Result<String, String> {
        let out = crate::sshexec::remote_output(&self.ssh, &self.root, "git", args)?;
        Ok(String::from_utf8_lossy(&out).trim().to_string())
    }

    fn read_git_file(&self, path: &str) -> Result<String, String> {
        let file = self.git_file(path);
        let bytes = self.run(&format!("if [ -f {file} ]; then cat {file}; fi"))?;
        String::from_utf8(bytes).map_err(|e| e.to_string())
    }

    fn write_git_file(&self, path: &str, text: &str) -> Result<(), String> {
        if crate::hooks::write_remote_file(&self.ssh, &self.git_file(path), text.as_bytes()) {
            Ok(())
        } else {
            Err(format!("Couldn't save Git's ignore rules on {}.", self.ssh.host))
        }
    }

    fn legacy_list(&self) -> Result<LegacyList, String> {
        self.run(&legacy_script(&self.lpm(LEGACY_DIR))).map(|bytes| parse_legacy(&bytes))
    }

    fn copy_legacy_files(&self, folder: &str, commands: &[String], skill: &str) -> Result<(), String> {
        let beside: Vec<String> = commands.iter().map(|c| format!("{c}.md")).collect();
        let script = format!(
            "D={dir}
cd {from} || exit 0
for e in * .[!.]*; do
  [ -e \"$e\" ] || continue
  case \"$e\" in {beside}) continue;; esac
  [ -e \"$D/$e\" ] || cp -R \"$e\" \"$D/\"
done
",
            dir = self.quoted(skill),
            from = self.lpm(&format!("{LEGACY_DIR}/{folder}")),
            beside = beside.join("|"),
        );
        self.run(&script).map(|_| ())
    }

    fn finish_legacy(&self) -> Result<(), String> {
        let path = self.lpm(&format!("{LEGACY_DIR}/{LEGACY_DONE}"));
        if crate::hooks::write_remote_file(&self.ssh, &path, LEGACY_DONE_NOTE.as_bytes()) {
            Ok(())
        } else {
            Err(format!("Couldn't finish moving commands on {}.", self.ssh.host))
        }
    }
}

#[cfg(test)]
#[path = "lpm_commands_remote_tests.rs"]
mod tests;
