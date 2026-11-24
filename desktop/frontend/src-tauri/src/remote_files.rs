// Phone-side Files: `listDir` answers one folder of a project, the listing the
// desktop's Files tab shows, with the working tree's state on each entry so the
// phone can mark changed files and the folders that hold them. `locatePath`
// answers where a path typed into Go to File leads, as the desktop's filter box.
use crate::file_browser::{list_dir_entries, DirEntryInfo};
use crate::git::{git_changed_files, ChangedFile};
use crate::project_paths::{list_folder, locate_path, LocatedPath};
use crate::sys::MACHINE;
use serde_json::{json, Map, Value};
use std::cmp::Ordering;
use std::path::Path;
use std::sync::mpsc::SyncSender;

pub const FEATURE: &str = "listDir";
pub const LOCATE_FEATURE: &str = "locatePath";

/// Answer through the out-queue: a status scan of a big repo takes a while.
pub fn handle(out: &SyncSender<String>, v: &Value) {
    let field = |k: &str| {
        v.get(k)
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string()
    };
    let (project, dir) = (field("project"), field("dir"));
    let out = out.clone();
    std::thread::spawn(move || {
        let mut reply = match list(&project, &dir) {
            Ok((root, entries)) => json!({ "ok": true, "root": root, "entries": entries }),
            Err(e) => json!({ "ok": false, "error": e }),
        };
        reply["t"] = json!("listDir");
        reply["project"] = json!(project);
        reply["dir"] = json!(dir);
        let _ = out.try_send(reply.to_string());
    });
}

/// Answer through the out-queue: the path can be on a slow network volume.
pub fn handle_locate(out: &SyncSender<String>, v: &Value) {
    let field = |k: &str| v.get(k).and_then(Value::as_str).unwrap_or_default();
    let (project, path) = (field("project").to_string(), field("path").to_string());
    let out = out.clone();
    std::thread::spawn(move || {
        let found = local_root(&project).and_then(|root| locate_path(root, path.clone()));
        let _ = out.try_send(locate_reply(&project, &path, found).to_string());
    });
}

fn locate_reply(project: &str, typed: &str, found: Result<LocatedPath, String>) -> Value {
    let mut reply = match found {
        Ok(at) => json!({ "ok": true, "kind": at.kind, "at": at.path, "rel": at.rel }),
        Err(e) => json!({ "ok": false, "error": e }),
    };
    reply["t"] = json!(LOCATE_FEATURE);
    reply["project"] = json!(project);
    reply["path"] = json!(typed);
    reply
}

fn local_root(project: &str) -> Result<String, String> {
    match crate::config::project_root(project)? {
        (_, true) => Err(format!("Files on an SSH host open on your {MACHINE}.")),
        (root, false) => Ok(root),
    }
}

/// The project's absolute root, for the phone's Copy Path, and the folder's rows.
fn list(project: &str, dir: &str) -> Result<(String, Vec<Value>), String> {
    let root = local_root(project)?;
    let rows = if Path::new(dir).is_absolute() {
        outside_rows(&root, dir)?
    } else {
        project_rows(&root, dir)?
    };
    Ok((root, rows))
}

/// A folder outside the project, by the path `locatePath` gave it. Git's say on
/// the project's files has nothing to add there.
fn outside_rows(root: &str, dir: &str) -> Result<Vec<Value>, String> {
    let mut entries = list_folder(root.to_string(), dir.to_string())?;
    entries.sort_by(compare_entries);
    Ok(entries.iter().map(|e| entry_json(e, &e.name, &[])).collect())
}

fn project_rows(root: &str, dir: &str) -> Result<Vec<Value>, String> {
    let dir = dir.trim_matches('/');
    let mut entries = list_dir_entries(root.to_string(), dir.to_string())?;
    entries.sort_by(compare_entries);
    let changed = git_changed_files(root.to_string());
    let prefix = if dir.is_empty() {
        String::new()
    } else {
        format!("{dir}/")
    };
    Ok(entries
        .iter()
        .map(|e| entry_json(e, &format!("{prefix}{}", e.name), &changed))
        .collect())
}

fn entry_json(entry: &DirEntryInfo, path: &str, changed: &[ChangedFile]) -> Value {
    let mut o = Map::new();
    o.insert("name".into(), json!(entry.name));
    o.insert("dir".into(), json!(entry.is_dir));
    o.insert("ignored".into(), json!(entry.is_ignored));
    if entry.is_dir {
        let below = format!("{path}/");
        let count = changed
            .iter()
            .filter(|c| c.path.starts_with(&below))
            .count();
        if count > 0 {
            o.insert("changed".into(), json!(count));
        }
    } else if let Some(c) = changed.iter().find(|c| c.path == path) {
        o.insert("status".into(), json!(c.status));
    }
    Value::Object(o)
}

/// Folders first, then names in natural order regardless of case — the order
/// the desktop's tree sorts the same listing into (treeModel.ts compareEntries).
fn compare_entries(a: &DirEntryInfo, b: &DirEntryInfo) -> Ordering {
    b.is_dir
        .cmp(&a.is_dir)
        .then_with(|| natural_cmp(&a.name, &b.name))
        .then_with(|| a.name.cmp(&b.name))
}

/// "file2" before "file10": runs of digits compare by value, the rest by
/// lowercase text.
fn natural_cmp(a: &str, b: &str) -> Ordering {
    let (mut a, mut b) = (a, b);
    loop {
        match (a.chars().next(), b.chars().next()) {
            (None, None) => return Ordering::Equal,
            (None, Some(_)) => return Ordering::Less,
            (Some(_), None) => return Ordering::Greater,
            (Some(x), Some(y)) if x.is_ascii_digit() && y.is_ascii_digit() => {
                let (na, ra) = split_digits(a);
                let (nb, rb) = split_digits(b);
                let (ta, tb) = (na.trim_start_matches('0'), nb.trim_start_matches('0'));
                let by_value = ta.len().cmp(&tb.len()).then_with(|| ta.cmp(tb));
                if by_value != Ordering::Equal {
                    return by_value;
                }
                (a, b) = (ra, rb);
            }
            (Some(x), Some(y)) => {
                let by_text = x.to_lowercase().cmp(y.to_lowercase());
                if by_text != Ordering::Equal {
                    return by_text;
                }
                (a, b) = (&a[x.len_utf8()..], &b[y.len_utf8()..]);
            }
        }
    }
}

fn split_digits(s: &str) -> (&str, &str) {
    let end = s.find(|c: char| !c.is_ascii_digit()).unwrap_or(s.len());
    s.split_at(end)
}

#[cfg(test)]
#[path = "remote_files_tests.rs"]
mod tests;
