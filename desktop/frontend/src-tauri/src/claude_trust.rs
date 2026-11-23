// A copy lpm makes of a folder Claude Code already trusts starts out trusted
// too, so its first Claude tab opens on the prompt instead of the folder-trust
// question, whose preselected answer is "No, exit". Each account keeps its
// answers in its own `.claude.json`, so each is marked only where it trusts the
// source; a folder nobody trusted keeps asking.
//
// The file is large, rewritten often by every running Claude, and its key order
// is the user's, so only the copy's entry is spliced in: every other value is
// written back exactly as it was read.
use serde::de::{Deserialize, Deserializer, MapAccess, Visitor};
use serde_json::value::RawValue;
use std::borrow::Cow;
use serde_json::Value;
use std::fmt;
use std::io::Write;
use std::path::{Path, PathBuf};

const TRUSTED: &str = "hasTrustDialogAccepted";

/// Marks `copy` trusted in every account that trusts `source`. Never fails the
/// copy: a file it can't update is left alone.
pub(crate) fn carry_trust(source: &Path, copy: &Path) {
    let Some(name) = copy.file_name().and_then(|n| n.to_str()) else {
        return;
    };
    if copy.parent() != source.parent() {
        return;
    }
    let source_keys = keys_of(source);
    let mut done: Vec<PathBuf> = Vec::new();
    for id in crate::agent_limits_login::login_ids() {
        let file = crate::claude_pool_members::claude_json_path(&id);
        if done.contains(&file) {
            continue;
        }
        if let Err(e) = carry_in(&file, &source_keys, name) {
            eprintln!("claude trust: {}: {e}", file.display());
        }
        done.push(file);
    }
}

/// The spellings Claude may have filed `dir` under: as configured, and with
/// links resolved, as its working directory reports it.
fn keys_of(dir: &Path) -> Vec<String> {
    let mut keys = crate::agent_sessions::root_spellings(&dir.to_string_lossy());
    if cfg!(windows) {
        let slashed: Vec<String> = keys.iter().map(|k| k.replace('\\', "/")).collect();
        keys.extend(slashed);
    }
    keys.dedup();
    keys
}

fn carry_in(file: &Path, source_keys: &[String], copy_name: &str) -> Result<(), String> {
    for _ in 0..5 {
        let Ok(meta) = std::fs::metadata(file) else {
            return Ok(());
        };
        let text = std::fs::read_to_string(file).map_err(|e| e.to_string())?;
        let Some(next) = with_copy_trusted(&text, source_keys, copy_name)? else {
            return Ok(());
        };
        if write_if_unchanged(file, &meta, &next)? {
            return Ok(());
        }
    }
    Err("kept changing while it was being updated".into())
}

/// `text` with the copy marked trusted, or None when the source isn't trusted
/// there or the copy already is. The copy is a sibling of the source, so its
/// key is the source's with the last folder swapped, in the same spelling.
fn with_copy_trusted(text: &str, source_keys: &[String], copy_name: &str) -> Result<Option<String>, String> {
    let mut top = Ordered::parse(text)?;
    let Some(projects_text) = top.raw("projects") else {
        return Ok(None);
    };
    let mut projects = Ordered::parse(projects_text)?;
    let Some(source_key) = source_keys.iter().find(|k| projects.raw(k).is_some_and(trusted)) else {
        return Ok(None);
    };
    let Some(cut) = source_key.rfind(['/', '\\']) else {
        return Ok(None);
    };
    let copy_key = format!("{}{copy_name}", &source_key[..=cut]);
    if projects.raw(&copy_key).is_some_and(trusted) {
        return Ok(None);
    }

    let entry = match projects.raw(&copy_key) {
        Some(raw) => {
            let mut fields = Ordered::parse(raw)?;
            fields.set(TRUSTED, "true".into());
            fields.text(2)
        }
        None => format!("{{\n      \"{TRUSTED}\": true\n    }}"),
    };
    projects.set(&copy_key, entry);
    top.set("projects", projects.text(1));
    let mut next = top.text(0);
    if text.ends_with('\n') {
        next.push('\n');
    }

    let mut expected: Value = serde_json::from_str(text).map_err(|e| e.to_string())?;
    let slot = &mut expected["projects"][copy_key.as_str()];
    if !slot.is_object() {
        *slot = Value::Object(Default::default());
    }
    slot[TRUSTED] = Value::Bool(true);
    let got: Value = serde_json::from_str(&next).map_err(|e| e.to_string())?;
    if got != expected {
        return Err("rewrite would change more than the copy's trust".into());
    }
    Ok(Some(next))
}

fn trusted(raw: &str) -> bool {
    serde_json::from_str::<Value>(raw)
        .ok()
        .and_then(|v| v.get(TRUSTED).and_then(Value::as_bool))
        .unwrap_or(false)
}

/// Replaces the file the way Claude Code does (a temp file renamed over it),
/// unless it changed since it was read; false means read it again.
fn write_if_unchanged(file: &Path, meta: &std::fs::Metadata, text: &str) -> Result<bool, String> {
    let stamp = (meta.modified().ok(), meta.len());
    let mut changed = false;
    let written = crate::fsatomic::write_with(file, crate::fsatomic::Mode::Preserve(0o600), |f| {
        f.write_all(text.as_bytes())?;
        changed = std::fs::metadata(file)
            .ok()
            .map(|m| (m.modified().ok(), m.len()))
            != Some(stamp);
        if changed {
            return Err(std::io::ErrorKind::Interrupted.into());
        }
        Ok(())
    });
    match written {
        Ok(()) => Ok(true),
        Err(_) if changed => Ok(false),
        Err(e) => Err(e.to_string()),
    }
}

/// A JSON object's members in file order, each value as its original text,
/// borrowed from the file until it is replaced.
struct Ordered<'a>(Vec<(String, Cow<'a, str>)>);

impl<'a> Ordered<'a> {
    fn parse(text: &'a str) -> Result<Self, String> {
        serde_json::from_str(text).map_err(|e| e.to_string())
    }

    /// A member's original text; None once it has been replaced.
    fn raw(&self, key: &str) -> Option<&'a str> {
        match self.0.iter().find(|(k, _)| k == key)?.1 {
            Cow::Borrowed(text) => Some(text),
            Cow::Owned(_) => None,
        }
    }

    fn set(&mut self, key: &str, value: String) {
        match self.0.iter_mut().find(|(k, _)| k == key) {
            Some((_, v)) => *v = Cow::Owned(value),
            None => self.0.push((key.to_string(), Cow::Owned(value))),
        }
    }

    /// The object as `JSON.stringify(_, null, 2)` writes it at nesting `depth`.
    fn text(&self, depth: usize) -> String {
        if self.0.is_empty() {
            return "{}".into();
        }
        let inner = "  ".repeat(depth + 1);
        let members: Vec<String> = self
            .0
            .iter()
            .map(|(k, v)| format!("{inner}{}: {v}", Value::String(k.clone())))
            .collect();
        format!("{{\n{}\n{}}}", members.join(",\n"), "  ".repeat(depth))
    }
}

impl<'de> Deserialize<'de> for Ordered<'de> {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        struct Members;
        impl<'de> Visitor<'de> for Members {
            type Value = Ordered<'de>;
            fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
                f.write_str("a JSON object")
            }
            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Ordered<'de>, A::Error> {
                let mut members = Vec::new();
                while let Some((k, v)) = map.next_entry::<String, &'de RawValue>()? {
                    members.push((k, Cow::Borrowed(v.get())));
                }
                Ok(Ordered(members))
            }
        }
        d.deserialize_map(Members)
    }
}

#[cfg(test)]
#[path = "claude_trust_tests.rs"]
mod tests;
