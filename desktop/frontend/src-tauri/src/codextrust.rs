// Marks lpm's own Codex hooks as trusted.
//
// Codex 0.160 runs a hook only once the user has trusted it, keyed by the hook's
// place in hooks.json and a hash of what it runs. Each time lpm rewrites its
// hooks the hashes change, Codex asks again ("Hooks need review"), and a user who
// skips the prompt silently loses every Codex status. lpm installed these hooks,
// so it records the trust Codex itself would record for them — the same hash,
// under the same key — and only for entries carrying lpm's marker; any other
// hook still waits for the user's review.
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::path::Path;
use toml_edit::{value, DocumentMut, Item, Table};

/// Codex's key for an event (`hook_event_key_label` in codex-rs/hooks).
fn event_label(event: &str) -> Option<&'static str> {
    Some(match event {
        "PreToolUse" => "pre_tool_use",
        "PermissionRequest" => "permission_request",
        "PostToolUse" => "post_tool_use",
        "PreCompact" => "pre_compact",
        "PostCompact" => "post_compact",
        "SessionStart" => "session_start",
        "SessionEnd" => "session_end",
        "UserPromptSubmit" => "user_prompt_submit",
        "SubagentStart" => "subagent_start",
        "SubagentStop" => "subagent_stop",
        "Stop" => "stop",
        "Interrupt" => "interrupt",
        _ => return None,
    })
}

/// The timeout Codex normalizes a hook to when the entry sets none.
fn default_timeout(event: &str) -> u64 {
    match event {
        "SessionEnd" | "Interrupt" => 1,
        _ => 600,
    }
}

/// Codex's trust hash for one command hook: SHA-256 over the canonical JSON of
/// its normalized identity (`hook_hash` + `version_for_toml` in codex-rs).
fn hook_hash(event: &str, label: &str, matcher: Option<&str>, command: &str) -> String {
    let mut identity = json!({
        "event_name": label,
        "hooks": [{
            "type": "command",
            "command": command,
            "timeout": default_timeout(event),
            "async": false,
        }],
    });
    if let Some(matcher) = matcher {
        identity["matcher"] = json!(matcher);
    }
    let bytes = serde_json::to_vec(&canonical(&identity)).unwrap_or_default();
    let digest = Sha256::digest(bytes);
    format!("sha256:{}", hex::encode(digest))
}

fn canonical(v: &Value) -> Value {
    match v {
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            Value::Object(
                keys.into_iter()
                    .map(|k| (k.clone(), canonical(&map[k])))
                    .collect(),
            )
        }
        Value::Array(items) => Value::Array(items.iter().map(canonical).collect()),
        other => other.clone(),
    }
}

/// `config` with a trusted hash recorded for every lpm hook in `hooks_json`
/// (the content of `hooks_path`), or None when nothing needed to change or the
/// config can't be parsed — an unreadable config is never rewritten.
pub fn trust_lpm_hooks(
    config: &str,
    hooks_path: &Path,
    hooks_json: &Value,
    marker: &str,
) -> Option<String> {
    let mut doc: DocumentMut = config.parse().ok()?;
    let mut changed = false;
    let events = hooks_json.get("hooks")?.as_object()?;
    for (event, groups) in events {
        let Some(label) = event_label(event) else {
            continue;
        };
        for (gi, group) in groups.as_array().into_iter().flatten().enumerate() {
            let matcher = group.get("matcher").and_then(Value::as_str);
            for (hi, handler) in group
                .get("hooks")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .enumerate()
            {
                let Some(command) = handler.get("command").and_then(Value::as_str) else {
                    continue;
                };
                if !command.contains(marker)
                    || handler.get("type").and_then(Value::as_str) != Some("command")
                {
                    continue;
                }
                let key = format!("{}:{label}:{gi}:{hi}", hooks_path.display());
                let hash = hook_hash(event, label, matcher, command);
                changed |= set_trusted(&mut doc, &key, &hash)?;
            }
        }
    }
    changed.then(|| doc.to_string())
}

/// Record `hash` as the trusted hash of `[hooks.state."<key>"]`. None if the
/// config shapes `hooks`/`state` as something other than tables.
fn set_trusted(doc: &mut DocumentMut, key: &str, hash: &str) -> Option<bool> {
    let hooks = implicit_table(doc.as_table_mut(), "hooks")?;
    let state = implicit_table(hooks, "state")?;
    let entry = state
        .entry(key)
        .or_insert_with(|| Item::Table(Table::new()))
        .as_table_like_mut()?;
    if entry.get("trusted_hash").and_then(Item::as_str) == Some(hash) {
        return Some(false);
    }
    entry.insert("trusted_hash", value(hash));
    Some(true)
}

fn implicit_table<'a>(parent: &'a mut Table, name: &str) -> Option<&'a mut Table> {
    let item = parent.entry(name).or_insert_with(|| {
        let mut t = Table::new();
        t.set_implicit(true);
        Item::Table(t)
    });
    item.as_table_mut()
}

#[cfg(test)]
mod tests {
    use super::*;

    const MARKER: &str = "# lpm-hook";

    fn hooks(cmd_stop: &str) -> Value {
        json!({ "hooks": {
            "Stop": [
                { "hooks": [{ "type": "command", "command": "echo mine" }] },
                { "hooks": [{ "type": "command", "command": cmd_stop }] }
            ],
            "Interrupt": [{ "hooks": [{ "type": "command", "command": "x # lpm-hook" }] }]
        }})
    }

    // Recorded by Codex 0.160 itself after "Trust all" for these exact hooks.
    #[test]
    fn hashes_match_what_codex_records() {
        let cmd = "true # lpm-hook";
        assert_eq!(
            hook_hash("Stop", "stop", None, cmd),
            "sha256:82b9e928cc303856a10e17cedb5167f4d1cb939e1d7a1ecfad649a5d4930737a"
        );
        assert_eq!(
            hook_hash("Interrupt", "interrupt", None, cmd),
            "sha256:34e4afe9698bc575e247a9a3aaf0702397ed95fbd4503539acd431a651380ae6"
        );
        assert_eq!(
            hook_hash("PreToolUse", "pre_tool_use", Some("Bash"), cmd),
            "sha256:a751a5991b30409921f9f4d0bf045c8479c9a4215c032be9d5ccb467ad51ddef"
        );
    }

    #[test]
    fn trusts_only_lpms_own_hooks_at_their_own_index() {
        let path = Path::new("/home/u/.codex/hooks.json");
        let out = trust_lpm_hooks("model = \"m\"\n", path, &hooks("y # lpm-hook"), MARKER).unwrap();
        assert!(
            out.contains("[hooks.state.\"/home/u/.codex/hooks.json:stop:1:0\"]"),
            "{out}"
        );
        assert!(
            out.contains("[hooks.state.\"/home/u/.codex/hooks.json:interrupt:0:0\"]"),
            "{out}"
        );
        assert!(
            !out.contains("stop:0:0"),
            "the user's own hook is theirs to trust: {out}"
        );
        assert!(!out.contains("[hooks]\n"), "no empty parent tables: {out}");
        assert!(out.starts_with("model = \"m\""), "{out}");
        assert_eq!(
            trust_lpm_hooks(&out, path, &hooks("y # lpm-hook"), MARKER),
            None,
            "idempotent"
        );
        let changed = trust_lpm_hooks(&out, path, &hooks("z # lpm-hook"), MARKER).unwrap();
        assert_ne!(changed, out, "a changed hook is trusted again");
    }

    #[test]
    fn an_unparsable_config_is_left_alone() {
        let path = Path::new("/h/.codex/hooks.json");
        assert_eq!(
            trust_lpm_hooks("[broken", path, &hooks("y # lpm-hook"), MARKER),
            None
        );
    }
}
