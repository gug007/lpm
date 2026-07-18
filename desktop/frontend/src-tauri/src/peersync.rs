// Mac-to-Mac config sync — shared digest / diff / apply logic.
//
// Both roles run the same binary, so this module is used by peer.rs (host,
// answering syncDigest/syncFetch/syncApply frames) and peerclient.rs (client,
// driving a sync from `peer_sync_status` / `peer_sync_run`). It never touches the
// wire itself; it only computes portable-content digests, decides direction, and
// reads/writes the individual config files under ~/.lpm.
//
// A "portable digest" hashes a canonicalized form of a config unit with the
// machine-local parts removed, so two Macs whose projects differ only in local
// paths / accounts compare as identical. Direction is newest-wins on file mtime.
// Nothing is ever deleted; projects are only synced when present on both Macs.
use crate::config;
use serde::{Deserialize, Serialize};
use serde_json::Value as Json;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Component, Path, PathBuf};

/// Advertised in the host's `ready` frame; the client refuses to sync (with a
/// "the other Mac needs to update lpm" error) when it is absent.
pub const SYNC_FEATURE: &str = "configSync";

/// Project keys stripped before hashing and preserved locally on apply — the
/// machine-specific parts a synced project must not carry between Macs.
const PROJECT_LOCAL_KEYS: [&str; 4] = ["root", "ssh", "claudeAccount", "parent_name"];

/// Whole-file global config units under ~/.lpm (settings.json gets a special
/// digest + merge; the rest are byte-identical replace, newest wins).
const GLOBAL_FILES: [&str; 8] = [
    "global.yml",
    "settings.json",
    "groups.json",
    "composer-actions.json",
    "generators.json",
    "commit-instructions.txt",
    "pr-title-instructions.txt",
    "pr-description-instructions.txt",
];

/// Global config directories synced file-by-file (each file is its own unit,
/// keyed by its `<dir>/<name>` path relative to ~/.lpm).
const GLOBAL_DIRS: [&str; 2] = ["generator-icons", "zdotdir"];

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ItemDigest {
    pub hash: String,
    pub mtime: i64,
}

#[derive(Serialize, Deserialize, Default, Clone, Debug)]
pub struct DigestMap {
    pub projects: BTreeMap<String, ItemDigest>,
    pub globals: BTreeMap<String, ItemDigest>,
    pub templates: BTreeMap<String, ItemDigest>,
    /// Direct `extends:` refs per project, so the client can compute which
    /// templates a matched project references on either side.
    #[serde(rename = "projectExtends", default)]
    pub project_extends: BTreeMap<String, Vec<String>>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SyncItem {
    pub kind: String,      // "project" | "global" | "template"
    pub name: String,      // project/template name, or global relative path
    pub direction: String, // "toLocal" | "toRemote"
    pub local_mtime: i64,
    pub remote_mtime: i64,
}

/// A config unit's content on the wire (fetch reply / apply request). Text files
/// travel as UTF-8; binaries (and any non-UTF-8 file) as base64.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WireItem {
    pub kind: String,
    pub name: String,
    pub enc: String, // "text" | "b64"
    pub content: String,
    pub mtime: i64,
}

// ---- digest map --------------------------------------------------------------

/// This Mac's full digest map across projects, globals, and templates.
pub fn local_digest_map() -> DigestMap {
    let mut dm = DigestMap::default();
    let lpm = config::lpm_dir();

    for name in config::project_names() {
        let path = config::project_path(&name);
        let Ok(bytes) = std::fs::read(&path) else {
            continue;
        };
        if let Ok(hash) = project_digest(&bytes) {
            dm.projects.insert(
                name.clone(),
                ItemDigest {
                    hash,
                    mtime: mtime_millis(&path),
                },
            );
            dm.project_extends.insert(name.clone(), extends_of(&bytes));
        }
    }

    for f in GLOBAL_FILES {
        let path = lpm.join(f);
        let Ok(bytes) = std::fs::read(&path) else {
            continue;
        };
        if let Ok(hash) = global_digest(f, &bytes) {
            dm.globals.insert(
                f.to_string(),
                ItemDigest {
                    hash,
                    mtime: mtime_millis(&path),
                },
            );
        }
    }
    for d in GLOBAL_DIRS {
        collect_global_dir(&lpm, Path::new(d), &mut dm.globals);
    }

    if let Ok(entries) = std::fs::read_dir(config::templates_dir()) {
        for e in entries.flatten() {
            let path = e.path();
            let is_yaml = matches!(
                path.extension().and_then(|x| x.to_str()),
                Some("yml") | Some("yaml")
            );
            if !is_yaml {
                continue;
            }
            let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            let Ok(bytes) = std::fs::read(&path) else {
                continue;
            };
            dm.templates.insert(
                stem.to_string(),
                ItemDigest {
                    hash: sha256_hex(&bytes),
                    mtime: mtime_millis(&path),
                },
            );
        }
    }

    dm
}

/// Recursively index every file under `lpm/<rel>` into `out`, keyed by its path
/// relative to `lpm` (posix-style, matching the wire naming).
fn collect_global_dir(lpm: &Path, rel: &Path, out: &mut BTreeMap<String, ItemDigest>) {
    let dir = lpm.join(rel);
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return;
    };
    for e in entries.flatten() {
        let name = e.file_name();
        let child_rel = rel.join(&name);
        let path = e.path();
        let Ok(meta) = std::fs::symlink_metadata(&path) else {
            continue;
        };
        if meta.file_type().is_symlink() {
            continue;
        }
        if meta.is_dir() {
            collect_global_dir(lpm, &child_rel, out);
        } else if meta.is_file() {
            if let Ok(bytes) = std::fs::read(&path) {
                let key = child_rel.to_string_lossy().replace('\\', "/");
                out.insert(
                    key,
                    ItemDigest {
                        hash: sha256_hex(&bytes),
                        mtime: mtime_millis(&path),
                    },
                );
            }
        }
    }
}

fn global_digest(relpath: &str, bytes: &[u8]) -> Result<String, String> {
    if relpath == "settings.json" {
        settings_digest(bytes)
    } else {
        Ok(sha256_hex(bytes))
    }
}

/// Portable project digest: parse the YAML, drop the machine-local keys, hash a
/// canonical (key-sorted) form so ordering/formatting differences don't matter.
fn project_digest(bytes: &[u8]) -> Result<String, String> {
    let y: serde_yaml::Value = serde_yaml::from_slice(bytes).map_err(|e| e.to_string())?;
    let mut j = yaml_to_json(&y);
    if let Json::Object(map) = &mut j {
        for k in PROJECT_LOCAL_KEYS {
            map.remove(k);
        }
    }
    Ok(hash_canonical(&j))
}

/// settings.json digest with the per-machine keys removed, so window bounds /
/// last-selected-project never make two Macs look out of sync.
pub(crate) fn settings_digest(bytes: &[u8]) -> Result<String, String> {
    let mut j: Json = serde_json::from_slice(bytes).map_err(|e| e.to_string())?;
    if let Json::Object(map) = &mut j {
        for k in crate::transfer::PER_MACHINE_KEYS {
            map.remove(k);
        }
    }
    Ok(hash_canonical(&j))
}

#[derive(Deserialize, Default)]
struct ExtendsOnly {
    #[serde(default)]
    extends: Vec<String>,
}

fn extends_of(bytes: &[u8]) -> Vec<String> {
    serde_yaml::from_slice::<ExtendsOnly>(bytes)
        .map(|e| e.extends)
        .unwrap_or_default()
}

// ---- diff --------------------------------------------------------------------

/// The items whose portable content differs between the two maps, each tagged
/// with the direction the newer copy flows. Projects are intersection-only;
/// globals union (a one-sided global is created on the other Mac); templates are
/// limited to those referenced by a matched project on either side.
pub fn compute_plan(local: &DigestMap, remote: &DigestMap) -> Vec<SyncItem> {
    let mut items = Vec::new();

    for (name, l) in &local.projects {
        if let Some(r) = remote.projects.get(name) {
            if l.hash != r.hash {
                items.push(make_item("project", name, l.mtime, r.mtime));
            }
        }
    }

    let mut global_keys: BTreeSet<&String> = local.globals.keys().collect();
    global_keys.extend(remote.globals.keys());
    for name in global_keys {
        match (local.globals.get(name), remote.globals.get(name)) {
            (Some(l), Some(r)) if l.hash != r.hash => {
                items.push(make_item("global", name, l.mtime, r.mtime))
            }
            (Some(l), None) => items.push(make_item("global", name, l.mtime, 0)),
            (None, Some(r)) => items.push(make_item("global", name, 0, r.mtime)),
            _ => {}
        }
    }

    for name in referenced_templates(local, remote) {
        match (local.templates.get(&name), remote.templates.get(&name)) {
            (Some(l), Some(r)) if l.hash != r.hash => {
                items.push(make_item("template", &name, l.mtime, r.mtime))
            }
            (Some(l), None) => items.push(make_item("template", &name, l.mtime, 0)),
            (None, Some(r)) => items.push(make_item("template", &name, 0, r.mtime)),
            _ => {}
        }
    }

    items
}

fn make_item(kind: &str, name: &str, local_mtime: i64, remote_mtime: i64) -> SyncItem {
    let direction = if remote_mtime > local_mtime {
        "toLocal"
    } else {
        "toRemote"
    };
    SyncItem {
        kind: kind.to_string(),
        name: name.to_string(),
        direction: direction.to_string(),
        local_mtime,
        remote_mtime,
    }
}

/// Template names directly `extends`-referenced by any project present on both
/// Macs, taking the refs from either side's copy of that project.
fn referenced_templates(local: &DigestMap, remote: &DigestMap) -> BTreeSet<String> {
    let mut refs = BTreeSet::new();
    for name in local.projects.keys() {
        if !remote.projects.contains_key(name) {
            continue;
        }
        if let Some(list) = local.project_extends.get(name) {
            refs.extend(list.iter().cloned());
        }
        if let Some(list) = remote.project_extends.get(name) {
            refs.extend(list.iter().cloned());
        }
    }
    refs
}

// ---- read (fetch) ------------------------------------------------------------

/// Read a config unit for sending over the wire. Binaries and any non-UTF-8 file
/// are base64-encoded; text files travel verbatim.
pub fn read_item(kind: &str, name: &str) -> Result<WireItem, String> {
    let path = read_path(kind, name)?;
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let mtime = mtime_millis(&path);
    let binary = kind == "global" && name.starts_with("generator-icons/");
    let (enc, content) = match (!binary)
        .then(|| std::str::from_utf8(&bytes).ok())
        .flatten()
    {
        Some(s) => ("text".to_string(), s.to_string()),
        None => ("b64".to_string(), base64_encode(&bytes)),
    };
    Ok(WireItem {
        kind: kind.to_string(),
        name: name.to_string(),
        enc,
        content,
        mtime,
    })
}

fn read_path(kind: &str, name: &str) -> Result<PathBuf, String> {
    match kind {
        "project" => {
            config::validate_name(name)?;
            Ok(config::project_path(name))
        }
        "template" => template_read_path(name).ok_or_else(|| format!("template not found: {name}")),
        "global" => Ok(config::lpm_dir().join(safe_global_rel(name)?)),
        _ => Err(format!("unknown item kind: {kind}")),
    }
}

fn template_read_path(name: &str) -> Option<PathBuf> {
    validate_simple_name(name).ok()?;
    for ext in ["yml", "yaml"] {
        let p = config::templates_dir().join(format!("{name}.{ext}"));
        if p.exists() {
            return Some(p);
        }
    }
    None
}

// ---- apply -------------------------------------------------------------------

/// Apply one received unit locally using the portable-merge rules. Projects are
/// never created (only updated, preserving local machine keys); templates and
/// globals may be created. Returns the changed kinds implicitly via Ok(()).
pub fn apply_item(item: &WireItem) -> Result<(), String> {
    let bytes = decode(item)?;
    match item.kind.as_str() {
        "project" => apply_project(&item.name, &bytes)?,
        "template" => apply_template(&item.name, &bytes)?,
        "global" => apply_global(&item.name, &bytes)?,
        other => return Err(format!("unknown item kind: {other}")),
    }
    Ok(())
}

fn apply_project(name: &str, incoming: &[u8]) -> Result<(), String> {
    config::validate_name(name)?;
    let path = config::project_path(name);
    if !path.exists() {
        return Err(format!("project not present locally: {name}"));
    }
    let mut incoming_v: serde_yaml::Value =
        serde_yaml::from_slice(incoming).map_err(|e| e.to_string())?;
    let local_v: serde_yaml::Value =
        serde_yaml::from_slice(&std::fs::read(&path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    if let serde_yaml::Value::Mapping(map) = &mut incoming_v {
        for k in PROJECT_LOCAL_KEYS {
            let key = serde_yaml::Value::String(k.to_string());
            match local_v.get(k) {
                Some(v) => {
                    map.insert(key, v.clone());
                }
                None => {
                    map.remove(&key);
                }
            }
        }
    }
    let out = serde_yaml::to_string(&incoming_v).map_err(|e| e.to_string())?;
    config::write_config_file(&path, &out)
}

fn apply_template(name: &str, incoming: &[u8]) -> Result<(), String> {
    validate_simple_name(name)?;
    std::fs::create_dir_all(config::templates_dir()).map_err(|e| e.to_string())?;
    let path = config::templates_dir().join(format!("{name}.yml"));
    std::fs::write(&path, incoming).map_err(|e| e.to_string())
}

fn apply_global(name: &str, incoming: &[u8]) -> Result<(), String> {
    let path = config::lpm_dir().join(safe_global_rel(name)?);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if name == "settings.json" {
        let current = std::fs::read(&path).unwrap_or_default();
        let merged = crate::transfer::merge_settings_bytes(incoming, &current)?;
        std::fs::write(&path, merged).map_err(|e| e.to_string())
    } else {
        std::fs::write(&path, incoming).map_err(|e| e.to_string())
    }
}

fn decode(item: &WireItem) -> Result<Vec<u8>, String> {
    match item.enc.as_str() {
        "b64" => base64_decode(&item.content),
        _ => Ok(item.content.clone().into_bytes()),
    }
}

// ---- validation / helpers ----------------------------------------------------

/// A global relative path restricted to the known files and dirs, lexically safe
/// (no absolute paths, no `..`), so a peer can never write outside its allowed
/// config surface on apply.
fn safe_global_rel(name: &str) -> Result<PathBuf, String> {
    let rel = Path::new(name);
    if rel.components().any(|c| !matches!(c, Component::Normal(_))) {
        return Err(format!("unsafe global path: {name}"));
    }
    if GLOBAL_FILES.contains(&name) {
        return Ok(rel.to_path_buf());
    }
    for d in GLOBAL_DIRS {
        if rel.starts_with(d) && rel.components().count() > 1 {
            return Ok(rel.to_path_buf());
        }
    }
    Err(format!("global not permitted: {name}"))
}

fn validate_simple_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.contains('/') || name.contains('\\') || name == "." || name == ".." {
        return Err(format!("invalid name: {name:?}"));
    }
    Ok(())
}

fn mtime_millis(path: &Path) -> i64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

fn hash_canonical(j: &Json) -> String {
    let mut s = String::new();
    canonical(j, &mut s);
    sha256_hex(s.as_bytes())
}

/// Deterministic string form of a JSON value with object keys sorted, so the
/// hash is independent of source key order / formatting.
fn canonical(v: &Json, out: &mut String) {
    match v {
        Json::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            out.push('{');
            for k in keys {
                out.push_str(&format!("{k:?}"));
                out.push(':');
                canonical(&map[k], out);
                out.push(';');
            }
            out.push('}');
        }
        Json::Array(a) => {
            out.push('[');
            for x in a {
                canonical(x, out);
                out.push(',');
            }
            out.push(']');
        }
        other => out.push_str(&other.to_string()),
    }
}

fn yaml_to_json(y: &serde_yaml::Value) -> Json {
    match y {
        serde_yaml::Value::Null => Json::Null,
        serde_yaml::Value::Bool(b) => Json::Bool(*b),
        serde_yaml::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Json::from(i)
            } else if let Some(u) = n.as_u64() {
                Json::from(u)
            } else if let Some(f) = n.as_f64() {
                serde_json::Number::from_f64(f)
                    .map(Json::Number)
                    .unwrap_or(Json::Null)
            } else {
                Json::Null
            }
        }
        serde_yaml::Value::String(s) => Json::String(s.clone()),
        serde_yaml::Value::Sequence(seq) => Json::Array(seq.iter().map(yaml_to_json).collect()),
        serde_yaml::Value::Mapping(m) => {
            let mut obj = serde_json::Map::new();
            for (k, val) in m {
                let key = match k {
                    serde_yaml::Value::String(s) => s.clone(),
                    other => serde_yaml::to_string(other)
                        .unwrap_or_default()
                        .trim()
                        .to_string(),
                };
                obj.insert(key, yaml_to_json(val));
            }
            Json::Object(obj)
        }
        serde_yaml::Value::Tagged(t) => yaml_to_json(&t.value),
    }
}

fn base64_encode(bytes: &[u8]) -> String {
    use base64::Engine as _;
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

fn base64_decode(s: &str) -> Result<Vec<u8>, String> {
    use base64::Engine as _;
    base64::engine::general_purpose::STANDARD
        .decode(s.as_bytes())
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn digest(yaml: &str) -> String {
        project_digest(yaml.as_bytes()).unwrap()
    }

    #[test]
    fn project_digest_ignores_machine_local_keys() {
        let a = "name: web\nroot: /Users/alice/web\nservices:\n  api:\n    cmd: go run .\n";
        let b = "name: web\nroot: /Users/bob/projects/web\nssh:\n  host: h\n  user: u\nclaudeAccount: work\nparent_name: base\nservices:\n  api:\n    cmd: go run .\n";
        assert_eq!(
            digest(a),
            digest(b),
            "only root/ssh/claudeAccount/parent_name differ"
        );
    }

    #[test]
    fn project_digest_changes_with_portable_content() {
        let a = "name: web\nroot: /x\nservices:\n  api:\n    cmd: go run .\n";
        let b = "name: web\nroot: /x\nservices:\n  api:\n    cmd: cargo run\n";
        assert_ne!(
            digest(a),
            digest(b),
            "a service change must change the digest"
        );
    }

    #[test]
    fn project_digest_independent_of_key_order() {
        let a = "name: web\nroot: /x\nservices:\n  api:\n    cmd: run\n";
        let b = "services:\n  api:\n    cmd: run\nroot: /y\nname: web\n";
        assert_eq!(
            digest(a),
            digest(b),
            "key order and root value must not matter"
        );
    }

    #[test]
    fn settings_digest_ignores_per_machine_keys() {
        let a = br#"{"theme":"dark","windowWidth":1200,"windowX":10,"lastSelectedProject":"web"}"#;
        let b = br#"{"theme":"dark","windowWidth":800,"windowX":900,"lastSelectedProject":"api"}"#;
        assert_eq!(settings_digest(a).unwrap(), settings_digest(b).unwrap());
    }

    #[test]
    fn settings_digest_changes_with_shared_keys() {
        let a = br#"{"theme":"dark"}"#;
        let b = br#"{"theme":"light"}"#;
        assert_ne!(settings_digest(a).unwrap(), settings_digest(b).unwrap());
    }

    #[test]
    fn extends_extraction_reads_direct_refs() {
        let y = b"name: web\nroot: /x\nextends:\n  - base\n  - node\nactions:\n  a:\n    cmd: x\n";
        assert_eq!(extends_of(y), vec!["base".to_string(), "node".to_string()]);
    }

    #[test]
    fn apply_merge_preserves_local_machine_fields() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("web.yml");
        std::fs::write(
            &path,
            "name: web\nroot: /Users/local/web\nclaudeAccount: personal\nservices:\n  api:\n    cmd: old\n",
        )
        .unwrap();
        // Incoming carries a different root/account (the source Mac's) plus the new
        // portable content we want.
        let incoming = "name: web\nroot: /Users/remote/web\nclaudeAccount: work\nservices:\n  api:\n    cmd: new\n";
        let mut inc: serde_yaml::Value = serde_yaml::from_slice(incoming.as_bytes()).unwrap();
        let local: serde_yaml::Value =
            serde_yaml::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        if let serde_yaml::Value::Mapping(map) = &mut inc {
            for k in PROJECT_LOCAL_KEYS {
                let key = serde_yaml::Value::String(k.to_string());
                match local.get(k) {
                    Some(v) => {
                        map.insert(key, v.clone());
                    }
                    None => {
                        map.remove(&key);
                    }
                }
            }
        }
        let out: serde_yaml::Value =
            serde_yaml::from_str(&serde_yaml::to_string(&inc).unwrap()).unwrap();
        assert_eq!(
            out.get("root").and_then(|v| v.as_str()),
            Some("/Users/local/web")
        );
        assert_eq!(
            out.get("claudeAccount").and_then(|v| v.as_str()),
            Some("personal")
        );
        assert_eq!(
            out.get("services")
                .and_then(|s| s.get("api"))
                .and_then(|a| a.get("cmd"))
                .and_then(|c| c.as_str()),
            Some("new"),
        );
    }

    #[test]
    fn compute_plan_directions_follow_mtime() {
        let mut local = DigestMap::default();
        let mut remote = DigestMap::default();
        local.projects.insert(
            "web".into(),
            ItemDigest {
                hash: "a".into(),
                mtime: 200,
            },
        );
        remote.projects.insert(
            "web".into(),
            ItemDigest {
                hash: "b".into(),
                mtime: 100,
            },
        );
        // Present on both, local newer -> push local to remote.
        local.projects.insert(
            "api".into(),
            ItemDigest {
                hash: "a".into(),
                mtime: 100,
            },
        );
        remote.projects.insert(
            "api".into(),
            ItemDigest {
                hash: "b".into(),
                mtime: 300,
            },
        );
        // Present only locally -> not synced (projects are intersection-only).
        local.projects.insert(
            "solo".into(),
            ItemDigest {
                hash: "a".into(),
                mtime: 1,
            },
        );

        let plan = compute_plan(&local, &remote);
        let web = plan.iter().find(|i| i.name == "web").unwrap();
        assert_eq!(web.direction, "toRemote");
        let api = plan.iter().find(|i| i.name == "api").unwrap();
        assert_eq!(api.direction, "toLocal");
        assert!(plan.iter().all(|i| i.name != "solo"));
    }

    #[test]
    fn compute_plan_globals_union_and_settings_special() {
        let mut local = DigestMap::default();
        let mut remote = DigestMap::default();
        local.globals.insert(
            "global.yml".into(),
            ItemDigest {
                hash: "x".into(),
                mtime: 5,
            },
        );
        // Only remote has groups.json -> created locally.
        remote.globals.insert(
            "groups.json".into(),
            ItemDigest {
                hash: "y".into(),
                mtime: 9,
            },
        );
        let plan = compute_plan(&local, &remote);
        let g = plan.iter().find(|i| i.name == "groups.json").unwrap();
        assert_eq!(g.direction, "toLocal");
        assert_eq!(g.kind, "global");
        // A global present on only one side flows to the other (create, never delete).
        let l = plan.iter().find(|i| i.name == "global.yml").unwrap();
        assert_eq!(l.direction, "toRemote");
    }

    #[test]
    fn referenced_templates_only_from_matched_projects() {
        let mut local = DigestMap::default();
        let mut remote = DigestMap::default();
        local.projects.insert(
            "web".into(),
            ItemDigest {
                hash: "a".into(),
                mtime: 1,
            },
        );
        remote.projects.insert(
            "web".into(),
            ItemDigest {
                hash: "a".into(),
                mtime: 1,
            },
        );
        local
            .project_extends
            .insert("web".into(), vec!["base".into()]);
        remote
            .project_extends
            .insert("web".into(), vec!["node".into()]);
        // Not matched (local only), its extends must be ignored.
        local.projects.insert(
            "solo".into(),
            ItemDigest {
                hash: "a".into(),
                mtime: 1,
            },
        );
        local
            .project_extends
            .insert("solo".into(), vec!["ignored".into()]);
        let refs = referenced_templates(&local, &remote);
        assert!(refs.contains("base") && refs.contains("node"));
        assert!(!refs.contains("ignored"));
    }

    #[test]
    fn safe_global_rel_blocks_escape_and_unknowns() {
        assert!(safe_global_rel("global.yml").is_ok());
        assert!(safe_global_rel("generator-icons/a.png").is_ok());
        assert!(safe_global_rel("zdotdir/.zshrc").is_ok());
        assert!(safe_global_rel("../secret").is_err());
        assert!(safe_global_rel("/etc/passwd").is_err());
        assert!(safe_global_rel("notes/db").is_err());
        assert!(safe_global_rel("generator-icons/../escape").is_err());
    }

    #[test]
    fn wire_roundtrip_text_and_binary() {
        let text = WireItem {
            kind: "global".into(),
            name: "global.yml".into(),
            enc: "text".into(),
            content: "root: ~/x".into(),
            mtime: 0,
        };
        assert_eq!(decode(&text).unwrap(), b"root: ~/x");
        let raw = [0u8, 159, 146, 150];
        let bin = WireItem {
            kind: "global".into(),
            name: "generator-icons/a.png".into(),
            enc: "b64".into(),
            content: base64_encode(&raw),
            mtime: 0,
        };
        assert_eq!(decode(&bin).unwrap(), raw);
    }
}
