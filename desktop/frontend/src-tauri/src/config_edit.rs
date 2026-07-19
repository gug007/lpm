// Structured config editing for the mobile remote: the phone's service /
// profile / action editors write through these. Ports serviceConfig.ts,
// profileConfig.ts, and actionConfig.ts (reference-fixups, compact->map
// promotion, section/layer rules). Edits go through serde_yaml, so DATA is
// preserved and comments reflow — the same accepted tradeoff as save_job_body.
//
// Layer rules (mirroring the TS ConfigLayer stacks):
//   - services / profiles live in [project, repo]
//   - actions live in [project, repo, global]
// An edit lands in the topmost layer that OWNS the entry; a new entry defaults
// to the project layer. Cross-layer fixups (a renamed/deleted service's
// profile + dependsOn references) are applied in every layer.
use crate::config;
use serde_json::{json, Value as Json};
use serde_yaml::{Mapping, Value as Yaml};
use std::path::{Path, PathBuf};

// ---- layers -----------------------------------------------------------------

#[derive(Clone, Copy, PartialEq, Eq)]
enum LayerKind {
    Project,
    Repo,
    Global,
}

impl LayerKind {
    fn label(self) -> &'static str {
        match self {
            LayerKind::Project => "project",
            LayerKind::Repo => "repo",
            LayerKind::Global => "global",
        }
    }
}

const SERVICE_KINDS: &[LayerKind] = &[LayerKind::Project, LayerKind::Repo];
const ACTION_KINDS: &[LayerKind] = &[LayerKind::Project, LayerKind::Repo, LayerKind::Global];

const ACTION_SECTIONS: [&str; 2] = ["actions", "terminals"];

// Fields the desktop ServiceForm manages (ServiceForm.buildPatch): any that the
// phone's payload omits is removed so a cleared value doesn't linger, while
// user-authored fields outside this set survive.
const SERVICE_REMOVE_KEYS: &[&str] = &["cwd", "port", "portConflict", "env", "dependsOn", "depends_on"];

// Fields the desktop action wizard manages (MANAGED_ACTION_KEYS in
// actionYaml.ts). Everything else (env, inputs, hand-authored keys) is
// unmanaged and rides along untouched through an edit.
const MANAGED_ACTION_KEYS: &[&str] = &[
    "label",
    "emoji",
    "shortcut",
    "cmd",
    "cwd",
    "type",
    "reuse",
    "confirm",
    "port",
    "portConflict",
    "display",
    "actions",
    "position",
];

struct Layer {
    kind: LayerKind,
    path: PathBuf,
    doc: Yaml, // always a Mapping
    changed: bool,
}

/// The project-layer file, routing a duplicate to its parent (matching
/// read_config/save_config) so an edit on a copy lands in the shared parent
/// config the desktop reads.
fn project_layer_path(project: &str) -> PathBuf {
    let target = config::peek_parent(project).unwrap_or_else(|| project.to_string());
    config::project_path(&target)
}

/// Parse a config file into a mapping doc (missing file -> empty mapping).
fn read_doc(path: &Path) -> Result<Yaml, String> {
    match std::fs::read(path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Yaml::Mapping(Mapping::new())),
        Err(e) => Err(e.to_string()),
        Ok(b) => {
            let doc: Yaml =
                serde_yaml::from_slice(&b).map_err(|e| format!("The config file couldn't be parsed: {e}"))?;
            if doc.is_null() {
                Ok(Yaml::Mapping(Mapping::new()))
            } else if doc.is_mapping() {
                Ok(doc)
            } else {
                Err("The config file isn't valid.".into())
            }
        }
    }
}

fn write_doc(path: &Path, doc: &Yaml) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let out = serde_yaml::to_string(doc).map_err(|e| e.to_string())?;
    config::write_config_file(path, &out)
}

/// Load the available layers for a project. The repo layer is skipped for
/// SSH/rootless projects (no local `.lpm.yml`); project + global always resolve.
fn config_layers(project: &str, kinds: &[LayerKind]) -> Result<Vec<Layer>, String> {
    let mut out = Vec::new();
    for &kind in kinds {
        let path = match kind {
            LayerKind::Project => project_layer_path(project),
            LayerKind::Repo => match config::repo_path_for_project(project) {
                Ok(p) => p,
                Err(_) => continue,
            },
            LayerKind::Global => config::global_path(),
        };
        let doc = read_doc(&path)?;
        out.push(Layer {
            kind,
            path,
            doc,
            changed: false,
        });
    }
    Ok(out)
}

fn flush_layers(layers: &[Layer]) -> Result<(), String> {
    for l in layers {
        if l.changed {
            write_doc(&l.path, &l.doc)?;
        }
    }
    Ok(())
}

// ---- value helpers ----------------------------------------------------------

fn json_to_yaml(j: &Json) -> Yaml {
    match j {
        Json::Null => Yaml::Null,
        Json::Bool(b) => Yaml::Bool(*b),
        Json::Number(n) => {
            if let Some(i) = n.as_i64() {
                Yaml::from(i)
            } else if let Some(u) = n.as_u64() {
                Yaml::from(u)
            } else if let Some(f) = n.as_f64() {
                Yaml::from(f)
            } else {
                Yaml::Null
            }
        }
        Json::String(s) => Yaml::String(s.clone()),
        Json::Array(a) => Yaml::Sequence(a.iter().map(json_to_yaml).collect()),
        Json::Object(o) => {
            let mut m = Mapping::new();
            for (k, v) in o {
                m.insert(Yaml::String(k.clone()), json_to_yaml(v));
            }
            Yaml::Mapping(m)
        }
    }
}

fn yaml_to_json(y: &Yaml) -> Json {
    match y {
        Yaml::Null => Json::Null,
        Yaml::Bool(b) => Json::Bool(*b),
        Yaml::Number(n) => {
            if let Some(i) = n.as_i64() {
                json!(i)
            } else if let Some(u) = n.as_u64() {
                json!(u)
            } else if let Some(f) = n.as_f64() {
                json!(f)
            } else {
                Json::Null
            }
        }
        Yaml::String(s) => json!(s),
        Yaml::Sequence(seq) => Json::Array(seq.iter().map(yaml_to_json).collect()),
        Yaml::Mapping(m) => {
            let mut obj = serde_json::Map::new();
            for (k, v) in m {
                let key = match k {
                    Yaml::String(s) => s.clone(),
                    Yaml::Number(n) => n.to_string(),
                    Yaml::Bool(b) => b.to_string(),
                    _ => continue,
                };
                obj.insert(key, yaml_to_json(v));
            }
            Json::Object(obj)
        }
        Yaml::Tagged(t) => yaml_to_json(&t.value),
    }
}

/// Get (creating if needed) a top-level section mapping on a doc.
fn ensure_section<'a>(doc: &'a mut Yaml, key: &str) -> &'a mut Mapping {
    let map = doc.as_mapping_mut().expect("config doc is a mapping");
    if !map.get(key).map(Yaml::is_mapping).unwrap_or(false) {
        map.insert(Yaml::from(key), Yaml::Mapping(Mapping::new()));
    }
    match map.get_mut(key) {
        Some(Yaml::Mapping(m)) => m,
        _ => unreachable!("section just ensured"),
    }
}

/// Index of the topmost layer whose top-level `section` map contains `key`.
fn find_owner(layers: &[Layer], section: &str, key: &str) -> Option<usize> {
    layers.iter().position(|l| {
        l.doc
            .get(section)
            .and_then(Yaml::as_mapping)
            .map(|m| m.get(key).is_some())
            .unwrap_or(false)
    })
}

// ---- service reference fixups (serviceConfig.ts) ----------------------------

fn rename_in_seq(node: &mut Yaml, old: &str, new: &str) -> bool {
    let Some(seq) = node.as_sequence_mut() else {
        return false;
    };
    let mut changed = false;
    for item in seq.iter_mut() {
        if item.as_str() == Some(old) {
            *item = Yaml::from(new);
            changed = true;
        }
    }
    changed
}

fn strip_in_seq(node: &mut Yaml, key: &str) -> bool {
    let Some(seq) = node.as_sequence_mut() else {
        return false;
    };
    let before = seq.len();
    seq.retain(|item| item.as_str() != Some(key));
    before != seq.len()
}

/// Apply `f` to every service reference in a doc — each profile's service list
/// and each service's `dependsOn`/`depends_on` list. Returns whether anything
/// changed.
fn edit_service_refs(doc: &mut Yaml, mut f: impl FnMut(&mut Yaml) -> bool) -> bool {
    let mut changed = false;
    if let Some(profiles) = doc.get_mut("profiles").and_then(Yaml::as_mapping_mut) {
        for (_k, list) in profiles.iter_mut() {
            changed |= f(list);
        }
    }
    if let Some(services) = doc.get_mut("services").and_then(Yaml::as_mapping_mut) {
        for (_k, entry) in services.iter_mut() {
            if let Some(m) = entry.as_mapping_mut() {
                for dep_key in ["dependsOn", "depends_on"] {
                    if let Some(list) = m.get_mut(dep_key) {
                        changed |= f(list);
                    }
                }
            }
        }
    }
    changed
}

fn rewrite_service_refs(doc: &mut Yaml, old: &str, new: &str) -> bool {
    edit_service_refs(doc, |list| rename_in_seq(list, old, new))
}

fn strip_service_refs(doc: &mut Yaml, key: &str) -> bool {
    edit_service_refs(doc, |list| strip_in_seq(list, key))
}

// ---- services ---------------------------------------------------------------

/// Set every provided field, then remove managed fields absent from the payload
/// (mirroring ServiceForm.buildPatch), so a cleared field doesn't linger and
/// unmanaged user fields survive.
fn apply_service_patch(entry: &mut Mapping, payload: &Json) {
    let obj = payload.as_object();
    if let Some(obj) = obj {
        for (k, v) in obj {
            entry.insert(Yaml::from(k.as_str()), json_to_yaml(v));
        }
    }
    for &rk in SERVICE_REMOVE_KEYS {
        let present = obj.map(|o| o.contains_key(rk)).unwrap_or(false);
        if !present {
            entry.remove(rk);
        }
    }
}

fn save_service_in(
    layers: &mut [Layer],
    key: &str,
    payload: &Json,
    previous_key: Option<&str>,
) -> Result<(), String> {
    let key = key.trim();
    if key.is_empty() {
        return Err("The service needs a name.".into());
    }

    // Phase 1: rename the map key in its owning layer + rewrite refs everywhere.
    if let Some(prev) = previous_key
        .map(str::trim)
        .filter(|p| !p.is_empty() && *p != key)
    {
        let mut renamed = false;
        for l in layers.iter_mut() {
            if !renamed {
                if let Some(services) = l.doc.get_mut("services").and_then(Yaml::as_mapping_mut) {
                    if let Some(entry) = services.remove(prev) {
                        services.insert(Yaml::from(key), entry);
                        renamed = true;
                        l.changed = true;
                    }
                }
            }
            if rewrite_service_refs(&mut l.doc, prev, key) {
                l.changed = true;
            }
        }
    }

    // Phase 2: merge the payload into the owning layer (or create in project).
    let idx = find_owner(layers, "services", key).unwrap_or(0);
    let l = &mut layers[idx];
    let services = ensure_section(&mut l.doc, "services");
    // Promote a compact `name: cmd` scalar to a mapping before patching.
    let is_map = services.get(key).map(Yaml::is_mapping).unwrap_or(false);
    if !is_map {
        let cmd = services
            .get(key)
            .and_then(Yaml::as_str)
            .unwrap_or("")
            .to_string();
        let mut m = Mapping::new();
        if !cmd.is_empty() {
            m.insert(Yaml::from("cmd"), Yaml::from(cmd.as_str()));
        }
        services.insert(Yaml::from(key), Yaml::Mapping(m));
    }
    let entry = services
        .get_mut(key)
        .and_then(Yaml::as_mapping_mut)
        .ok_or_else(|| "The config file isn't valid.".to_string())?;
    apply_service_patch(entry, payload);
    l.changed = true;
    Ok(())
}

fn delete_service_in(layers: &mut [Layer], key: &str) -> Result<(), String> {
    let mut removed = false;
    for l in layers.iter_mut() {
        if !removed {
            let mut did = false;
            let mut now_empty = false;
            if let Some(services) = l.doc.get_mut("services").and_then(Yaml::as_mapping_mut) {
                if services.remove(key).is_some() {
                    did = true;
                    now_empty = services.is_empty();
                }
            }
            if did {
                if now_empty {
                    if let Some(m) = l.doc.as_mapping_mut() {
                        m.remove("services");
                    }
                }
                removed = true;
                l.changed = true;
            }
        }
        if strip_service_refs(&mut l.doc, key) {
            l.changed = true;
        }
    }
    Ok(())
}

/// The full service mapping (compact `name: cmd` normalized to `{cmd}`) from the
/// topmost layer that defines it, plus which layer, for seeding the phone's
/// service editor.
pub fn service_body(project: &str, key: &str) -> Result<(Json, &'static str), String> {
    let layers = config_layers(project, SERVICE_KINDS)?;
    for l in &layers {
        if let Some(entry) = l
            .doc
            .get("services")
            .and_then(Yaml::as_mapping)
            .and_then(|m| m.get(key))
        {
            let body = normalize_entry(entry);
            return Ok((yaml_to_json(&Yaml::Mapping(body)), l.kind.label()));
        }
    }
    Err("This service no longer exists.".into())
}

pub fn save_service(
    project: &str,
    key: &str,
    payload: &Json,
    previous_key: Option<&str>,
) -> Result<(), String> {
    let mut layers = config_layers(project, SERVICE_KINDS)?;
    save_service_in(&mut layers, key, payload, previous_key)?;
    flush_layers(&layers)
}

pub fn delete_service(project: &str, key: &str) -> Result<(), String> {
    let mut layers = config_layers(project, SERVICE_KINDS)?;
    delete_service_in(&mut layers, key)?;
    flush_layers(&layers)
}

// ---- profiles (profileConfig.ts) --------------------------------------------

fn save_profile_in(
    layers: &mut [Layer],
    name: &str,
    services: &[String],
    previous_name: Option<&str>,
) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("The profile needs a name.".into());
    }

    // Rename in the topmost owning layer only (profiles aren't referenced
    // elsewhere, so there's nothing to fix up across layers).
    if let Some(prev) = previous_name
        .map(str::trim)
        .filter(|p| !p.is_empty() && *p != name)
    {
        for l in layers.iter_mut() {
            let mut did = false;
            if let Some(profiles) = l.doc.get_mut("profiles").and_then(Yaml::as_mapping_mut) {
                if let Some(entry) = profiles.remove(prev) {
                    profiles.insert(Yaml::from(name), entry);
                    did = true;
                }
            }
            if did {
                l.changed = true;
                break;
            }
        }
    }

    let idx = find_owner(layers, "profiles", name).unwrap_or(0);
    let l = &mut layers[idx];
    let profiles = ensure_section(&mut l.doc, "profiles");
    let seq: Vec<Yaml> = services.iter().map(|s| Yaml::from(s.as_str())).collect();
    profiles.insert(Yaml::from(name), Yaml::Sequence(seq));
    l.changed = true;
    Ok(())
}

fn delete_profile_in(layers: &mut [Layer], name: &str) -> Result<(), String> {
    for l in layers.iter_mut() {
        let mut did = false;
        let mut now_empty = false;
        if let Some(profiles) = l.doc.get_mut("profiles").and_then(Yaml::as_mapping_mut) {
            if profiles.remove(name).is_some() {
                did = true;
                now_empty = profiles.is_empty();
            }
        }
        if did {
            if now_empty {
                if let Some(m) = l.doc.as_mapping_mut() {
                    m.remove("profiles");
                }
            }
            l.changed = true;
            break;
        }
    }
    Ok(())
}

pub fn save_profile(
    project: &str,
    name: &str,
    services: &[String],
    previous_name: Option<&str>,
) -> Result<(), String> {
    let mut layers = config_layers(project, SERVICE_KINDS)?;
    save_profile_in(&mut layers, name, services, previous_name)?;
    flush_layers(&layers)
}

pub fn delete_profile(project: &str, name: &str) -> Result<(), String> {
    let mut layers = config_layers(project, SERVICE_KINDS)?;
    delete_profile_in(&mut layers, name)?;
    flush_layers(&layers)
}

// ---- actions (actionConfig.ts) ----------------------------------------------

/// True when an entry carries the action's body (cmd, child actions, or the
/// scalar shorthand). Thin metadata-only overrides aren't definitions.
fn has_action_body(entry: &Yaml) -> bool {
    match entry {
        Yaml::String(s) => !s.trim().is_empty(),
        Yaml::Mapping(m) => m.get("cmd").is_some() || m.get("actions").is_some(),
        _ => false,
    }
}

/// Normalize an action/service entry to a mapping: the scalar shorthand
/// (`key: cmd`) expands to `{cmd}`; a mapping is cloned as-is so unmanaged
/// fields survive.
fn normalize_entry(entry: &Yaml) -> Mapping {
    match entry {
        Yaml::String(s) => {
            let mut m = Mapping::new();
            if !s.trim().is_empty() {
                m.insert(Yaml::from("cmd"), Yaml::from(s.as_str()));
            }
            m
        }
        Yaml::Mapping(m) => m.clone(),
        _ => Mapping::new(),
    }
}

/// The first section in a doc (`actions` then `terminals`) whose map has `key`.
fn find_action_section_in(doc: &Yaml, key: &str) -> Option<&'static str> {
    ACTION_SECTIONS.into_iter().find(|section| {
        doc.get(*section)
            .and_then(Yaml::as_mapping)
            .map(|m| m.get(key).is_some())
            .unwrap_or(false)
    })
}

/// The topmost body-bearing (layer, section) for `key`, searching both sections.
fn find_action_owner_body(layers: &[Layer], key: &str) -> Option<(usize, &'static str)> {
    for (i, l) in layers.iter().enumerate() {
        for section in ACTION_SECTIONS {
            if let Some(entry) = l
                .doc
                .get(section)
                .and_then(Yaml::as_mapping)
                .and_then(|m| m.get(key))
            {
                if has_action_body(entry) {
                    return Some((i, section));
                }
            }
        }
    }
    None
}

/// Resolve a possibly-composite `parent:child` key by descending nested
/// `actions:` submaps, returning the (cloned) leaf entry.
fn resolve_action_entry(section_map: &Mapping, key: &str) -> Option<Yaml> {
    let mut parts = key.split(':');
    let mut current = section_map.get(parts.next()?)?.clone();
    for seg in parts {
        current = current
            .as_mapping()
            .and_then(|m| m.get("actions"))
            .and_then(Yaml::as_mapping)
            .and_then(|m| m.get(seg))?
            .clone();
    }
    Some(current)
}

fn normalize_section(hint: Option<&str>) -> &'static str {
    match hint {
        Some("terminals") => "terminals",
        _ => "actions",
    }
}

/// unmanaged(base) overlaid with the payload — mirrors the desktop editor's
/// `{ ...pickUnmanaged(base), ...payload }`: managed fields come wholly from the
/// form's payload (so a cleared field drops), unmanaged fields survive.
fn merge_action(base: &Mapping, payload: &Json) -> Mapping {
    let mut out = Mapping::new();
    for (k, v) in base {
        let managed = k
            .as_str()
            .map(|s| MANAGED_ACTION_KEYS.contains(&s))
            .unwrap_or(false);
        if !managed {
            out.insert(k.clone(), v.clone());
        }
    }
    if let Some(obj) = payload.as_object() {
        for (k, v) in obj {
            out.insert(Yaml::from(k.as_str()), json_to_yaml(v));
        }
    }
    out
}

fn save_action_in(
    layers: &mut [Layer],
    key: &str,
    payload: &Json,
    previous_key: Option<&str>,
    section_hint: Option<&str>,
) -> Result<(), String> {
    let key = key.trim();
    if key.is_empty() {
        return Err("The action needs a name.".into());
    }

    let prev = previous_key
        .map(str::trim)
        .filter(|p| !p.is_empty() && *p != key);
    let lookup = prev.unwrap_or(key);
    let existing = find_action_owner_body(layers, lookup);

    // A brand-new top-level key can't carry a ':': composite names address an
    // existing nested child, which v1 edits through its parent's payload.
    if existing.is_none() && key.contains(':') {
        return Err("An action name can't contain \":\".".into());
    }

    let base: Mapping = existing
        .map(|(i, section)| {
            let entry = layers[i]
                .doc
                .get(section)
                .and_then(Yaml::as_mapping)
                .and_then(|m| m.get(lookup))
                .expect("owner just located it");
            normalize_entry(entry)
        })
        .unwrap_or_default();

    let (idx, section) = existing.unwrap_or((0, normalize_section(section_hint)));
    let merged = merge_action(&base, payload);

    let l = &mut layers[idx];
    // On rename, drop the old key from the same section it was found in.
    if prev.is_some() {
        if let Some(sec_map) = l.doc.get_mut(section).and_then(Yaml::as_mapping_mut) {
            sec_map.remove(lookup);
        }
    }
    let sec_map = ensure_section(&mut l.doc, section);
    sec_map.insert(Yaml::from(key), Yaml::Mapping(merged));
    l.changed = true;
    Ok(())
}

fn delete_action_in(layers: &mut [Layer], key: &str) -> Result<(), String> {
    for l in layers.iter_mut() {
        let Some(section) = find_action_section_in(&l.doc, key) else {
            continue;
        };
        let mut now_empty = false;
        if let Some(sec_map) = l.doc.get_mut(section).and_then(Yaml::as_mapping_mut) {
            sec_map.remove(key);
            now_empty = sec_map.is_empty();
        }
        if now_empty {
            if let Some(m) = l.doc.as_mapping_mut() {
                m.remove(section);
            }
        }
        l.changed = true;
        break;
    }
    Ok(())
}

/// The full action mapping (scalar shorthand normalized to `{cmd}`) from the
/// topmost body-bearing layer, plus its section and layer, for seeding the
/// phone's action editor. `key` may be a `parent:child` composite.
pub fn action_body(project: &str, key: &str) -> Result<(Json, &'static str, &'static str), String> {
    let layers = config_layers(project, ACTION_KINDS)?;
    for l in &layers {
        for section in ACTION_SECTIONS {
            let Some(section_map) = l.doc.get(section).and_then(Yaml::as_mapping) else {
                continue;
            };
            if let Some(entry) = resolve_action_entry(section_map, key) {
                if has_action_body(&entry) {
                    let body = normalize_entry(&entry);
                    return Ok((yaml_to_json(&Yaml::Mapping(body)), section, l.kind.label()));
                }
            }
        }
    }
    Err("This action no longer exists.".into())
}

pub fn save_action(
    project: &str,
    key: &str,
    payload: &Json,
    previous_key: Option<&str>,
    section_hint: Option<&str>,
) -> Result<(), String> {
    let mut layers = config_layers(project, ACTION_KINDS)?;
    save_action_in(&mut layers, key, payload, previous_key, section_hint)?;
    flush_layers(&layers)
}

pub fn delete_action(project: &str, key: &str) -> Result<(), String> {
    let mut layers = config_layers(project, ACTION_KINDS)?;
    delete_action_in(&mut layers, key)?;
    flush_layers(&layers)
}

// ---- tests ------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn layer(kind: LayerKind, yaml: &str) -> Layer {
        Layer {
            kind,
            path: PathBuf::from("/dev/null"),
            doc: serde_yaml::from_str(yaml).unwrap(),
            changed: false,
        }
    }

    fn get<'a>(doc: &'a Yaml, path: &[&str]) -> Option<&'a Yaml> {
        let mut cur = doc;
        for p in path {
            cur = cur.get(*p)?;
        }
        Some(cur)
    }

    #[test]
    fn service_rename_rewrites_refs() {
        let mut layers = vec![layer(
            LayerKind::Project,
            "services:\n  api:\n    cmd: run\n  web:\n    cmd: serve\n    dependsOn: [api]\nprofiles:\n  default: [api, web]\n",
        )];
        save_service_in(&mut layers, "backend", &json!({ "cmd": "run" }), Some("api")).unwrap();
        let doc = &layers[0].doc;
        assert!(get(doc, &["services", "backend"]).is_some());
        assert!(get(doc, &["services", "api"]).is_none());
        let dep = get(doc, &["services", "web", "dependsOn"]).unwrap();
        assert_eq!(dep.as_sequence().unwrap()[0].as_str(), Some("backend"));
        let prof = get(doc, &["profiles", "default"]).unwrap();
        assert_eq!(prof.as_sequence().unwrap()[0].as_str(), Some("backend"));
    }

    #[test]
    fn service_delete_strips_refs() {
        let mut layers = vec![layer(
            LayerKind::Project,
            "services:\n  api:\n    cmd: run\n  web:\n    cmd: serve\n    dependsOn: [api]\nprofiles:\n  default: [api, web]\n",
        )];
        delete_service_in(&mut layers, "api").unwrap();
        let doc = &layers[0].doc;
        assert!(get(doc, &["services", "api"]).is_none());
        assert!(get(doc, &["services", "web", "dependsOn"])
            .unwrap()
            .as_sequence()
            .unwrap()
            .is_empty());
        let prof = get(doc, &["profiles", "default"]).unwrap();
        assert_eq!(prof.as_sequence().unwrap().len(), 1);
        assert_eq!(prof.as_sequence().unwrap()[0].as_str(), Some("web"));
    }

    #[test]
    fn compact_service_promoted_on_edit() {
        let mut layers = vec![layer(LayerKind::Project, "services:\n  api: run-me\n")];
        save_service_in(
            &mut layers,
            "api",
            &json!({ "cmd": "run-me", "port": 3000 }),
            None,
        )
        .unwrap();
        let entry = get(&layers[0].doc, &["services", "api"]).unwrap();
        assert!(entry.is_mapping());
        assert_eq!(entry.get("cmd").unwrap().as_str(), Some("run-me"));
        assert_eq!(entry.get("port").unwrap().as_i64(), Some(3000));
    }

    #[test]
    fn service_edit_removes_cleared_managed_fields() {
        let mut layers = vec![layer(
            LayerKind::Project,
            "services:\n  api:\n    cmd: run\n    port: 3000\n    keepme: yes\n",
        )];
        // Payload omits port -> it's cleared; the unmanaged `keepme` survives.
        save_service_in(&mut layers, "api", &json!({ "cmd": "run2" }), None).unwrap();
        let entry = get(&layers[0].doc, &["services", "api"]).unwrap();
        assert_eq!(entry.get("cmd").unwrap().as_str(), Some("run2"));
        assert!(entry.get("port").is_none());
        assert!(entry.get("keepme").is_some());
    }

    #[test]
    fn profile_create_rename_delete() {
        let mut layers = vec![layer(LayerKind::Project, "{}")];
        save_profile_in(
            &mut layers,
            "dev",
            &["api".into(), "web".into()],
            None,
        )
        .unwrap();
        assert_eq!(
            get(&layers[0].doc, &["profiles", "dev"])
                .unwrap()
                .as_sequence()
                .unwrap()
                .len(),
            2
        );
        save_profile_in(&mut layers, "prod", &["web".into()], Some("dev")).unwrap();
        assert!(get(&layers[0].doc, &["profiles", "dev"]).is_none());
        assert_eq!(
            get(&layers[0].doc, &["profiles", "prod"])
                .unwrap()
                .as_sequence()
                .unwrap()
                .len(),
            1
        );
        delete_profile_in(&mut layers, "prod").unwrap();
        assert!(layers[0].doc.get("profiles").is_none());
    }

    #[test]
    fn action_edit_merges_unmanaged_and_finds_terminals() {
        let mut layers = vec![layer(
            LayerKind::Project,
            "terminals:\n  shell:\n    cmd: zsh\n    env:\n      FOO: bar\n    inputs:\n      x:\n        label: X\n",
        )];
        save_action_in(
            &mut layers,
            "shell",
            &json!({ "label": "Shell", "cmd": "bash" }),
            None,
            None,
        )
        .unwrap();
        let doc = &layers[0].doc;
        // Stayed under terminals; no stray actions section created.
        assert!(doc.get("actions").is_none());
        let entry = get(doc, &["terminals", "shell"]).unwrap();
        assert_eq!(entry.get("cmd").unwrap().as_str(), Some("bash"));
        assert_eq!(entry.get("label").unwrap().as_str(), Some("Shell"));
        // Unmanaged env + inputs ride along untouched.
        assert_eq!(
            get(entry, &["env", "FOO"]).unwrap().as_str(),
            Some("bar")
        );
        assert!(get(entry, &["inputs", "x"]).is_some());
    }

    #[test]
    fn action_new_composite_key_rejected() {
        let mut layers = vec![layer(LayerKind::Project, "{}")];
        let err = save_action_in(
            &mut layers,
            "parent:child",
            &json!({ "cmd": "x" }),
            None,
            None,
        )
        .unwrap_err();
        assert!(err.contains(':'));
    }
}
