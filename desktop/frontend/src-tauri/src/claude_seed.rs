// One-way, field-selective seed of `.claude.json` into an account's config dir.
//
// Claude Code keeps onboarding state, per-directory trust, accumulated tool
// grants and user-scope MCP servers in `.claude.json` inside the config dir, so
// a fresh account dir replays onboarding and re-asks "do you trust the files in
// this folder?" for every project — inside a background action that reads as a
// hang. Copying the whole file would clone `oauthAccount` and defeat the
// isolation accounts exist for, so only a fixed allowlist is merged, at spawn
// time, and a key already present in the destination always wins so per-account
// decisions the user makes later stick.

use serde_json::Value;
use std::path::Path;

const TOP_LEVEL_KEYS: &[&str] = &["hasCompletedOnboarding", "mcpServers"];
const PROJECT_KEYS: &[&str] = &[
    "hasTrustDialogAccepted",
    "allowedTools",
    "mcpServers",
    "enabledMcpjsonServers",
    "disabledMcpjsonServers",
    "mcpContextUris",
];

/// Seed `account_dir/.claude.json` from the ambient `~/.claude.json` for one
/// project root. Best-effort: seeding must never fail a spawn, so every error
/// is swallowed and a no-op merge skips the write entirely.
pub fn seed(account_dir: &Path, project_root: &str) {
    let Some(home) = dirs::home_dir() else {
        return;
    };
    seed_from(
        &home.join(".claude.json"),
        &account_dir.join(".claude.json"),
        project_root,
    );
}

fn seed_from(src: &Path, dst: &Path, project_root: &str) {
    let Ok(bytes) = std::fs::read(src) else {
        return;
    };
    let Ok(src_json) = serde_json::from_slice::<Value>(&bytes) else {
        return;
    };
    let mut dst_json = std::fs::read(dst)
        .ok()
        .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
        .unwrap_or_else(|| Value::Object(Default::default()));
    if !dst_json.is_object() || !merge(&src_json, &mut dst_json, project_root) {
        return;
    }
    let Ok(data) = serde_json::to_vec_pretty(&dst_json) else {
        return;
    };
    // 0600 like Claude Code's own writes — the file holds oauthAccount once the
    // account signs in.
    let _ = crate::fsatomic::write(dst, &data, crate::fsatomic::Mode::Preserve(0o600));
}

fn merge(src: &Value, dst: &mut Value, project_root: &str) -> bool {
    let mut changed = false;
    for key in TOP_LEVEL_KEYS {
        changed |= copy_absent(src, dst, key);
    }
    if let Some(src_proj) = src.get("projects").and_then(|p| p.get(project_root)) {
        let projects = dst
            .as_object_mut()
            .unwrap()
            .entry("projects")
            .or_insert_with(|| Value::Object(Default::default()));
        if let Some(map) = projects.as_object_mut() {
            let entry = map
                .entry(project_root)
                .or_insert_with(|| Value::Object(Default::default()));
            if entry.is_object() {
                for key in PROJECT_KEYS {
                    changed |= copy_absent(src_proj, entry, key);
                }
            }
        }
    }
    changed
}

fn copy_absent(src: &Value, dst: &mut Value, key: &str) -> bool {
    let Some(v) = src.get(key) else {
        return false;
    };
    let Some(obj) = dst.as_object_mut() else {
        return false;
    };
    if obj.contains_key(key) {
        return false;
    }
    obj.insert(key.to_string(), v.clone());
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const ROOT: &str = "/Users/me/proj";

    fn ambient() -> Value {
        json!({
            "hasCompletedOnboarding": true,
            "oauthAccount": {"emailAddress": "a@b.c", "accountUuid": "u"},
            "userID": "hash",
            "mcpServers": {"docs": {"command": "docs-mcp"}},
            "projects": {
                ROOT: {
                    "hasTrustDialogAccepted": true,
                    "allowedTools": ["Bash(npm test)"],
                    "history": [{"display": "secret prompt"}],
                },
                "/Users/me/other": {"hasTrustDialogAccepted": true},
            },
        })
    }

    fn run(dst_initial: Option<Value>) -> Value {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("src.json");
        let dst = dir.path().join("dst.json");
        std::fs::write(&src, serde_json::to_vec(&ambient()).unwrap()).unwrap();
        if let Some(v) = dst_initial {
            std::fs::write(&dst, serde_json::to_vec(&v).unwrap()).unwrap();
        }
        seed_from(&src, &dst, ROOT);
        std::fs::read(&dst)
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or(Value::Null)
    }

    #[test]
    fn copies_allowlist_only() {
        let out = run(None);
        assert_eq!(out["hasCompletedOnboarding"], json!(true));
        assert_eq!(out["mcpServers"]["docs"]["command"], json!("docs-mcp"));
        let proj = &out["projects"][ROOT];
        assert_eq!(proj["hasTrustDialogAccepted"], json!(true));
        assert_eq!(proj["allowedTools"], json!(["Bash(npm test)"]));
        // Identity, telemetry, history and unrelated projects must not travel.
        assert!(out.get("oauthAccount").is_none());
        assert!(out.get("userID").is_none());
        assert!(proj.get("history").is_none());
        assert!(out["projects"].get("/Users/me/other").is_none());
    }

    #[test]
    fn existing_destination_keys_win() {
        let out = run(Some(json!({
            "oauthAccount": {"emailAddress": "work@co"},
            "projects": {ROOT: {"allowedTools": []}},
        })));
        assert_eq!(out["oauthAccount"]["emailAddress"], json!("work@co"));
        assert_eq!(out["projects"][ROOT]["allowedTools"], json!([]));
        // Absent keys still fill in around the kept ones.
        assert_eq!(out["projects"][ROOT]["hasTrustDialogAccepted"], json!(true));
    }

    #[test]
    fn missing_ambient_file_is_a_noop() {
        let dir = tempfile::tempdir().unwrap();
        let dst = dir.path().join("dst.json");
        seed_from(&dir.path().join("absent.json"), &dst, ROOT);
        assert!(!dst.exists());
    }
}
