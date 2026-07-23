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
// paths / accounts compare as identical.
//
// Direction is decided one of two ways. Against a peer that only speaks the
// original `configSync` feature it is newest-wins on file mtime, nothing is ever
// deleted, and projects sync only when present on both Macs — exactly as before.
// Against a `configSync2` peer it is revision-based: the sidecar in syncstate.rs
// tracks a per-unit revision + author and the agreed base with each Mac, so
// `compute_plan_v2` tells a fast-forward from a real conflict and lets a deletion
// of a synced-dir file cross to the other Mac. See PEER_PROTOCOL.md.
use crate::config;
use crate::syncstate::{BaseState, TOMBSTONE};
use serde::{Deserialize, Serialize};
use serde_json::Value as Json;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Component, Path, PathBuf};

/// Advertised in the host's `ready` frame; the client refuses to sync (with a
/// "the other Mac needs to update lpm" error) when it is absent.
pub const SYNC_FEATURE: &str = "configSync";

/// The revision-aware sync feature (Phase 2). A host advertises it alongside
/// `configSync`; a client keys revision/base logic on it per peer and never sends
/// tombstones or revision fields to a peer that lacks it.
pub const SYNC_FEATURE2: &str = "configSync2";

fn is_false(b: &bool) -> bool {
    !*b
}

fn is_zero(n: &u64) -> bool {
    *n == 0
}

// The synced global file/dir surface, the machine-local settings keys, and the
// project-local key set all come from syncsurface.rs — the single manifest shared
// with transfer.rs (export/import) and configwatch.rs (the FSEvents watcher) so
// none of them can drift. settings.json among the global files gets a special
// digest + merge; every other synced file is a byte-identical newest-wins replace.
use crate::syncsurface::{
    is_sync_global_file, sync_global_dirs, sync_global_files, PER_MACHINE_KEYS, PROJECT_LOCAL_KEYS,
};

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct ItemDigest {
    pub hash: String,
    pub mtime: i64,
    /// Revision + author + tombstone flag, present only on maps built by / exchanged
    /// with a `configSync2` peer. A legacy map leaves these at their defaults (rev 0,
    /// no device, not deleted), which `compute_plan` ignores.
    #[serde(default, skip_serializing_if = "is_zero")]
    pub rev: u64,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub device: String,
    #[serde(default, skip_serializing_if = "is_false")]
    pub deleted: bool,
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
    /// The sidecar device id of the Mac that produced this map (configSync2 only),
    /// so the receiver keys its base map by the other Mac's id.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub device: String,
}

impl DigestMap {
    pub fn get(&self, kind: &str, name: &str) -> Option<&ItemDigest> {
        match kind {
            "project" => self.projects.get(name),
            "global" => self.globals.get(name),
            "template" => self.templates.get(name),
            _ => None,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SyncItem {
    pub kind: String,      // "project" | "global" | "template"
    pub name: String,      // project/template name, or global relative path
    pub direction: String, // "toLocal" | "toRemote"
    pub local_mtime: i64,
    pub remote_mtime: i64,
    /// The unit changed on both Macs since their last agreed base; the newer
    /// revision wins and the other is backed up. configSync2 only.
    #[serde(default)]
    pub conflict: bool,
    /// This item removes the file on the destination side (a synced-dir file that
    /// was deleted on the source). configSync2 only.
    #[serde(default)]
    pub deleted: bool,
}

/// A config unit's content on the wire (fetch reply / apply request). Text files
/// travel as UTF-8; binaries (and any non-UTF-8 file) as base64.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct WireItem {
    pub kind: String,
    pub name: String,
    pub enc: String, // "text" | "b64"
    pub content: String,
    pub mtime: i64,
    /// A pushed deletion of a synced-dir file (content empty). configSync2 only.
    #[serde(default)]
    pub deleted: bool,
    /// The pushing Mac's revision + author for this unit, so the receiving host can
    /// record the base without seeing the pusher's digest map. configSync2 only.
    #[serde(default, skip_serializing_if = "is_zero")]
    pub rev: u64,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub device: String,
}

/// The composite sidecar key for a unit: "project/<name>", "global/<rel>",
/// "template/<name>".
pub fn item_key(kind: &str, name: &str) -> String {
    format!("{kind}/{name}")
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
                    ..Default::default()
                },
            );
            dm.project_extends.insert(name.clone(), extends_of(&bytes));
        }
    }

    for f in sync_global_files() {
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
                    ..Default::default()
                },
            );
        }
    }
    for d in sync_global_dirs() {
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
                    ..Default::default()
                },
            );
        }
    }

    reconcile_and_attach(&mut dm);
    dm
}

/// Fold the freshly-read present digests into the revision sidecar (the single
/// observation choke point), then decorate the map with each unit's revision +
/// author and add tombstone entries for synced-dir files the sidecar knows were
/// deleted. Both roles call `local_digest_map`, so this runs on host and client.
fn reconcile_and_attach(dm: &mut DigestMap) {
    let mut present: BTreeMap<String, String> = BTreeMap::new();
    for (n, d) in &dm.projects {
        present.insert(item_key("project", n), d.hash.clone());
    }
    for (n, d) in &dm.globals {
        present.insert(item_key("global", n), d.hash.clone());
    }
    for (n, d) in &dm.templates {
        present.insert(item_key("template", n), d.hash.clone());
    }
    let state = crate::syncstate::mutate(|s| {
        let changed = s.reconcile(&present, tombstone_eligible);
        (changed, s.clone())
    });
    dm.device = state.device.clone();
    for (n, d) in dm.projects.iter_mut() {
        if let Some(it) = state.items.get(&item_key("project", n)) {
            d.rev = it.rev;
            d.device = it.device.clone();
        }
    }
    for (n, d) in dm.globals.iter_mut() {
        if let Some(it) = state.items.get(&item_key("global", n)) {
            d.rev = it.rev;
            d.device = it.device.clone();
        }
    }
    for (n, d) in dm.templates.iter_mut() {
        if let Some(it) = state.items.get(&item_key("template", n)) {
            d.rev = it.rev;
            d.device = it.device.clone();
        }
    }
    for (key, it) in &state.items {
        if !it.deleted {
            continue;
        }
        if let Some(rel) = key.strip_prefix("global/") {
            if is_deletable_global(rel) {
                dm.globals.insert(
                    rel.to_string(),
                    ItemDigest {
                        hash: String::new(),
                        mtime: 0,
                        rev: it.rev,
                        device: it.device.clone(),
                        deleted: true,
                    },
                );
            }
        }
    }
}

/// Whether an absent sidecar entry keyed `key` should become a tombstone: only
/// files under a synced global dir (generator-icons/*, zdotdir/*).
fn tombstone_eligible(key: &str) -> bool {
    key.strip_prefix("global/")
        .map(is_deletable_global)
        .unwrap_or(false)
}

/// Whether a global relative path is a synced-dir file (the only globals a deletion
/// may cross): under a synced dir with at least one path segment beneath it.
fn is_deletable_global(rel: &str) -> bool {
    let p = Path::new(rel);
    sync_global_dirs().any(|d| p.starts_with(d) && p.components().count() > 1)
}

/// Strip every configSync2-only field, so a legacy peer sees the pre-Phase-2 map:
/// no revision/author, and no tombstone entries (which it would otherwise re-create
/// as empty files).
pub fn legacy_view(mut dm: DigestMap) -> DigestMap {
    dm.device.clear();
    dm.globals.retain(|_, d| !d.deleted);
    for d in dm
        .projects
        .values_mut()
        .chain(dm.globals.values_mut())
        .chain(dm.templates.values_mut())
    {
        d.rev = 0;
        d.device.clear();
        d.deleted = false;
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
                        ..Default::default()
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
        for k in PER_MACHINE_KEYS {
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

/// Legacy (configSync) plan: the items whose portable content differs, each tagged
/// with the newest-wins-by-mtime direction. Projects are intersection-only; globals
/// union (a one-sided global is created on the other Mac); templates are limited to
/// those referenced by a matched project on either side. Nothing is deleted. This
/// is the unchanged pre-Phase-2 behavior, used against a peer without configSync2.
pub fn compute_plan(local: &DigestMap, remote: &DigestMap) -> Vec<SyncItem> {
    plan_core(local, remote, &BTreeMap::new(), true)
}

/// Revision-aware (configSync2) plan. `bases` is the base agreed with this peer per
/// item key. Each differing unit resolves to a fast-forward (one side moved off the
/// base), a conflict (both moved — higher revision wins, backups cover the loser),
/// or, when no base exists yet (first sync / Phase-1 upgrade), the legacy mtime
/// direction with no conflict. Deletions of synced-dir files cross as delete items.
pub fn compute_plan_v2(
    local: &DigestMap,
    remote: &DigestMap,
    bases: &BTreeMap<String, BaseState>,
) -> Vec<SyncItem> {
    plan_core(local, remote, bases, false)
}

/// Pure over (local map, remote map, bases, legacy flag) so the whole decision is
/// unit-testable without any I/O.
fn plan_core(
    local: &DigestMap,
    remote: &DigestMap,
    bases: &BTreeMap<String, BaseState>,
    legacy: bool,
) -> Vec<SyncItem> {
    let mut items = Vec::new();
    for (name, l) in &local.projects {
        if let Some(r) = remote.projects.get(name) {
            if let Some(it) = resolve_pair("project", name, Some(l), Some(r), bases, legacy) {
                items.push(it);
            }
        }
    }
    let mut global_keys: BTreeSet<&String> = local.globals.keys().collect();
    global_keys.extend(remote.globals.keys());
    for name in global_keys {
        if let Some(it) = resolve_pair(
            "global",
            name,
            local.globals.get(name),
            remote.globals.get(name),
            bases,
            legacy,
        ) {
            items.push(it);
        }
    }
    for name in referenced_templates(local, remote) {
        if let Some(it) = resolve_pair(
            "template",
            &name,
            local.templates.get(&name),
            remote.templates.get(&name),
            bases,
            legacy,
        ) {
            items.push(it);
        }
    }
    items
}

/// One Mac's contribution to a decision. `ck` (content key) is None when the unit
/// is absent, `Some(TOMBSTONE)` when deleted, `Some(digest)` when live. In legacy
/// mode a tombstone folds to absent, reproducing the pre-Phase-2 behavior where a
/// deletion simply resurrects.
struct SideInfo {
    ck: Option<String>,
    rev: u64,
    device: String,
    mtime: i64,
    deleted: bool,
}

fn side_info(d: Option<&ItemDigest>, legacy: bool) -> SideInfo {
    match d {
        Some(x) if x.deleted && !legacy => SideInfo {
            ck: Some(TOMBSTONE.to_string()),
            rev: x.rev,
            device: x.device.clone(),
            mtime: x.mtime,
            deleted: true,
        },
        Some(x) if !x.deleted => SideInfo {
            ck: Some(x.hash.clone()),
            rev: x.rev,
            device: x.device.clone(),
            mtime: x.mtime,
            deleted: false,
        },
        _ => SideInfo {
            ck: None,
            rev: 0,
            device: String::new(),
            mtime: 0,
            deleted: false,
        },
    }
}

fn resolve_pair(
    kind: &str,
    name: &str,
    local: Option<&ItemDigest>,
    remote: Option<&ItemDigest>,
    bases: &BTreeMap<String, BaseState>,
    legacy: bool,
) -> Option<SyncItem> {
    let l = side_info(local, legacy);
    let r = side_info(remote, legacy);
    match (&l.ck, &r.ck) {
        (None, None) => None,
        (Some(lc), Some(rc)) if lc == rc => None, // converged
        (Some(_), Some(_)) => {
            let base = if legacy {
                None
            } else {
                bases.get(&item_key(kind, name))
            };
            Some(decide_both(kind, name, &l, &r, base))
        }
        (Some(_), None) => one_sided(kind, name, &l, "toRemote"),
        (None, Some(_)) => one_sided(kind, name, &r, "toLocal"),
    }
}

/// Both Macs have the unit and they differ. With a base, decide fast-forward vs
/// conflict; without one, fall back to mtime (never a conflict).
fn decide_both(kind: &str, name: &str, l: &SideInfo, r: &SideInfo, base: Option<&BaseState>) -> SyncItem {
    let lc = l.ck.as_deref().unwrap_or("");
    let rc = r.ck.as_deref().unwrap_or("");
    match base {
        Some(b) => {
            let bc = b.content_key();
            let local_moved = lc != bc;
            let remote_moved = rc != bc;
            if local_moved && remote_moved {
                // Conflict: the higher (revision, device, content) wins. Both Macs
                // compare the same pair, so each picks the same winner and only the
                // direction (push vs pull) differs.
                let local_wins = (l.rev, l.device.as_str(), lc) > (r.rev, r.device.as_str(), rc);
                if local_wins {
                    item(kind, name, "toRemote", l.mtime, r.mtime, true, l.deleted)
                } else {
                    item(kind, name, "toLocal", l.mtime, r.mtime, true, r.deleted)
                }
            } else if remote_moved {
                item(kind, name, "toLocal", l.mtime, r.mtime, false, r.deleted)
            } else {
                item(kind, name, "toRemote", l.mtime, r.mtime, false, l.deleted)
            }
        }
        None => resolve_no_base(kind, name, l, r),
    }
}

/// No agreed base (first sync between these Macs, or a Phase-1 upgrade): mtime
/// direction, never a conflict. A tombstone here does not propagate the deletion —
/// the live side resurrects, matching legacy behavior — so a delete only crosses
/// once a base has been established.
fn resolve_no_base(kind: &str, name: &str, l: &SideInfo, r: &SideInfo) -> SyncItem {
    match (l.deleted, r.deleted) {
        (false, true) => item(kind, name, "toRemote", l.mtime, r.mtime, false, false),
        (true, false) => item(kind, name, "toLocal", l.mtime, r.mtime, false, false),
        _ => {
            let dir = if r.mtime > l.mtime { "toLocal" } else { "toRemote" };
            item(kind, name, dir, l.mtime, r.mtime, false, false)
        }
    }
}

/// The unit exists on only one Mac. A live unit is created on the other side
/// (globals/templates; projects are intersection-only and never reach here). A
/// tombstone with nothing on the other side is already consistent — nothing to do.
fn one_sided(kind: &str, name: &str, side: &SideInfo, direction: &str) -> Option<SyncItem> {
    if side.deleted {
        return None;
    }
    Some(if direction == "toRemote" {
        item(kind, name, "toRemote", side.mtime, 0, false, false)
    } else {
        item(kind, name, "toLocal", 0, side.mtime, false, false)
    })
}

fn item(
    kind: &str,
    name: &str,
    direction: &str,
    local_mtime: i64,
    remote_mtime: i64,
    conflict: bool,
    deleted: bool,
) -> SyncItem {
    SyncItem {
        kind: kind.to_string(),
        name: name.to_string(),
        direction: direction.to_string(),
        local_mtime,
        remote_mtime,
        conflict,
        deleted,
    }
}

/// The base to record for every unit present-and-equal on both Macs after a
/// configSync2 sync, so an already-in-sync unit's base is refreshed even though it
/// wasn't transferred (task item 2). Same domains as the plan (intersection).
pub fn converged_bases(local: &DigestMap, remote: &DigestMap) -> Vec<(String, BaseState)> {
    let mut out = Vec::new();
    for (name, l) in &local.projects {
        if let Some(r) = remote.projects.get(name) {
            push_if_equal("project", name, l, r, &mut out);
        }
    }
    for (name, l) in &local.globals {
        if let Some(r) = remote.globals.get(name) {
            push_if_equal("global", name, l, r, &mut out);
        }
    }
    for name in referenced_templates(local, remote) {
        if let (Some(l), Some(r)) = (local.templates.get(&name), remote.templates.get(&name)) {
            push_if_equal("template", &name, l, r, &mut out);
        }
    }
    out
}

fn push_if_equal(kind: &str, name: &str, l: &ItemDigest, r: &ItemDigest, out: &mut Vec<(String, BaseState)>) {
    let lck = if l.deleted { TOMBSTONE } else { l.hash.as_str() };
    let rck = if r.deleted { TOMBSTONE } else { r.hash.as_str() };
    if lck == rck {
        out.push((
            item_key(kind, name),
            BaseState {
                rev: l.rev,
                digest: if l.deleted { String::new() } else { l.hash.clone() },
                deleted: l.deleted,
            },
        ));
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
        ..Default::default()
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

/// The outcome of applying one received unit, for the sidecar update. `incoming` is
/// the portable digest of what the sender pushed; `stored` is what actually landed
/// on disk — the two differ only for the settings.json fixpoint (the local merge
/// kept extra portable keys). Empty on both for a deletion.
pub struct Applied {
    pub incoming: String,
    pub stored: String,
    pub deleted: bool,
}

/// Apply one received unit locally using the portable-merge rules. Projects are
/// never created (only updated, preserving local machine keys); templates and
/// globals may be created. A `deleted` item removes a synced-dir file (path
/// validated exactly like a write). Returns the digests needed to record the
/// sidecar; the caller updates the revision state.
pub fn apply_item(item: &WireItem) -> Result<Applied, String> {
    if item.deleted {
        if item.kind != "global" {
            return Err(format!("cannot delete {}: only global files", item.kind));
        }
        delete_global(&item.name)?;
        return Ok(Applied {
            incoming: String::new(),
            stored: String::new(),
            deleted: true,
        });
    }
    let bytes = decode(item)?;
    let incoming = portable_digest(&item.kind, &item.name, &bytes)?;
    let stored = match item.kind.as_str() {
        "project" => apply_project(&item.name, &bytes)?,
        "template" => apply_template(&item.name, &bytes)?,
        "global" => apply_global(&item.name, &bytes)?,
        other => return Err(format!("unknown item kind: {other}")),
    };
    Ok(Applied {
        incoming,
        stored,
        deleted: false,
    })
}

/// The portable digest of a unit's raw bytes, as `local_digest_map` would compute
/// it — so the sender's advertised digest can be recovered from pushed content
/// without carrying it on the wire.
pub fn portable_digest(kind: &str, name: &str, bytes: &[u8]) -> Result<String, String> {
    match kind {
        "project" => project_digest(bytes),
        "template" => Ok(sha256_hex(bytes)),
        "global" => global_digest(name, bytes),
        other => Err(format!("unknown item kind: {other}")),
    }
}

/// Remove a synced-dir global file (the only deletable globals). Missing is success
/// (idempotent). The path is validated like any write, so a peer can never remove
/// outside its allowed surface.
pub fn delete_global(name: &str) -> Result<(), String> {
    if !is_deletable_global(name) {
        return Err(format!("global not deletable: {name}"));
    }
    let path = config::lpm_dir().join(safe_global_rel(name)?);
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Apply a project and return the stored portable digest (== the incoming portable
/// digest, since the preserved machine keys are stripped from the digest anyway).
fn apply_project(name: &str, incoming: &[u8]) -> Result<String, String> {
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
    config::write_config_file(&path, &out)?;
    project_digest(incoming)
}

fn apply_template(name: &str, incoming: &[u8]) -> Result<String, String> {
    validate_simple_name(name)?;
    std::fs::create_dir_all(config::templates_dir()).map_err(|e| e.to_string())?;
    let path = config::templates_dir().join(format!("{name}.yml"));
    crate::fsatomic::write(&path, incoming, crate::fsatomic::Mode::Preserve(0o644))
        .map_err(|e| e.to_string())?;
    Ok(sha256_hex(incoming))
}

/// Apply a global and return the stored portable digest. For settings.json the
/// stored bytes are the merge of incoming over the current file, so the returned
/// digest is of the MERGED result (which may exceed the incoming digest — the
/// fixpoint the caller resolves).
fn apply_global(name: &str, incoming: &[u8]) -> Result<String, String> {
    let path = config::lpm_dir().join(safe_global_rel(name)?);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let bytes = if name == "settings.json" {
        let current = std::fs::read(&path).unwrap_or_default();
        crate::transfer::merge_settings_bytes(incoming, &current)?
    } else {
        incoming.to_vec()
    };
    crate::fsatomic::write(&path, &bytes, crate::fsatomic::Mode::Preserve(0o644))
        .map_err(|e| e.to_string())?;
    global_digest(name, &bytes)
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
    if is_sync_global_file(name) {
        return Ok(rel.to_path_buf());
    }
    for d in sync_global_dirs() {
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
    use crate::syncstate::{received_state, SyncState};

    fn digest(yaml: &str) -> String {
        project_digest(yaml.as_bytes()).unwrap()
    }

    #[test]
    fn project_digest_ignores_machine_local_keys() {
        let a = "name: web\nroot: /Users/alice/web\nservices:\n  api:\n    cmd: go run .\n";
        let b = "name: web\nroot: /Users/bob/projects/web\nssh:\n  host: h\n  user: u\nclaudeAccount: work\nparent_name: base\nworktree: true\nservices:\n  api:\n    cmd: go run .\n";
        assert_eq!(
            digest(a),
            digest(b),
            "only root/ssh/claudeAccount/parent_name/worktree differ"
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
    fn settings_digest_ignores_detached_windows() {
        // detachedWindows is per-machine (delta 2): two settings differing only in
        // it hash identically, so moving a detached window never triggers a sync.
        let a = br#"{"theme":"dark","detachedWindows":{"web":{"detached":true,"x":1}}}"#;
        let b = br#"{"theme":"dark","detachedWindows":{"api":{"detached":false,"x":9}}}"#;
        assert_eq!(settings_digest(a).unwrap(), settings_digest(b).unwrap());
        // A real portable change still differs even with detachedWindows present.
        let c = br#"{"theme":"light","detachedWindows":{"web":{"detached":true,"x":1}}}"#;
        assert_ne!(settings_digest(a).unwrap(), settings_digest(c).unwrap());
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

    fn id(hash: &str, mtime: i64) -> ItemDigest {
        ItemDigest {
            hash: hash.into(),
            mtime,
            ..Default::default()
        }
    }

    #[test]
    fn compute_plan_directions_follow_mtime() {
        let mut local = DigestMap::default();
        let mut remote = DigestMap::default();
        local.projects.insert("web".into(), id("a", 200));
        remote.projects.insert("web".into(), id("b", 100));
        // Present on both, local newer -> push local to remote.
        local.projects.insert("api".into(), id("a", 100));
        remote.projects.insert("api".into(), id("b", 300));
        // Present only locally -> not synced (projects are intersection-only).
        local.projects.insert("solo".into(), id("a", 1));

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
        local.globals.insert("global.yml".into(), id("x", 5));
        // Only remote has groups.json -> created locally.
        remote.globals.insert("groups.json".into(), id("y", 9));
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
        local.projects.insert("web".into(), id("a", 1));
        remote.projects.insert("web".into(), id("a", 1));
        local
            .project_extends
            .insert("web".into(), vec!["base".into()]);
        remote
            .project_extends
            .insert("web".into(), vec!["node".into()]);
        // Not matched (local only), its extends must be ignored.
        local.projects.insert("solo".into(), id("a", 1));
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
        // branch-name-instructions.txt joined the sync surface (delta 1), so the
        // apply-side allowlist now accepts it, like its sibling instruction files.
        assert!(safe_global_rel("branch-name-instructions.txt").is_ok());
        assert!(safe_global_rel("commit-instructions.txt").is_ok());
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
            ..Default::default()
        };
        assert_eq!(decode(&text).unwrap(), b"root: ~/x");
        let raw = [0u8, 159, 146, 150];
        let bin = WireItem {
            kind: "global".into(),
            name: "generator-icons/a.png".into(),
            enc: "b64".into(),
            content: base64_encode(&raw),
            ..Default::default()
        };
        assert_eq!(decode(&bin).unwrap(), raw);
    }

    // ---- configSync2: revision-based planning --------------------------------

    fn idv(hash: &str, rev: u64, device: &str) -> ItemDigest {
        ItemDigest {
            hash: hash.into(),
            mtime: 0,
            rev,
            device: device.into(),
            deleted: false,
        }
    }

    fn tombstone(rev: u64, device: &str) -> ItemDigest {
        ItemDigest {
            hash: String::new(),
            mtime: 0,
            rev,
            device: device.into(),
            deleted: true,
        }
    }

    fn bases(pairs: &[(&str, BaseState)]) -> BTreeMap<String, BaseState> {
        pairs.iter().map(|(k, b)| (k.to_string(), b.clone())).collect()
    }

    fn live_base(rev: u64, digest: &str) -> BaseState {
        BaseState {
            rev,
            digest: digest.into(),
            deleted: false,
        }
    }

    #[test]
    fn v2_fast_forward_pull_when_only_remote_moved() {
        let mut l = DigestMap::default();
        let mut r = DigestMap::default();
        l.projects.insert("web".into(), idv("A", 1, "da")); // unchanged since base
        r.projects.insert("web".into(), idv("B", 2, "db")); // moved
        let b = bases(&[("project/web", live_base(1, "A"))]);
        let plan = compute_plan_v2(&l, &r, &b);
        let it = plan.iter().find(|i| i.name == "web").unwrap();
        assert_eq!(it.direction, "toLocal");
        assert!(!it.conflict && !it.deleted);
    }

    #[test]
    fn v2_fast_forward_push_when_only_local_moved() {
        let mut l = DigestMap::default();
        let mut r = DigestMap::default();
        l.projects.insert("web".into(), idv("B", 2, "da")); // moved
        r.projects.insert("web".into(), idv("A", 1, "db")); // unchanged since base
        let b = bases(&[("project/web", live_base(1, "A"))]);
        let plan = compute_plan_v2(&l, &r, &b);
        let it = plan.iter().find(|i| i.name == "web").unwrap();
        assert_eq!(it.direction, "toRemote");
        assert!(!it.conflict);
    }

    #[test]
    fn v2_equal_units_produce_no_item_but_refresh_base() {
        let mut l = DigestMap::default();
        let mut r = DigestMap::default();
        l.projects.insert("web".into(), idv("X", 3, "da"));
        r.projects.insert("web".into(), idv("X", 5, "db"));
        let plan = compute_plan_v2(&l, &r, &BTreeMap::new());
        assert!(plan.is_empty());
        let refreshed = converged_bases(&l, &r);
        assert_eq!(refreshed, vec![("project/web".into(), live_base(3, "X"))]);
    }

    #[test]
    fn v2_conflict_higher_rev_wins_and_is_flagged() {
        let mut l = DigestMap::default();
        let mut r = DigestMap::default();
        l.projects.insert("web".into(), idv("LA", 6, "da")); // higher rev
        r.projects.insert("web".into(), idv("RB", 5, "db"));
        let b = bases(&[("project/web", live_base(1, "O"))]);
        let plan = compute_plan_v2(&l, &r, &b);
        let it = plan.iter().find(|i| i.name == "web").unwrap();
        assert!(it.conflict);
        assert_eq!(it.direction, "toRemote"); // local (rev 6) wins -> pushed
    }

    #[test]
    fn v2_conflict_tie_broken_by_device_and_symmetric() {
        // Equal revs -> higher device id wins. Both Macs must pick the same winner.
        let a = idv("LA", 5, "da");
        let z = idv("RB", 5, "dz");
        let base = bases(&[("project/web", live_base(1, "O"))]);
        let mut a_local = DigestMap::default();
        let mut a_remote = DigestMap::default();
        a_local.projects.insert("web".into(), a.clone()); // this Mac = "da"
        a_remote.projects.insert("web".into(), z.clone()); // peer = "dz"
        let a_plan = compute_plan_v2(&a_local, &a_remote, &base);
        let a_it = a_plan.iter().find(|i| i.name == "web").unwrap();
        // "dz" > "da" -> remote wins -> this Mac pulls.
        assert!(a_it.conflict && a_it.direction == "toLocal");

        // The peer's perspective: its local is "dz", remote is "da".
        let mut z_local = DigestMap::default();
        let mut z_remote = DigestMap::default();
        z_local.projects.insert("web".into(), z);
        z_remote.projects.insert("web".into(), a);
        let z_plan = compute_plan_v2(&z_local, &z_remote, &base);
        let z_it = z_plan.iter().find(|i| i.name == "web").unwrap();
        // Same winner ("dz"), so the peer pushes — both agree "dz" propagates.
        assert!(z_it.conflict && z_it.direction == "toRemote");
    }

    #[test]
    fn v2_delete_fast_forward_pull() {
        let mut l = DigestMap::default();
        let mut r = DigestMap::default();
        l.globals.insert("zdotdir/x".into(), idv("O", 1, "da")); // unchanged since base
        r.globals.insert("zdotdir/x".into(), tombstone(2, "db")); // deleted remotely
        let b = bases(&[("global/zdotdir/x", live_base(1, "O"))]);
        let plan = compute_plan_v2(&l, &r, &b);
        let it = plan.iter().find(|i| i.name == "zdotdir/x").unwrap();
        assert_eq!(it.direction, "toLocal");
        assert!(it.deleted && !it.conflict);
    }

    #[test]
    fn v2_delete_vs_edit_delete_wins_by_rev() {
        let mut l = DigestMap::default();
        let mut r = DigestMap::default();
        l.globals.insert("zdotdir/x".into(), tombstone(5, "da")); // deleted, higher rev
        r.globals.insert("zdotdir/x".into(), idv("RB", 4, "db")); // edited
        let b = bases(&[("global/zdotdir/x", live_base(1, "O"))]);
        let plan = compute_plan_v2(&l, &r, &b);
        let it = plan.iter().find(|i| i.name == "zdotdir/x").unwrap();
        assert!(it.conflict);
        assert_eq!(it.direction, "toRemote"); // delete wins -> push the removal
        assert!(it.deleted);
    }

    #[test]
    fn v2_delete_vs_edit_edit_wins_resurrects() {
        let mut l = DigestMap::default();
        let mut r = DigestMap::default();
        l.globals.insert("zdotdir/x".into(), idv("LA", 6, "da")); // edited, higher rev
        r.globals.insert("zdotdir/x".into(), tombstone(5, "db")); // deleted
        let b = bases(&[("global/zdotdir/x", live_base(1, "O"))]);
        let plan = compute_plan_v2(&l, &r, &b);
        let it = plan.iter().find(|i| i.name == "zdotdir/x").unwrap();
        assert!(it.conflict);
        assert_eq!(it.direction, "toRemote"); // edit wins -> push live content
        assert!(!it.deleted); // resurrect, not delete
    }

    #[test]
    fn v2_no_base_cold_start_uses_mtime_never_conflict() {
        let mut l = DigestMap::default();
        let mut r = DigestMap::default();
        // Remote has the far higher rev, but with no base rev is ignored: mtime wins.
        l.projects.insert(
            "web".into(),
            ItemDigest {
                hash: "LA".into(),
                mtime: 200,
                rev: 5,
                device: "da".into(),
                deleted: false,
            },
        );
        r.projects.insert(
            "web".into(),
            ItemDigest {
                hash: "RB".into(),
                mtime: 100,
                rev: 9,
                device: "db".into(),
                deleted: false,
            },
        );
        let plan = compute_plan_v2(&l, &r, &BTreeMap::new());
        let it = plan.iter().find(|i| i.name == "web").unwrap();
        assert!(!it.conflict);
        assert_eq!(it.direction, "toRemote"); // local mtime 200 > 100
    }

    #[test]
    fn settings_fixpoint_converges_in_one_extra_round_no_ping_pong() {
        // Model settings as a key set; the digest is the set, merge is the union.
        // Round 1: A (rev 2, "t") pushes to B, which holds the superset "tm".
        // B's merge keeps "tm" (stored != incoming) -> a self-authored bump, but the
        // base with A is A's pushed state so it pushes back exactly once.
        let (b_item, b_base) = received_state("t", 2, "A", false, "tm", 3, "B");
        assert_eq!((b_item.digest.as_str(), b_item.device.as_str(), b_item.rev), ("tm", "B", 4));
        assert_eq!(b_base, live_base(2, "t"));

        // Round 2: B (rev 4, "tm") pushes to A, which holds the subset "t". A's merge
        // yields "tm" == incoming, so it applies straight (no further bump) and both
        // Macs now agree on "tm" with a matching base -> round 3 is empty.
        let (a_item, a_base) = received_state("tm", 4, "B", false, "tm", 2, "A");
        assert_eq!((a_item.digest.as_str(), a_item.device.as_str(), a_item.rev), ("tm", "B", 4));
        assert_eq!(a_base, live_base(4, "tm"));
        // The pushing side (B) records the symmetric base on apply -> both "tm"/rev 4.
        assert_eq!(b_item.digest, a_item.digest);
    }

    #[test]
    fn legacy_view_strips_revisions_and_tombstones() {
        let mut dm = DigestMap::default();
        dm.device = "da".into();
        dm.globals.insert("zdotdir/x".into(), idv("h", 3, "da"));
        dm.globals.insert("zdotdir/gone".into(), tombstone(4, "da"));
        let lv = legacy_view(dm);
        assert!(!lv.globals.contains_key("zdotdir/gone")); // tombstone dropped
        assert_eq!(lv.globals["zdotdir/x"].rev, 0);
        assert!(lv.globals["zdotdir/x"].device.is_empty());
        assert!(lv.device.is_empty());
    }

    #[test]
    fn is_deletable_global_is_dir_files_only() {
        assert!(is_deletable_global("zdotdir/.zshrc"));
        assert!(is_deletable_global("generator-icons/a.png"));
        assert!(!is_deletable_global("settings.json")); // top-level never deletes
        assert!(!is_deletable_global("zdotdir")); // the dir itself, no file
        assert!(!is_deletable_global("notes/x")); // not a synced dir
    }

    // ---- two-sidecar simulation ----------------------------------------------

    /// One Mac's world for the simulation: a device id, its synced-dir files
    /// (content used directly as the portable digest), and its sidecar.
    struct Mac {
        state: SyncState,
        files: BTreeMap<String, String>, // item key -> content
    }

    impl Mac {
        fn new(device: &str) -> Self {
            Mac {
                state: SyncState {
                    version: 1,
                    device: device.into(),
                    items: BTreeMap::new(),
                    peers: BTreeMap::new(),
                },
                files: BTreeMap::new(),
            }
        }
        fn write(&mut self, key: &str, content: &str) {
            self.files.insert(key.into(), content.into());
        }
        fn reconcile(&mut self) {
            let present: BTreeMap<String, String> = self.files.clone();
            self.state
                .reconcile(&present, |k| k.starts_with("global/zdotdir/"));
        }
        fn map(&self) -> DigestMap {
            let mut dm = DigestMap::default();
            dm.device = self.state.device.clone();
            for (key, content) in &self.files {
                let rel = key.strip_prefix("global/").unwrap();
                let it = &self.state.items[key];
                dm.globals
                    .insert(rel.into(), idv(content, it.rev, &it.device));
            }
            for (key, it) in &self.state.items {
                if it.deleted {
                    let rel = key.strip_prefix("global/").unwrap();
                    dm.globals.insert(rel.into(), tombstone(it.rev, &it.device));
                }
            }
            dm
        }
    }

    /// Drive a full sync with `client` initiating against `host`, applying the plan
    /// exactly the way sync_run / handle_sync do (client updates its base on pull,
    /// push, and equal items; host updates its base only on a received push).
    fn sync(client: &mut Mac, host: &mut Mac) -> Vec<SyncItem> {
        client.reconcile();
        host.reconcile();
        let cmap = client.map();
        let hmap = host.map();
        let cdev = client.state.device.clone();
        let hdev = host.state.device.clone();
        let base = client.state.peers.get(&hdev).cloned().unwrap_or_default();
        let plan = compute_plan_v2(&cmap, &hmap, &base);
        for it in &plan {
            let key = item_key(&it.kind, &it.name);
            if it.direction == "toLocal" {
                let h = hmap.get(&it.kind, &it.name).unwrap();
                if it.deleted {
                    client.files.remove(&key);
                    let (istate, b) = received_state("", h.rev, &h.device, true, "", 0, &cdev);
                    client.state.set_item(&key, istate);
                    client.state.set_base(&hdev, &key, b);
                } else {
                    let content = host.files[&key].clone();
                    client.write(&key, &content);
                    let (istate, b) =
                        received_state(&h.hash, h.rev, &h.device, false, &content, 0, &cdev);
                    client.state.set_item(&key, istate);
                    client.state.set_base(&hdev, &key, b);
                }
            } else {
                let c = cmap.get(&it.kind, &it.name).unwrap();
                if it.deleted {
                    host.files.remove(&key);
                    let (istate, b) = received_state("", c.rev, &c.device, true, "", 0, &hdev);
                    host.state.set_item(&key, istate);
                    host.state.set_base(&cdev, &key, b);
                    client
                        .state
                        .set_base(&hdev, &key, BaseState { rev: c.rev, digest: String::new(), deleted: true });
                } else {
                    let content = client.files[&key].clone();
                    host.write(&key, &content);
                    let (istate, b) =
                        received_state(&c.hash, c.rev, &c.device, false, &content, 0, &hdev);
                    host.state.set_item(&key, istate);
                    host.state.set_base(&cdev, &key, b);
                    client.state.set_base(&hdev, &key, live_base(c.rev, &content));
                }
            }
        }
        for (k, b) in converged_bases(&cmap, &hmap) {
            client.state.set_base(&hdev, &k, b);
        }
        plan
    }

    #[test]
    fn two_sidecar_full_story() {
        let key = "global/zdotdir/.zshrc";
        let mut a = Mac::new("mac-a");
        let mut b = Mac::new("mac-b");
        a.write(key, "C0");
        b.write(key, "C0");

        // 1. In sync: nothing to do, the base gets established.
        assert!(sync(&mut a, &mut b).is_empty());
        assert_eq!(a.state.peers["mac-b"][key], live_base(1, "C0"));

        // 2. B edits offline, A pulls it (fast-forward, no conflict).
        b.write(key, "C1");
        let plan = sync(&mut a, &mut b);
        let it = &plan[0];
        assert!(it.direction == "toLocal" && !it.conflict);
        assert_eq!(a.files[key], "C1");

        // 3. A edits on top, pushes it (fast-forward, no conflict).
        a.write(key, "C2");
        let plan = sync(&mut a, &mut b);
        let it = &plan[0];
        assert!(it.direction == "toRemote" && !it.conflict);
        assert_eq!(b.files[key], "C2");

        // 4. Both edit concurrently, sync is a conflict with a deterministic winner.
        a.write(key, "C4");
        b.write(key, "C5");
        let plan = sync(&mut a, &mut b);
        let it = &plan[0];
        assert!(it.conflict, "concurrent edit must be flagged a conflict");
        // Equal revs -> higher device id ("mac-b") wins, so A pulls B's content.
        assert_eq!(it.direction, "toLocal");
        assert_eq!(a.files[key], "C5");

        // The loser's content (A's "C4") is what a real sync backs up before the
        // pull; both Macs converge on the winner.
        assert_eq!(a.files[key], b.files[key]);

        // Both perspectives agree on the winner: from B's side it is a push.
        b.reconcile();
        a.reconcile();
        let b_plan = compute_plan_v2(
            &b.map(),
            &a.map(),
            &b.state.peers.get("mac-a").cloned().unwrap_or_default(),
        );
        assert!(b_plan.is_empty(), "already converged after the conflict resolved");
    }
}
