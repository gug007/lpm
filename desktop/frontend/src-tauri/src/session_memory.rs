// Migration: strip the Claude Code SessionStart hook that earlier builds of lpm
// installed into ~/.claude/settings.json.
//
// Session memory (`~/.lpm/memory/<project>/*.md`) is invocation-only — an agent
// reaches it through the lpm-memory skill when the user asks, by name or via
// /lpm-memory. It briefly also injected a session index automatically at every
// Claude session start; that is gone, but builds from that window already wrote
// the hook onto real machines, and nothing else would ever take it back out. So
// this module keeps only the removal half, runs it on every launch, and can be
// deleted once those builds are far enough behind us.
//
// The entry is recognised by its `# lpm-memory` marker, deliberately neither a
// superstring nor a substring of hooks.rs's `# lpm-hook` (agent status) or
// `# lpm-statusline:` (usage meters), so stripping ours never disturbs theirs.
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};

const MARKER: &str = "# lpm-memory";
const INVALID_SETTINGS: &str =
    "~/.claude/settings.json isn't valid JSON. Fix it in an editor, then try again.";

fn claude_settings_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_default()
        .join(".claude")
        .join("settings.json")
}

fn has_marker(entry: &Value) -> bool {
    serde_json::to_string(entry)
        .map(|s| s.contains(MARKER))
        .unwrap_or(false)
}

/// Drop our own hook entries, keeping every other entry — the user's and the
/// other lpm features'. An event key is removed only when *we* emptied it: an
/// array the user left empty is theirs, and rewriting the file to tidy it would
/// mean this cleanup edits settings it found nothing of ours in.
fn strip_memory_hooks(hooks: &mut Map<String, Value>) {
    let events: Vec<String> = hooks.keys().cloned().collect();
    for ev in events {
        let Some(arr) = hooks.get_mut(&ev).and_then(Value::as_array_mut) else {
            continue;
        };
        let before = arr.len();
        arr.retain(|entry| !has_marker(entry));
        if arr.is_empty() && arr.len() != before {
            hooks.remove(&ev);
        }
    }
}

fn parse_settings(data: &[u8]) -> Result<Value, String> {
    let value: Value = serde_json::from_slice(data).map_err(|_| INVALID_SETTINGS.to_string())?;
    if !value.is_object() {
        return Err(INVALID_SETTINGS.to_string());
    }
    Ok(value)
}

/// Ok(Some(bytes)) when settings need rewriting, Ok(None) when there is nothing
/// of ours left, Err when the file isn't JSON we may touch. Pure, so the
/// transform is tested without a filesystem.
fn remove_hook(data: &[u8]) -> Result<Option<Vec<u8>>, String> {
    let original = parse_settings(data)?;
    let mut settings = original.clone();
    if let Some(hooks) = settings.get_mut("hooks").and_then(Value::as_object_mut) {
        strip_memory_hooks(hooks);
    }
    if settings == original {
        return Ok(None);
    }
    serde_json::to_string_pretty(&settings)
        .map(|s| Some(s.into_bytes()))
        .map_err(|e| e.to_string())
}

fn remove_at(path: &Path) -> Result<(), String> {
    let Ok(data) = std::fs::read(path) else {
        return Ok(()); // no file -> nothing was ever installed
    };
    let Some(out) = remove_hook(&data)? else {
        return Ok(());
    };
    crate::fsatomic::write(path, &out, crate::fsatomic::Mode::Preserve(0o644))
        .map_err(|e| format!("cannot write Claude settings: {e}"))
}

/// Best-effort on every launch: take back the hook earlier builds installed.
/// Never creates the settings file or its parent, never rewrites invalid JSON,
/// and writes only when the bytes would change — so for the overwhelming
/// majority of launches this reads one file and stops.
pub fn cleanup_at_startup() {
    let _ = remove_at(&claude_settings_path());
}

pub fn remove_for_uninstall() -> Result<(), String> {
    remove_at(&claude_settings_path())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const STATUS_HOOK: &str = "set_status x # lpm-hook";
    const STATUSLINE: &str = "printf hi # lpm-statusline:eyJ4IjoxfQ==";
    // The two shapes earlier builds wrote: the first read `.lpm/memory` inside
    // the checkout, the second `$HOME/.lpm/memory/$p`. Either may be on a real
    // machine, and both are recognised by the marker alone.
    const LEGACY_IN_REPO: &str = "d=.lpm/memory; [ -d \"$d\" ] || exit 0; exit 0 # lpm-memory";
    const LEGACY_GLOBAL: &str =
        "p=\"${LPM_PROJECT_NAME:-${PWD##*/}}\"; d=\"$HOME/.lpm/memory/$p\"; exit 0 # lpm-memory";

    /// Settings as an earlier build left them: our SessionStart hook alongside
    /// all three other marker families and the user's own hooks.
    fn installed_settings() -> String {
        json!({
            "model": "opus",
            "statusLine": { "type": "command", "command": STATUSLINE },
            "hooks": {
                "Stop": [
                    { "matcher": "", "hooks": [{ "type": "command", "command": STATUS_HOOK }] },
                    { "matcher": "", "hooks": [{ "type": "command", "command": "my-own-hook" }] }
                ],
                "SessionStart": [
                    { "matcher": "startup", "hooks": [{ "type": "command", "command": "user-session-start" }] },
                    { "matcher": "startup|clear", "hooks": [{ "type": "command", "command": LEGACY_IN_REPO }] },
                    { "matcher": "startup|clear", "hooks": [{ "type": "command", "command": LEGACY_GLOBAL }] }
                ]
            }
        })
        .to_string()
    }

    fn settings_at(dir: &Path, body: &str) -> PathBuf {
        let path = dir.join("settings.json");
        std::fs::write(&path, body).unwrap();
        path
    }

    fn read_json(path: &Path) -> Value {
        serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap()
    }

    fn memory_entries(v: &Value) -> Vec<Value> {
        v["hooks"]["SessionStart"]
            .as_array()
            .map(|a| a.iter().filter(|e| has_marker(e)).cloned().collect())
            .unwrap_or_default()
    }

    #[test]
    fn strips_every_shape_earlier_builds_installed() {
        let dir = tempfile::tempdir().unwrap();
        let path = settings_at(dir.path(), &installed_settings());
        assert_eq!(memory_entries(&read_json(&path)).len(), 2);

        remove_at(&path).unwrap();
        let v = read_json(&path);
        assert!(memory_entries(&v).is_empty(), "both entries must be gone");
        // The user's own SessionStart hook survives, so the event key stays.
        let start = v["hooks"]["SessionStart"].as_array().unwrap();
        assert_eq!(start.len(), 1);
        assert_eq!(start[0]["hooks"][0]["command"], "user-session-start");
    }

    #[test]
    fn cleanup_is_idempotent_and_leaves_a_clean_file_untouched() {
        let dir = tempfile::tempdir().unwrap();
        let path = settings_at(dir.path(), &installed_settings());
        remove_at(&path).unwrap();
        let after = std::fs::read(&path).unwrap();
        // Second and third passes must not rewrite a byte — this runs at every
        // launch forever, long after the hook is gone.
        remove_at(&path).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), after);
        remove_at(&path).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), after);

        // A file that never had our hook is never touched, formatting included.
        let pristine = r#"{"model":"opus","hooks":{"Stop":[]}}"#;
        let untouched = settings_at(dir.path(), pristine);
        remove_at(&untouched).unwrap();
        assert_eq!(std::fs::read_to_string(&untouched).unwrap(), pristine);
    }

    /// Our strip keys on `# lpm-memory`; the status hooks' keys on `# lpm-hook`.
    /// Neither marker contains the other, so each feature only takes its own.
    #[test]
    fn strip_leaves_the_other_lpm_hook_families_alone() {
        let dir = tempfile::tempdir().unwrap();
        let path = settings_at(dir.path(), &installed_settings());
        remove_at(&path).unwrap();

        let v = read_json(&path);
        let stop = v["hooks"]["Stop"].as_array().unwrap();
        assert_eq!(stop.len(), 2);
        assert_eq!(stop[0]["hooks"][0]["command"], STATUS_HOOK);
        assert_eq!(stop[1]["hooks"][0]["command"], "my-own-hook");
        assert_eq!(v["statusLine"]["command"], STATUSLINE);
    }

    #[test]
    fn the_status_hook_strip_leaves_our_entry_alone() {
        // The mirror direction: hooks.rs strips by `# lpm-hook`, which must not
        // reach our entries — otherwise the two features would fight.
        let mut settings: Value = serde_json::from_str(&installed_settings()).unwrap();
        let hooks = settings["hooks"].as_object_mut().unwrap();
        let events: Vec<String> = hooks.keys().cloned().collect();
        for ev in events {
            let Some(arr) = hooks.get_mut(&ev).and_then(Value::as_array_mut) else {
                continue;
            };
            arr.retain(|e| {
                !serde_json::to_string(e)
                    .map(|s| s.contains("# lpm-hook"))
                    .unwrap_or(false)
            });
            if arr.is_empty() {
                hooks.remove(&ev);
            }
        }
        assert_eq!(memory_entries(&settings).len(), 2, "ours must survive");
        assert!(
            !serde_json::to_string(&settings["hooks"])
                .unwrap()
                .contains("# lpm-hook"),
            "the status hooks' own strip should have removed their entry"
        );
    }

    #[test]
    fn invalid_settings_are_never_rewritten() {
        let dir = tempfile::tempdir().unwrap();
        let broken = "{ this is not json";
        let path = settings_at(dir.path(), broken);
        assert!(remove_at(&path).is_err());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), broken);

        // A JSON document that isn't an object is equally off limits.
        let arr = settings_at(dir.path(), "[1,2]");
        assert!(remove_at(&arr).is_err());
        assert_eq!(std::fs::read_to_string(&arr).unwrap(), "[1,2]");
    }

    #[test]
    fn cleanup_never_creates_a_settings_file() {
        let dir = tempfile::tempdir().unwrap();
        // A Mac that never ran Claude Code must come away with no ~/.claude.
        let missing = dir.path().join(".claude").join("settings.json");
        remove_at(&missing).unwrap();
        assert!(!missing.exists());
        assert!(!missing.parent().unwrap().exists());
    }
}
