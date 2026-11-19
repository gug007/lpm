//! A small edit made on the phone, saved into a project file. The phone sends
//! the SHA-256 of the bytes it opened, and the file is written only while it
//! still holds those bytes, so a change an agent made meanwhile is never lost.
//! Only files inside the project, and only UTF-8 text, as the desktop editor.
use crate::peer::sha256_hex;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::mpsc::SyncSender;

/// The phone may send `writeFile`.
pub const FEATURE: &str = "writeFile";
const MAX_BYTES: usize = 1024 * 1024;

/// Reads and hashes the file on a worker, so a big one doesn't hold up the socket.
pub(super) fn handle(out: &SyncSender<String>, v: &Value) {
    let out = out.clone();
    let v = v.clone();
    std::thread::spawn(move || {
        let _ = out.try_send(reply(&v).to_string());
    });
}

fn reply(v: &Value) -> Value {
    let project = v["project"].as_str().unwrap_or_default();
    let raw = v["path"].as_str().unwrap_or_default();
    let content = v["content"].as_str().unwrap_or_default();
    let base = v["base"].as_str().unwrap_or_default();
    let mut reply = match crate::config::project_root(project) {
        Ok((_, true)) => failure("Files on an SSH server can't be edited from the phone yet.", false),
        Ok((root, false)) => match write(Path::new(&root), raw, content, base) {
            Ok(saved) => json!({ "ok": true, "size": saved.size, "mtime": saved.mtime, "sha256": saved.sha }),
            Err(Refusal::Changed(name)) => failure(
                &format!("{name} changed on your Mac since you opened it. Open it again to see the new version."),
                true,
            ),
            Err(Refusal::Error(error)) => failure(&error, false),
        },
        Err(error) => failure(&error, false),
    };
    reply["t"] = json!("writeFile");
    reply["project"] = json!(project);
    reply["path"] = json!(raw);
    if let Some(req) = v.get("reqId").filter(|r| !r.is_null()) {
        reply["reqId"] = req.clone();
    }
    reply
}

fn failure(error: &str, changed: bool) -> Value {
    json!({ "ok": false, "changed": changed, "error": error })
}

#[derive(Debug, PartialEq)]
enum Refusal {
    Changed(String),
    Error(String),
}

#[derive(Debug)]
struct Saved {
    size: u64,
    mtime: u64,
    sha: String,
}

/// `raw` as a path inside `root`: relative to it, or absolute and under it,
/// symlinks resolved on both sides so a link can't lead out.
fn inside(root: &Path, raw: &str) -> Result<PathBuf, Refusal> {
    let raw = raw.trim();
    let outside =
        || Refusal::Error("Only files in the project can be edited from the phone.".into());
    if raw.is_empty() {
        return Err(outside());
    }
    let expanded = PathBuf::from(crate::config::expand_home(raw));
    let path = if expanded.is_absolute() {
        expanded
    } else {
        root.join(expanded)
    };
    let real = path
        .canonicalize()
        .map_err(|_| Refusal::Error("The file is no longer on your Mac.".into()))?;
    let real_root = root
        .canonicalize()
        .map_err(|e| Refusal::Error(e.to_string()))?;
    if !real.starts_with(&real_root) || real.components().any(|c| c.as_os_str() == ".git") {
        return Err(outside());
    }
    Ok(real)
}

fn write(root: &Path, raw: &str, content: &str, base: &str) -> Result<Saved, Refusal> {
    let path = inside(root, raw)?;
    if content.len() > MAX_BYTES {
        return Err(Refusal::Error(
            "That's too much text to save from the phone.".into(),
        ));
    }
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let current = std::fs::read(&path).map_err(|e| Refusal::Error(e.to_string()))?;
    if std::str::from_utf8(&current).is_err() {
        return Err(Refusal::Error(format!(
            "{name} isn't UTF-8 text, so it can't be edited here."
        )));
    }
    if base.is_empty() || sha256_hex(&current) != base {
        return Err(Refusal::Changed(name));
    }
    std::fs::write(&path, content).map_err(|e| Refusal::Error(e.to_string()))?;
    let meta = std::fs::metadata(&path).map_err(|e| Refusal::Error(e.to_string()))?;
    Ok(Saved {
        size: meta.len(),
        mtime: crate::ignoredpath::mtime_ms(&meta),
        sha: sha256_hex(content.as_bytes()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_only_over_the_bytes_the_phone_opened() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("config.ts");
        std::fs::write(&file, "export const retries = 2;\n").unwrap();
        let opened = sha256_hex(b"export const retries = 2;\n");

        let saved = write(
            dir.path(),
            "config.ts",
            "export const retries = 3;\n",
            &opened,
        )
        .unwrap();
        assert_eq!(
            std::fs::read_to_string(&file).unwrap(),
            "export const retries = 3;\n"
        );
        assert_eq!(saved.sha, sha256_hex(b"export const retries = 3;\n"));
        assert_eq!(saved.size, 26);

        assert_eq!(
            write(
                dir.path(),
                "config.ts",
                "export const retries = 4;\n",
                &opened
            )
            .unwrap_err(),
            Refusal::Changed("config.ts".into())
        );
        assert_eq!(
            std::fs::read_to_string(&file).unwrap(),
            "export const retries = 3;\n"
        );
    }

    #[test]
    fn refuses_paths_outside_the_project() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().join("project");
        std::fs::create_dir_all(project.join(".git")).unwrap();
        std::fs::write(dir.path().join("secret.txt"), "x").unwrap();
        std::fs::write(project.join(".git/config"), "x").unwrap();
        let base = sha256_hex(b"x");
        for raw in ["../secret.txt", ".git/config"] {
            assert!(
                matches!(write(&project, raw, "y", &base), Err(Refusal::Error(_))),
                "{raw} was written"
            );
        }
        assert_eq!(
            std::fs::read_to_string(dir.path().join("secret.txt")).unwrap(),
            "x"
        );
    }

    #[test]
    fn refuses_text_it_cant_read() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("latin1.txt"), [0x63, 0x61, 0x66, 0xe9]).unwrap();
        let base = sha256_hex(&[0x63, 0x61, 0x66, 0xe9]);
        assert!(matches!(
            write(dir.path(), "latin1.txt", "cafe", &base),
            Err(Refusal::Error(_))
        ));
    }
}
