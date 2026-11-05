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
// of a synced-dir file cross to the other Mac. Global lpm skills are units of their
// own (skillsync.rs), in configSync2 only and only with a peer whose map lists them,
// and so are project skills kept out of Git (skillsync_kept.rs).
// See PEER_PROTOCOL.md.
use crate::config;
use crate::lpm_commands_folds::is_folds_file;
use crate::lpm_commands_layout::is_layout_file;
use crate::skillsync;
use crate::skillsync_kept::{self, KeptSkills};
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
    is_os_junk, is_sync_global_file, sync_global_dirs, sync_global_files, PER_MACHINE_KEYS,
    PROJECT_LOCAL_KEYS,
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
    /// A project file nobody has configured yet (see `project_is_scaffold`), which
    /// must not replace a real config when no base says which side moved. Absent on
    /// a legacy map and from an older peer, where it reads as false.
    #[serde(default, skip_serializing_if = "is_false")]
    pub scaffold: bool,
}

#[derive(Serialize, Deserialize, Default, Clone, Debug)]
pub struct DigestMap {
    pub projects: BTreeMap<String, ItemDigest>,
    pub globals: BTreeMap<String, ItemDigest>,
    pub templates: BTreeMap<String, ItemDigest>,
    /// Global lpm skills. None from a peer too old to sync them, and when this
    /// computer's list can't be read, so neither side reads that as all deleted.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub skills: Option<BTreeMap<String, ItemDigest>>,
    /// Skill names that must stay as they are here, kept out of the plan both ways.
    #[serde(rename = "heldSkills", default, skip_serializing_if = "Vec::is_empty")]
    pub held_skills: Vec<String>,
    /// Project skills kept out of Git. None from a peer too old to sync them.
    #[serde(rename = "keptSkills", default, skip_serializing_if = "Option::is_none")]
    pub kept_skills: Option<KeptSkills>,
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
            skillsync::KIND => self.skills.as_ref()?.get(name),
            skillsync_kept::KIND => self.kept_skills.as_ref()?.skills.get(name),
            _ => None,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SyncItem {
    pub kind: String,      // "project" | "global" | "template" | "skill" | "kept-skill"
    pub name: String,      // project/template/skill name, global relative path, or <project>/<skill>
    pub direction: String, // "toLocal" | "toRemote"
    pub local_mtime: i64,
    pub remote_mtime: i64,
    /// The unit changed on both Macs since their last agreed base, is a project that
    /// differs with no base to compare against, or is a scaffold that moved against a
    /// real config. One side wins and the other is backed up. configSync2 only.
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
    /// A secret the unit's file leaves out — telegram.json's bot token — sent
    /// beside it so it lands in the receiver's secret store, not on its disk.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub secret: Option<String>,
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
        if let Ok(item) = project_item(&bytes, mtime_millis(&path)) {
            dm.projects.insert(name.clone(), item);
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

    if let Some(list) = skillsync::local_list() {
        dm.skills = Some(list.skills);
        dm.held_skills = list.held;
    }
    dm.kept_skills = Some(skillsync_kept::local_list(dm.projects.keys()));

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
    for (n, d) in dm.skills.iter().flatten() {
        present.insert(item_key(skillsync::KIND, n), d.hash.clone());
    }
    for (n, d) in dm.kept_skills.iter().flat_map(|kept| &kept.skills) {
        present.insert(item_key(skillsync_kept::KIND, n), d.hash.clone());
    }
    let skills_read = dm.skills.is_some();
    let held = &dm.held_skills;
    let state = crate::syncstate::mutate(|s| {
        let changed = s.reconcile(&present, |key| {
            tombstone_eligible(key)
                || skill_of(key).is_some_and(|n| skills_read && !held.iter().any(|h| h == n))
        });
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
    for (n, d) in dm.skills.iter_mut().flatten() {
        if let Some(it) = state.items.get(&item_key(skillsync::KIND, n)) {
            d.rev = it.rev;
            d.device = it.device.clone();
        }
    }
    for (n, d) in dm.kept_skills.iter_mut().flat_map(|kept| &mut kept.skills) {
        if let Some(it) = state.items.get(&item_key(skillsync_kept::KIND, n)) {
            d.rev = it.rev;
            d.device = it.device.clone();
        }
    }
    for (key, it) in &state.items {
        if !it.deleted {
            continue;
        }
        if let (Some(unit), Some(kept)) = (kept_unit_of(key), dm.kept_skills.as_mut()) {
            kept.skills.insert(
                unit.to_string(),
                ItemDigest {
                    rev: it.rev,
                    device: it.device.clone(),
                    deleted: true,
                    ..Default::default()
                },
            );
        }
        if let (Some(name), Some(skills)) = (skill_of(key), dm.skills.as_mut()) {
            skills.insert(
                name.to_string(),
                ItemDigest {
                    rev: it.rev,
                    device: it.device.clone(),
                    deleted: true,
                    ..Default::default()
                },
            );
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
                        ..Default::default()
                    },
                );
            }
        }
    }
}

/// The skill a sidecar key names.
fn skill_of(key: &str) -> Option<&str> {
    key.strip_prefix(skillsync::KIND)?.strip_prefix('/')
}

/// The `<project>/<skill>` a sidecar key names.
fn kept_unit_of(key: &str) -> Option<&str> {
    key.strip_prefix(skillsync_kept::KIND)?.strip_prefix('/')
}

/// Whether an absent sidecar entry keyed `key` should become a tombstone: files
/// under a synced global dir (generator-icons/*, zdotdir/*). A skill can too, by
/// the rule in `reconcile_and_attach`, which knows why it went.
fn tombstone_eligible(key: &str) -> bool {
    key.strip_prefix("global/")
        .map(is_deletable_global)
        .unwrap_or(false)
}

/// Whether a global relative path is a synced-dir file (the only globals a deletion
/// may cross): under a synced dir with at least one path segment beneath it, and
/// not file-browser metadata.
fn is_deletable_global(rel: &str) -> bool {
    let p = Path::new(rel);
    if p.file_name()
        .and_then(|n| n.to_str())
        .is_some_and(is_os_junk)
    {
        return false;
    }
    sync_global_dirs().any(|d| p.starts_with(d) && p.components().count() > 1)
}

/// Whether a global name is on this build's sync surface: a top-level sync file or
/// a synced-dir member.
fn syncable_global(rel: &str) -> bool {
    is_sync_global_file(rel) || is_deletable_global(rel)
}

/// Strip every configSync2-only field, so a legacy peer sees the pre-Phase-2 map:
/// no revision/author, and no tombstone entries (which it would otherwise re-create
/// as empty files).
pub fn legacy_view(mut dm: DigestMap) -> DigestMap {
    dm.device.clear();
    dm.skills = None;
    dm.held_skills.clear();
    dm.kept_skills = None;
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
        d.scaffold = false;
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
        if name.to_str().is_some_and(is_os_junk) {
            continue;
        }
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

/// Whether a unit only says which skill folders are closed.
pub(crate) fn is_folds_unit(kind: &str, name: &str) -> bool {
    kind == "global" && is_folds_file(name)
}

/// The backup ahead of applying `units`, as (kind, name). Backups are kept by count
/// and folding happens all the time, so a sync of nothing else takes none: it would
/// push out a restore point worth having.
pub(crate) fn backup_before<'a>(units: impl Iterator<Item = (&'a str, &'a str)>) -> Result<String, String> {
    let mut units = units.peekable();
    if units.peek().is_some() && units.all(|(kind, name)| is_folds_unit(kind, name)) {
        return Ok(String::new());
    }
    crate::transfer::snapshot_sync_backup()
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
    let y: serde_norway::Value = serde_norway::from_slice(bytes).map_err(|e| e.to_string())?;
    let mut j = yaml_to_json(&y);
    if let Json::Object(map) = &mut j {
        for k in PROJECT_LOCAL_KEYS {
            map.remove(k);
        }
    }
    Ok(hash_canonical(&j))
}

fn project_item(bytes: &[u8], mtime: i64) -> Result<ItemDigest, String> {
    Ok(ItemDigest {
        hash: project_digest(bytes)?,
        mtime,
        scaffold: project_is_scaffold(bytes),
        ..Default::default()
    })
}

/// Every portable key `write_project_yaml`'s callers in projects_crud.rs can write.
const SCAFFOLD_KEYS: [&str; 3] = ["name", "label", "services"];

/// Whether a project file holds only what creating a project writes. This reads the
/// shape rather than the text, since a new project's services may be detected from
/// the folder's manifests instead of the `configure me` placeholder.
fn project_is_scaffold(bytes: &[u8]) -> bool {
    let Ok(serde_norway::Value::Mapping(map)) = serde_norway::from_slice(bytes) else {
        return false;
    };
    map.keys().all(|k| {
        k.as_str()
            .is_some_and(|k| SCAFFOLD_KEYS.contains(&k) || PROJECT_LOCAL_KEYS.contains(&k))
    })
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
    serde_norway::from_slice::<ExtendsOnly>(bytes)
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
/// or, when no base exists yet (first sync / Phase-1 upgrade), `resolve_no_base`:
/// the mtime direction, except that a project scaffold always yields to a real
/// config and any other differing project is flagged a conflict. Deletions of
/// synced-dir files cross as delete items.
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
    // A peer running an older surface may still advertise units this build no
    // longer syncs (e.g. groups.json); planning them would only fail at apply.
    global_keys.retain(|n| syncable_global(n));
    // An older build refuses these files on sight, every run.
    let skills = local.skills.as_ref().zip(remote.skills.as_ref()).filter(|_| !legacy);
    if skills.is_none() {
        global_keys.retain(|n| !is_layout_file(n));
    }
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
    if let Some((l, r)) = skills {
        let free = |n: &&String| !local.held_skills.contains(n) && !remote.held_skills.contains(n);
        let names: BTreeSet<&String> = l.keys().chain(r.keys()).filter(free).collect();
        for name in names {
            let kind = skillsync::KIND;
            if let Some(it) = resolve_pair(kind, name, l.get(name), r.get(name), bases, legacy) {
                items.push(it);
            }
        }
    }
    let kept = local.kept_skills.as_ref().zip(remote.kept_skills.as_ref()).filter(|_| !legacy);
    if let Some((l, r)) = kept {
        for unit in skillsync_kept::shared_units(l, r) {
            let (kind, ld, rd) = (skillsync_kept::KIND, l.skills.get(unit), r.skills.get(unit));
            if let Some(it) = resolve_pair(kind, unit, ld, rd, bases, legacy) {
                items.push(it);
            }
        }
    }
    items
}

/// Skills that stay on one computer because the other keeps something else under
/// that name, to say so rather than leave them missing without a word.
pub fn skipped_skills(local: &DigestMap, remote: &DigestMap) -> Vec<String> {
    let blocked = |skills: &BTreeMap<String, ItemDigest>, held: &[String]| {
        let live = |n: &&String| skills.get(*n).is_some_and(|d| !d.deleted);
        held.iter().filter(live).cloned().collect::<Vec<_>>()
    };
    let mut names = Vec::new();
    if let (Some(l), Some(r)) = (&local.skills, &remote.skills) {
        names.extend(blocked(l, &remote.held_skills));
        names.extend(blocked(r, &local.held_skills));
    }
    if let (Some(l), Some(r)) = (&local.kept_skills, &remote.kept_skills) {
        names.extend(skillsync_kept::skipped(l, r));
    }
    names.sort();
    names.dedup();
    names
}

/// One Mac's contribution to a decision. `ck` (content key) is None when the unit
/// is absent, `Some(TOMBSTONE)` when deleted, `Some(digest)` when live. In legacy
/// mode a tombstone folds to absent, reproducing the pre-Phase-2 behavior where a
/// deletion simply resurrects, and `scaffold` folds to false.
struct SideInfo {
    ck: Option<String>,
    rev: u64,
    device: String,
    mtime: i64,
    deleted: bool,
    scaffold: bool,
}

fn side_info(d: Option<&ItemDigest>, legacy: bool) -> SideInfo {
    match d {
        Some(x) if x.deleted && !legacy => SideInfo {
            ck: Some(TOMBSTONE.to_string()),
            rev: x.rev,
            device: x.device.clone(),
            mtime: x.mtime,
            deleted: true,
            scaffold: false,
        },
        Some(x) if !x.deleted => SideInfo {
            ck: Some(x.hash.clone()),
            rev: x.rev,
            device: x.device.clone(),
            mtime: x.mtime,
            deleted: false,
            scaffold: x.scaffold && !legacy,
        },
        _ => SideInfo {
            ck: None,
            rev: 0,
            device: String::new(),
            mtime: 0,
            deleted: false,
            scaffold: false,
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
            Some(decide_both(kind, name, &l, &r, base, legacy))
        }
        (Some(_), None) => one_sided(kind, name, &l, "toRemote"),
        (None, Some(_)) => one_sided(kind, name, &r, "toLocal"),
    }
}

/// Both Macs have the unit and they differ. With a base, decide fast-forward vs
/// conflict; without one, `resolve_no_base` decides.
///
/// Deleting and re-adding a project on one Mac leaves a scaffold that reads as an
/// edit off the base, so a scaffold that moved never replaces a real config: the
/// config wins whatever the revisions, flagged because it may undo a deliberate
/// edit. Configuring a scaffold moves the other way and stays a fast-forward.
fn decide_both(
    kind: &str,
    name: &str,
    l: &SideInfo,
    r: &SideInfo,
    base: Option<&BaseState>,
    legacy: bool,
) -> SyncItem {
    let lc = l.ck.as_deref().unwrap_or("");
    let rc = r.ck.as_deref().unwrap_or("");
    match base {
        Some(b) => {
            let bc = b.content_key();
            let local_moved = lc != bc;
            let remote_moved = rc != bc;
            let replaces_config = |moved: bool, new: &SideInfo, other: &SideInfo| {
                kind == "project" && moved && new.scaffold && !other.scaffold
            };
            if replaces_config(remote_moved, r, l) {
                item(kind, name, "toRemote", l.mtime, r.mtime, true, l.deleted)
            } else if replaces_config(local_moved, l, r) {
                item(kind, name, "toLocal", l.mtime, r.mtime, true, r.deleted)
            } else if local_moved && remote_moved {
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
        None => resolve_no_base(kind, name, l, r, legacy),
    }
}

/// No agreed base (first sync between these Macs, or a Phase-1 upgrade). A tombstone
/// does not propagate the deletion — the live side resurrects, matching legacy
/// behavior — so a delete only crosses once a base has been established. Globals,
/// templates and every legacy plan take the mtime direction, never a conflict.
///
/// mtime says nothing about a project here: one just created on this Mac is newer
/// than the real config it shares a name with. So a scaffold always yields to the
/// other side, and any other pair still follows mtime but is flagged, as nothing
/// shows which side moved. Content settles an mtime tie so both Macs pick the same
/// winner.
fn resolve_no_base(kind: &str, name: &str, l: &SideInfo, r: &SideInfo, legacy: bool) -> SyncItem {
    match (l.deleted, r.deleted) {
        (false, true) => item(kind, name, "toRemote", l.mtime, r.mtime, false, false),
        (true, false) => item(kind, name, "toLocal", l.mtime, r.mtime, false, false),
        _ if matches!(kind, "project" | skillsync::KIND | skillsync_kept::KIND) && !legacy => {
            let (dir, conflict) = match (l.scaffold, r.scaffold) {
                (true, false) => ("toLocal", false),
                (false, true) => ("toRemote", false),
                _ if (r.mtime, &r.ck) > (l.mtime, &l.ck) => ("toLocal", true),
                _ => ("toRemote", true),
            };
            item(kind, name, dir, l.mtime, r.mtime, conflict, false)
        }
        _ => {
            let dir = if r.mtime > l.mtime {
                "toLocal"
            } else {
                "toRemote"
            };
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
    for (name, l) in local.skills.iter().flatten() {
        if let Some(r) = remote.skills.as_ref().and_then(|skills| skills.get(name)) {
            push_if_equal(skillsync::KIND, name, l, r, &mut out);
        }
    }
    if let (Some(l), Some(r)) = (&local.kept_skills, &remote.kept_skills) {
        for unit in skillsync_kept::shared_units(l, r) {
            if let (Some(ld), Some(rd)) = (l.skills.get(unit), r.skills.get(unit)) {
                push_if_equal(skillsync_kept::KIND, unit, ld, rd, &mut out);
            }
        }
    }
    out
}

fn push_if_equal(
    kind: &str,
    name: &str,
    l: &ItemDigest,
    r: &ItemDigest,
    out: &mut Vec<(String, BaseState)>,
) {
    let lck = if l.deleted {
        TOMBSTONE
    } else {
        l.hash.as_str()
    };
    let rck = if r.deleted {
        TOMBSTONE
    } else {
        r.hash.as_str()
    };
    if lck == rck {
        out.push((
            item_key(kind, name),
            BaseState {
                rev: l.rev,
                digest: if l.deleted {
                    String::new()
                } else {
                    l.hash.clone()
                },
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
    if kind == skillsync::KIND {
        return skillsync::read_item(name);
    }
    if kind == skillsync_kept::KIND {
        return skillsync_kept::read_item(name);
    }
    let path = read_path(kind, name)?;
    let mut bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    if kind == "project" {
        bytes = without_account_list(bytes);
    }
    let mtime = mtime_millis(&path);
    let secret = (kind == "global" && name == crate::telegramlink::FILE)
        .then(|| crate::telegramsync::outgoing_secret(&bytes))
        .flatten();
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
        secret,
        ..Default::default()
    })
}

/// A project's own Claude account list names accounts on this Mac only. The
/// receiver keeps its own anyway, and an older build that doesn't know the key
/// as machine-local would store this Mac's list and never match digests again,
/// so it is not sent.
fn without_account_list(bytes: Vec<u8>) -> Vec<u8> {
    let Ok(mut y) = serde_norway::from_slice::<serde_norway::Value>(&bytes) else {
        return bytes;
    };
    let removed = y
        .as_mapping_mut()
        .and_then(|m| m.remove(serde_norway::Value::String("claudeAccounts".into())))
        .is_some();
    match removed.then(|| serde_norway::to_string(&y)).transpose() {
        Ok(Some(out)) => out.into_bytes(),
        _ => bytes,
    }
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
        delete_item(&item.kind, &item.name)?;
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
        skillsync::KIND => skillsync::apply(&item.name, &bytes)?,
        skillsync_kept::KIND => skillsync_kept::apply(&item.name, &bytes)?,
        "global" => {
            if item.name == crate::telegramlink::FILE {
                crate::telegramsync::adopt(&bytes, item.secret.as_deref())?;
            }
            apply_global(&item.name, &bytes)?
        }
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
        skillsync::KIND | skillsync_kept::KIND => skillsync::wire_digest(bytes),
        "global" => global_digest(name, bytes),
        other => Err(format!("unknown item kind: {other}")),
    }
}

/// Remove what a deletion names, on the only surfaces one can cross.
pub fn delete_item(kind: &str, name: &str) -> Result<(), String> {
    match kind {
        "global" => delete_global(name),
        skillsync::KIND => skillsync::delete(name),
        skillsync_kept::KIND => skillsync_kept::delete(name),
        other => Err(format!("cannot delete {other}: only global files and skills")),
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
    let mut incoming_v: serde_norway::Value =
        serde_norway::from_slice(incoming).map_err(|e| e.to_string())?;
    let local_v: serde_norway::Value =
        serde_norway::from_slice(&std::fs::read(&path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    if let serde_norway::Value::Mapping(map) = &mut incoming_v {
        for k in PROJECT_LOCAL_KEYS {
            let key = serde_norway::Value::String(k.to_string());
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
    let out = serde_norway::to_string(&incoming_v).map_err(|e| e.to_string())?;
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
    let mode = crate::syncsurface::new_global_file_mode(name);
    crate::fsatomic::write(&path, &bytes, crate::fsatomic::Mode::Preserve(mode))
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
    if syncable_global(name) {
        return Ok(rel.to_path_buf());
    }
    Err(format!("global not permitted: {name}"))
}

fn validate_simple_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.contains('/') || name.contains('\\') || name == "." || name == ".." {
        return Err(format!("invalid name: {name:?}"));
    }
    Ok(())
}

pub(crate) fn mtime_millis(path: &Path) -> i64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub(crate) fn sha256_hex(bytes: &[u8]) -> String {
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

fn yaml_to_json(y: &serde_norway::Value) -> Json {
    match y {
        serde_norway::Value::Null => Json::Null,
        serde_norway::Value::Bool(b) => Json::Bool(*b),
        serde_norway::Value::Number(n) => {
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
        serde_norway::Value::String(s) => Json::String(s.clone()),
        serde_norway::Value::Sequence(seq) => Json::Array(seq.iter().map(yaml_to_json).collect()),
        serde_norway::Value::Mapping(m) => {
            let mut obj = serde_json::Map::new();
            for (k, val) in m {
                let key = match k {
                    serde_norway::Value::String(s) => s.clone(),
                    other => serde_norway::to_string(other)
                        .unwrap_or_default()
                        .trim()
                        .to_string(),
                };
                obj.insert(key, yaml_to_json(val));
            }
            Json::Object(obj)
        }
        serde_norway::Value::Tagged(t) => yaml_to_json(&t.value),
    }
}

pub(crate) fn base64_encode(bytes: &[u8]) -> String {
    use base64::Engine as _;
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

pub(crate) fn base64_decode(s: &str) -> Result<Vec<u8>, String> {
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
    fn the_account_list_is_neither_compared_nor_sent() {
        let own = "name: web\nroot: /x\nclaudeAccounts: [work, default]\nservices:\n  api:\n    cmd: run\n";
        let none = "name: web\nroot: /x\nservices:\n  api:\n    cmd: run\n";
        assert_eq!(digest(own), digest(none));
        let sent = String::from_utf8(without_account_list(own.as_bytes().to_vec())).unwrap();
        assert!(!sent.contains("claudeAccounts"));
        assert_eq!(digest(&sent), digest(none));
        assert_eq!(
            without_account_list(none.as_bytes().to_vec()),
            none.as_bytes()
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
        let mut inc: serde_norway::Value = serde_norway::from_slice(incoming.as_bytes()).unwrap();
        let local: serde_norway::Value =
            serde_norway::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        if let serde_norway::Value::Mapping(map) = &mut inc {
            for k in PROJECT_LOCAL_KEYS {
                let key = serde_norway::Value::String(k.to_string());
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
        let out: serde_norway::Value =
            serde_norway::from_str(&serde_norway::to_string(&inc).unwrap()).unwrap();
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
        // Only remote has composer-actions.json -> created locally.
        remote
            .globals
            .insert("composer-actions.json".into(), id("y", 9));
        // An older peer still advertising groups.json is ignored, not pulled.
        remote.globals.insert("groups.json".into(), id("z", 9));
        let plan = compute_plan(&local, &remote);
        let g = plan
            .iter()
            .find(|i| i.name == "composer-actions.json")
            .unwrap();
        assert_eq!(g.direction, "toLocal");
        assert_eq!(g.kind, "global");
        // A global present on only one side flows to the other (create, never delete).
        let l = plan.iter().find(|i| i.name == "global.yml").unwrap();
        assert_eq!(l.direction, "toRemote");
        assert!(plan.iter().all(|i| i.name != "groups.json"));
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
        // groups.json left the sync surface — a peer may no longer write it.
        assert!(safe_global_rel("groups.json").is_err());
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
    fn collect_global_dir_keys_memory_sessions_by_project() {
        let lpm = tempfile::tempdir().unwrap();
        let web = lpm.path().join("memory/web");
        std::fs::create_dir_all(&web).unwrap();
        std::fs::write(web.join("auth-refactor.md"), "# Auth\n").unwrap();
        std::fs::create_dir_all(lpm.path().join("memory/api")).unwrap();
        std::fs::write(lpm.path().join("memory/api/perf.md"), "# Perf\n").unwrap();

        let mut out = BTreeMap::new();
        collect_global_dir(lpm.path(), Path::new("memory"), &mut out);

        let keys: Vec<&String> = out.keys().collect();
        assert_eq!(
            keys,
            vec!["memory/api/perf.md", "memory/web/auth-refactor.md"]
        );
        assert_eq!(
            out["memory/web/auth-refactor.md"].hash,
            sha256_hex(b"# Auth\n")
        );
        // Every key the walk produces must survive the apply-side allowlist.
        for k in out.keys() {
            assert!(safe_global_rel(k).is_ok(), "{k} rejected on apply");
        }
    }

    #[test]
    fn memory_sessions_are_syncable_two_levels_deep() {
        // Session memory lives one level deeper than the flat synced dirs.
        assert!(safe_global_rel("memory/web/auth-refactor.md").is_ok());
        assert!(safe_global_rel("memory/../../secret").is_err());
        // The dir itself is not a unit, so it can never be written or tombstoned.
        assert!(safe_global_rel("memory").is_err());
        assert!(!is_deletable_global("memory"));
        // A session file is deletable, so removing it on one Mac crosses to the
        // other instead of being resurrected.
        assert!(is_deletable_global("memory/web/auth-refactor.md"));
        assert!(syncable_global("memory/web/auth-refactor.md"));
    }

    #[test]
    fn finder_metadata_in_a_synced_dir_never_syncs() {
        let lpm = tempfile::tempdir().unwrap();
        let web = lpm.path().join("memory/web");
        std::fs::create_dir_all(&web).unwrap();
        std::fs::write(web.join("auth-refactor.md"), "# Auth\n").unwrap();
        std::fs::write(lpm.path().join("memory/.DS_Store"), [0u8, 1]).unwrap();
        std::fs::write(web.join(".DS_Store"), [0u8, 2]).unwrap();

        let mut out = BTreeMap::new();
        collect_global_dir(lpm.path(), Path::new("memory"), &mut out);
        let keys: Vec<&String> = out.keys().collect();
        assert_eq!(keys, vec!["memory/web/auth-refactor.md"]);

        // An older peer that still tracks it can neither push it nor delete it here,
        // and a sidecar entry already recorded for it never becomes a tombstone.
        assert!(safe_global_rel("memory/.DS_Store").is_err());
        assert!(safe_global_rel("generator-icons/Thumbs.db").is_err());
        assert!(!syncable_global("memory/.DS_Store"));
        assert!(!tombstone_eligible("global/memory/.DS_Store"));
        assert!(delete_global("memory/.DS_Store").is_err());
    }

    #[test]
    fn a_peer_advertising_finder_metadata_plans_nothing() {
        let local = DigestMap::default();
        let mut remote = DigestMap::default();
        remote.globals.insert("memory/.DS_Store".into(), id("x", 9));
        assert!(compute_plan(&local, &remote).is_empty());
        assert!(compute_plan_v2(&local, &remote, &BTreeMap::new()).is_empty());
    }

    #[test]
    fn action_scripts_sync_and_their_deletions_cross() {
        assert!(safe_global_rel("scripts/disk-cleanup.sh").is_ok());
        assert!(safe_global_rel("scripts/deploy/prod.sh").is_ok());
        assert!(safe_global_rel("scripts/../peer.json").is_err());
        assert!(safe_global_rel("scripts").is_err());
        assert!(is_deletable_global("scripts/disk-cleanup.sh"));
        assert!(!is_deletable_global("scripts/.DS_Store"));
    }

    #[test]
    fn a_secret_rides_only_when_there_is_one() {
        let plain = WireItem {
            kind: "global".into(),
            name: "global.yml".into(),
            ..Default::default()
        };
        assert!(serde_json::to_value(&plain).unwrap().get("secret").is_none());
        let with = WireItem {
            secret: Some("123:abc".into()),
            ..plain
        };
        let back: WireItem = serde_json::from_value(serde_json::to_value(&with).unwrap()).unwrap();
        assert_eq!(back.secret.as_deref(), Some("123:abc"));
        assert!(safe_global_rel("telegram.json").is_ok());
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
            ..Default::default()
        }
    }

    fn tombstone(rev: u64, device: &str) -> ItemDigest {
        ItemDigest {
            hash: String::new(),
            mtime: 0,
            rev,
            device: device.into(),
            deleted: true,
            ..Default::default()
        }
    }

    fn bases(pairs: &[(&str, BaseState)]) -> BTreeMap<String, BaseState> {
        pairs
            .iter()
            .map(|(k, b)| (k.to_string(), b.clone()))
            .collect()
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

    fn scaffold(hash: &str, mtime: i64) -> ItemDigest {
        ItemDigest {
            scaffold: true,
            ..id(hash, mtime)
        }
    }

    fn project_maps(local: ItemDigest, remote: ItemDigest) -> (DigestMap, DigestMap) {
        let mut l = DigestMap::default();
        let mut r = DigestMap::default();
        l.projects.insert("web".into(), local);
        r.projects.insert("web".into(), remote);
        (l, r)
    }

    fn no_base_project(local: ItemDigest, remote: ItemDigest) -> SyncItem {
        let (l, r) = project_maps(local, remote);
        compute_plan_v2(&l, &r, &BTreeMap::new()).remove(0)
    }

    #[test]
    fn v2_no_base_project_follows_mtime_and_flags_a_conflict() {
        // Remote has the far higher rev, but with no base rev is ignored: mtime wins.
        let local = ItemDigest {
            rev: 5,
            device: "da".into(),
            ..id("LA", 200)
        };
        let remote = ItemDigest {
            rev: 9,
            device: "db".into(),
            ..id("RB", 100)
        };
        let it = no_base_project(local, remote);
        assert!(it.conflict);
        assert_eq!(it.direction, "toRemote"); // local mtime 200 > 100
    }

    #[test]
    fn v2_no_base_scaffold_on_the_remote_never_replaces_local_config() {
        let local = ItemDigest {
            rev: 1,
            device: "da".into(),
            ..id("CONFIGURED", 100)
        };
        let remote = ItemDigest {
            rev: 9,
            device: "db".into(),
            ..scaffold("STUB", 200)
        };
        let it = no_base_project(local, remote);
        assert_eq!(it.direction, "toRemote");
        assert!(!it.conflict);
    }

    #[test]
    fn v2_no_base_scaffold_on_this_mac_takes_the_remote_config() {
        let local = ItemDigest {
            rev: 9,
            device: "da".into(),
            ..scaffold("STUB", 200)
        };
        let remote = ItemDigest {
            rev: 1,
            device: "db".into(),
            ..id("CONFIGURED", 100)
        };
        let it = no_base_project(local, remote);
        assert_eq!(it.direction, "toLocal");
        assert!(!it.conflict);
    }

    #[test]
    fn v2_no_base_two_scaffolds_follow_mtime_and_flag_a_conflict() {
        let it = no_base_project(scaffold("A", 200), scaffold("B", 100));
        assert_eq!(it.direction, "toRemote");
        assert!(it.conflict);
        let it = no_base_project(scaffold("A", 100), scaffold("B", 200));
        assert_eq!(it.direction, "toLocal");
        assert!(it.conflict);
    }

    #[test]
    fn v2_no_base_project_winner_is_the_same_from_either_mac() {
        let pairs = [
            (scaffold("STUB", 200), id("CONFIGURED", 100)),
            (scaffold("STUB", 100), id("CONFIGURED", 200)),
            (scaffold("A", 200), scaffold("B", 100)),
            (id("A", 200), id("B", 100)),
            // An mtime tie must not leave each Mac pushing its own copy.
            (id("A", 100), id("B", 100)),
            (scaffold("A", 100), scaffold("B", 100)),
            (scaffold("STUB", 100), id("CONFIGURED", 100)),
        ];
        for (a, b) in pairs {
            let from_a = no_base_project(a.clone(), b.clone());
            let from_b = no_base_project(b, a);
            assert_ne!(from_a.direction, from_b.direction);
            assert_eq!(from_a.conflict, from_b.conflict);
        }
    }

    #[test]
    fn v2_no_base_globals_and_templates_keep_mtime_without_a_conflict() {
        let mut l = DigestMap::default();
        let mut r = DigestMap::default();
        l.projects.insert("web".into(), id("same", 1));
        r.projects.insert("web".into(), id("same", 1));
        l.project_extends.insert("web".into(), vec!["base".into()]);
        l.globals.insert("global.yml".into(), id("LA", 100));
        r.globals.insert("global.yml".into(), scaffold("RB", 200));
        l.templates.insert("base".into(), scaffold("LA", 200));
        r.templates.insert("base".into(), id("RB", 100));
        let plan = compute_plan_v2(&l, &r, &BTreeMap::new());
        let global = plan.iter().find(|i| i.kind == "global").unwrap();
        assert_eq!(global.direction, "toLocal");
        assert!(!global.conflict);
        let template = plan.iter().find(|i| i.kind == "template").unwrap();
        assert_eq!(template.direction, "toRemote");
        assert!(!template.conflict);
    }

    #[test]
    fn v2_no_base_tombstones_still_resurrect_before_any_scaffold_rule() {
        let (mut l, mut r) = project_maps(scaffold("STUB", 1), tombstone(9, "db"));
        l.globals.insert("zdotdir/x".into(), tombstone(9, "da"));
        r.globals.insert("zdotdir/x".into(), id("LIVE", 1));
        let plan = compute_plan_v2(&l, &r, &BTreeMap::new());
        let project = plan.iter().find(|i| i.kind == "project").unwrap();
        assert_eq!(project.direction, "toRemote");
        assert!(!project.conflict && !project.deleted);
        let global = plan.iter().find(|i| i.kind == "global").unwrap();
        assert_eq!(global.direction, "toLocal");
        assert!(!global.conflict && !global.deleted);
    }

    fn readded_scaffold() -> ItemDigest {
        ItemDigest {
            rev: 7,
            device: "db".into(),
            ..scaffold("STUB", 1)
        }
    }

    #[test]
    fn v2_a_project_readded_on_the_remote_never_replaces_local_config() {
        let (l, r) = project_maps(idv("CONFIGURED", 1, "da"), readded_scaffold());
        let b = bases(&[("project/web", live_base(1, "CONFIGURED"))]);
        let plan = compute_plan_v2(&l, &r, &b);
        assert_eq!(plan[0].direction, "toRemote");
        assert!(plan[0].conflict);
    }

    #[test]
    fn v2_a_project_readded_on_this_mac_takes_the_remote_config() {
        let (l, r) = project_maps(readded_scaffold(), idv("CONFIGURED", 1, "da"));
        let b = bases(&[("project/web", live_base(1, "CONFIGURED"))]);
        let plan = compute_plan_v2(&l, &r, &b);
        assert_eq!(plan[0].direction, "toLocal");
        assert!(plan[0].conflict);
    }

    #[test]
    fn v2_when_both_moved_a_scaffold_loses_despite_the_higher_revision() {
        let (l, r) = project_maps(idv("CONFIGURED", 2, "da"), readded_scaffold());
        let b = bases(&[("project/web", live_base(1, "OLD"))]);
        let plan = compute_plan_v2(&l, &r, &b);
        assert_eq!(plan[0].direction, "toRemote");
        assert!(plan[0].conflict);
    }

    #[test]
    fn v2_configuring_a_scaffold_is_a_plain_fast_forward() {
        let b = bases(&[("project/web", live_base(1, "STUB"))]);

        let (l, r) = project_maps(scaffold("STUB", 1), idv("CONFIGURED", 2, "db"));
        let plan = compute_plan_v2(&l, &r, &b);
        assert_eq!(plan[0].direction, "toLocal");
        assert!(!plan[0].conflict);

        let (l, r) = project_maps(idv("CONFIGURED", 2, "da"), scaffold("STUB", 1));
        let plan = compute_plan_v2(&l, &r, &b);
        assert_eq!(plan[0].direction, "toRemote");
        assert!(!plan[0].conflict);
    }

    #[test]
    fn v2_with_a_base_two_scaffolds_fast_forward_as_usual() {
        let (l, r) = project_maps(scaffold("OLD", 1), scaffold("NEW", 1));
        let b = bases(&[("project/web", live_base(1, "OLD"))]);
        let plan = compute_plan_v2(&l, &r, &b);
        assert_eq!(plan[0].direction, "toLocal");
        assert!(!plan[0].conflict);
    }

    #[test]
    fn v2_with_a_base_the_winner_is_the_same_from_either_mac() {
        let configured = idv("CONFIGURED", 1, "da");
        let b = bases(&[("project/web", live_base(1, "CONFIGURED"))]);
        let (l, r) = project_maps(configured.clone(), readded_scaffold());
        let from_a = compute_plan_v2(&l, &r, &b).remove(0);
        let (l, r) = project_maps(readded_scaffold(), configured);
        let from_b = compute_plan_v2(&l, &r, &b).remove(0);
        assert_ne!(from_a.direction, from_b.direction);
        assert_eq!(from_a.conflict, from_b.conflict);
    }

    #[test]
    fn v2_with_a_base_only_projects_honour_the_scaffold_flag() {
        let mut l = DigestMap::default();
        let mut r = DigestMap::default();
        l.globals.insert("global.yml".into(), id("BASE", 1));
        r.globals.insert("global.yml".into(), scaffold("NEW", 1));
        let b = bases(&[("global/global.yml", live_base(1, "BASE"))]);
        let plan = compute_plan_v2(&l, &r, &b);
        assert_eq!(plan[0].direction, "toLocal");
        assert!(!plan[0].conflict);
    }

    #[test]
    fn legacy_plan_ignores_the_scaffold_flag() {
        let (l, r) = project_maps(id("CONFIGURED", 100), scaffold("STUB", 200));
        let plan = compute_plan(&l, &r);
        assert_eq!(plan[0].direction, "toLocal");
        assert!(!plan[0].conflict);

        let (l, r) = project_maps(id("A", 200), id("B", 100));
        let plan = compute_plan(&l, &r);
        assert_eq!(plan[0].direction, "toRemote");
        assert!(!plan[0].conflict);
    }

    #[test]
    fn scaffold_is_only_on_the_wire_when_set() {
        let plain: ItemDigest = serde_json::from_str(r#"{"hash":"h","mtime":1}"#).unwrap();
        assert!(!plain.scaffold);
        assert!(serde_json::to_value(&plain)
            .unwrap()
            .get("scaffold")
            .is_none());
        let flagged = serde_json::to_value(scaffold("h", 1)).unwrap();
        assert_eq!(flagged["scaffold"], true);
        let back: ItemDigest = serde_json::from_value(flagged).unwrap();
        assert!(back.scaffold);
    }

    #[test]
    fn a_newly_created_project_file_never_replaces_a_configured_one() {
        let stub = b"name: web\nroot: ~/web\nservices:\n  dev:\n    cmd: echo 'configure me'\nclaudeAccount: ''\n";
        let configured = b"name: web\nroot: ~/web\nservices:\n  dev:\n    cmd: echo 'configure me'\nactions:\n  release:\n    cmd: ./scripts/release.sh\n";
        let stub_item = project_item(stub, 200).unwrap();
        let configured_item = project_item(configured, 100).unwrap();

        let it = no_base_project(configured_item.clone(), stub_item.clone());
        assert_eq!(it.direction, "toRemote");
        assert!(!it.conflict);

        let it = no_base_project(stub_item, configured_item);
        assert_eq!(it.direction, "toLocal");
        assert!(!it.conflict);
    }

    #[test]
    fn a_new_project_with_the_placeholder_service_is_a_scaffold() {
        let stub = "name: voice-to-text\nroot: ~/Projects/voice-to-text\nservices:\n  dev:\n    cmd: echo 'configure me'\nclaudeAccount: ''\n";
        assert!(project_is_scaffold(stub.as_bytes()));
    }

    #[test]
    fn every_shape_a_project_creator_writes_is_a_scaffold() {
        let shapes = [
            // create_project / run_clone with services detected from the folder.
            "name: web\nroot: ~/web\nservices:\n  next:\n    cmd: npm run dev\n    cwd: frontend\n    port: 3000\n  api:\n    cmd: go run .\n",
            // The folder's repo .lpm.yml declares the services.
            "name: web\nroot: ~/web\n",
            // register_synced_project, with and without a twin.
            "name: web\nroot: ~/web\nparent_name: web-main\n",
            // create_ssh_project.
            "name: web\nssh:\n  host: h\n  user: u\nservices:\n  shell:\n    cmd: exec \"$SHELL\" -l\n",
            // run_duplicate.
            "name: web-1\nroot: ~/web-1\nparent_name: web\nlabel: Copy\n",
            // run_worktree_duplicate.
            "name: web-1\nroot: ~/web-1\nparent_name: web\nworktree: true\nlabel: Copy\n",
        ];
        for shape in shapes {
            assert!(project_is_scaffold(shape.as_bytes()), "{shape}");
        }
    }

    #[test]
    fn any_key_beyond_the_scaffold_is_real_config() {
        let base = "name: web\nroot: ~/web\nservices:\n  dev:\n    cmd: echo 'configure me'\n";
        for extra in [
            "actions:\n  build:\n    cmd: make\n",
            "terminals:\n  claude:\n    cmd: claude\n",
            "profiles:\n  default: [dev]\n",
            "jobs:\n  nightly:\n    prompt: x\n",
            "extends:\n  - base\n",
            "work_status:\n  state: done\n",
        ] {
            let config = format!("{base}{extra}");
            assert!(!project_is_scaffold(config.as_bytes()), "{extra}");
        }
        let full = "name: voice-to-text\nroot: ~/Projects/voice-to-text\nlabel: Voice\nservices:\n  dev:\n    cmd: make dev\nactions:\n  release:\n    cmd: ./release.sh\n  open:\n    cmd: open .\nterminals:\n  claude:\n    cmd: claude\nprofiles:\n  default: [dev]\n";
        assert!(!project_is_scaffold(full.as_bytes()));
    }

    #[test]
    fn unreadable_project_bytes_are_not_a_scaffold() {
        for garbage in [
            &b"\xff\xfe\x00\x01"[..],
            b"name: [unterminated",
            b"- a\n- b\n",
            b"just text",
            b"",
            b"1: numeric key\n",
        ] {
            assert!(!project_is_scaffold(garbage));
        }
    }

    #[test]
    fn settings_fixpoint_converges_in_one_extra_round_no_ping_pong() {
        // Model settings as a key set; the digest is the set, merge is the union.
        // Round 1: A (rev 2, "t") pushes to B, which holds the superset "tm".
        // B's merge keeps "tm" (stored != incoming) -> a self-authored bump, but the
        // base with A is A's pushed state so it pushes back exactly once.
        let (b_item, b_base) = received_state("t", 2, "A", false, "tm", 3, "B");
        assert_eq!(
            (b_item.digest.as_str(), b_item.device.as_str(), b_item.rev),
            ("tm", "B", 4)
        );
        assert_eq!(b_base, live_base(2, "t"));

        // Round 2: B (rev 4, "tm") pushes to A, which holds the subset "t". A's merge
        // yields "tm" == incoming, so it applies straight (no further bump) and both
        // Macs now agree on "tm" with a matching base -> round 3 is empty.
        let (a_item, a_base) = received_state("tm", 4, "B", false, "tm", 2, "A");
        assert_eq!(
            (a_item.digest.as_str(), a_item.device.as_str(), a_item.rev),
            ("tm", "B", 4)
        );
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
        dm.projects.insert("web".into(), scaffold("h", 1));
        let lv = legacy_view(dm);
        assert!(!lv.globals.contains_key("zdotdir/gone")); // tombstone dropped
        assert!(!lv.projects["web"].scaffold);
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
                    client.state.set_base(
                        &hdev,
                        &key,
                        BaseState {
                            rev: c.rev,
                            digest: String::new(),
                            deleted: true,
                        },
                    );
                } else {
                    let content = client.files[&key].clone();
                    host.write(&key, &content);
                    let (istate, b) =
                        received_state(&c.hash, c.rev, &c.device, false, &content, 0, &hdev);
                    host.state.set_item(&key, istate);
                    host.state.set_base(&cdev, &key, b);
                    client
                        .state
                        .set_base(&hdev, &key, live_base(c.rev, &content));
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
        assert!(
            b_plan.is_empty(),
            "already converged after the conflict resolved"
        );
    }

    fn skill(hash: &str, rev: u64, device: &str, mtime: i64) -> ItemDigest {
        ItemDigest {
            hash: hash.into(),
            mtime,
            rev,
            device: device.into(),
            ..Default::default()
        }
    }

    fn skill_map(entries: &[(&str, ItemDigest)], held: &[&str]) -> DigestMap {
        DigestMap {
            skills: Some(entries.iter().map(|(n, d)| (n.to_string(), d.clone())).collect()),
            held_skills: held.iter().map(|n| n.to_string()).collect(),
            ..Default::default()
        }
    }

    fn base(hash: &str) -> BaseState {
        BaseState {
            rev: 1,
            digest: hash.into(),
            deleted: false,
        }
    }

    fn skill_plan(local: &DigestMap, remote: &DigestMap) -> Vec<SyncItem> {
        compute_plan_v2(local, remote, &BTreeMap::new())
    }

    #[test]
    fn a_skill_on_one_computer_is_created_on_the_other() {
        let local = skill_map(&[("deploy", skill("a", 1, "me", 5))], &[]);
        let remote = skill_map(&[("review", skill("b", 1, "you", 5))], &[]);
        let plan = skill_plan(&local, &remote);
        let pairs: Vec<_> = plan
            .iter()
            .map(|i| (i.kind.as_str(), i.name.as_str(), i.direction.as_str()))
            .collect();
        assert_eq!(
            pairs,
            [("skill", "deploy", "toRemote"), ("skill", "review", "toLocal")]
        );
    }

    #[test]
    fn a_peer_without_a_skills_list_gets_no_skills_and_no_layout() {
        let mut local = skill_map(&[("deploy", skill("a", 1, "me", 5))], &[]);
        local
            .globals
            .insert("skill-layout/web.json".into(), skill("f", 1, "me", 5));
        let older = DigestMap::default();
        assert!(skill_plan(&local, &older).is_empty());
        assert!(compute_plan(&local, &older).is_empty());
        assert!(skipped_skills(&local, &older).is_empty());
    }

    #[test]
    fn a_layout_syncs_between_computers_that_both_list_skills() {
        let mut local = skill_map(&[], &[]);
        local
            .globals
            .insert("skill-layout/web.json".into(), skill("f", 1, "me", 5));
        let plan = skill_plan(&local, &skill_map(&[], &[]));
        assert_eq!(plan.len(), 1);
        assert_eq!(plan[0].name, "skill-layout/web.json");
    }

    #[test]
    fn only_folds_are_folds_units() {
        assert!(is_folds_unit("global", "skill-layout/folds/web.json"));
        assert!(!is_folds_unit("global", "skill-layout/web.json"));
        // A kept skill's name is `<project>/<skill>`, which can read like the path.
        assert!(!is_folds_unit("kept-skill", "skill-layout/folds/web.json"));
    }

    #[test]
    fn folds_alone_cost_no_backup() {
        let units = [("global", "skill-layout/folds/web.json"), ("global", "skill-layout/folds/api.json")];
        assert_eq!(backup_before(units.into_iter()), Ok(String::new()));
    }

    #[test]
    fn folds_sync_wherever_a_layout_does_and_nowhere_else() {
        let name = "skill-layout/folds/web.json";
        assert!(safe_global_rel(name).is_ok());
        let mut local = skill_map(&[], &[]);
        local.globals.insert(name.into(), skill("f", 1, "me", 5));
        let plan = skill_plan(&local, &skill_map(&[], &[]));
        assert_eq!(plan.len(), 1);
        assert_eq!(plan[0].name, name);
        assert!(skill_plan(&local, &DigestMap::default()).is_empty());
    }

    #[test]
    fn a_legacy_plan_never_carries_skills() {
        let local = skill_map(&[("deploy", skill("a", 1, "me", 5))], &[]);
        assert!(compute_plan(&local, &skill_map(&[], &[])).is_empty());
    }

    #[test]
    fn a_name_held_on_either_side_stays_out_of_the_plan_and_is_reported() {
        let local = skill_map(&[("lint", skill("a", 1, "me", 5))], &[]);
        let remote = skill_map(&[], &["lint"]);
        assert!(skill_plan(&local, &remote).is_empty());
        assert!(skill_plan(&remote, &local).is_empty());
        assert_eq!(skipped_skills(&local, &remote), ["lint"]);
        assert_eq!(skipped_skills(&remote, &local), ["lint"]);
    }

    #[test]
    fn a_deleted_skill_crosses_once_there_is_a_base() {
        let gone = ItemDigest {
            rev: 2,
            device: "me".into(),
            deleted: true,
            ..Default::default()
        };
        let local = skill_map(&[("deploy", gone)], &[]);
        let remote = skill_map(&[("deploy", skill("a", 1, "you", 5))], &[]);
        let bases = BTreeMap::from([(item_key("skill", "deploy"), base("a"))]);

        let plan = compute_plan_v2(&local, &remote, &bases);
        assert_eq!(plan.len(), 1);
        assert_eq!(plan[0].direction, "toRemote");
        assert!(plan[0].deleted);

        let revived = skill_plan(&local, &remote);
        assert_eq!(revived[0].direction, "toLocal");
        assert!(!revived[0].deleted);
    }

    #[test]
    fn a_deletion_doesnt_cross_a_name_the_other_side_holds() {
        let gone = ItemDigest {
            rev: 2,
            device: "me".into(),
            deleted: true,
            ..Default::default()
        };
        let local = skill_map(&[("lint", gone)], &["lint"]);
        let remote = skill_map(&[("lint", skill("a", 1, "you", 5))], &[]);
        let bases = BTreeMap::from([(item_key("skill", "lint"), base("a"))]);
        assert!(compute_plan_v2(&local, &remote, &bases).is_empty());
        assert_eq!(skipped_skills(&local, &remote), ["lint"]);
    }

    #[test]
    fn two_skills_made_apart_under_one_name_are_flagged() {
        let local = skill_map(&[("deploy", skill("a", 1, "me", 5))], &[]);
        let remote = skill_map(&[("deploy", skill("b", 1, "you", 9))], &[]);
        let plan = skill_plan(&local, &remote);
        assert_eq!(plan[0].direction, "toLocal");
        assert!(plan[0].conflict);
    }

    #[test]
    fn an_edit_on_one_side_is_a_plain_fast_forward() {
        let local = skill_map(&[("deploy", skill("a", 1, "me", 5))], &[]);
        let remote = skill_map(&[("deploy", skill("b", 2, "you", 1))], &[]);
        let bases = BTreeMap::from([(item_key("skill", "deploy"), base("a"))]);
        let plan = compute_plan_v2(&local, &remote, &bases);
        assert_eq!(plan[0].direction, "toLocal");
        assert!(!plan[0].conflict);
    }

    #[test]
    fn equal_skills_record_a_base() {
        let local = skill_map(&[("deploy", skill("a", 1, "me", 5))], &[]);
        let remote = skill_map(&[("deploy", skill("a", 1, "you", 9))], &[]);
        assert!(skill_plan(&local, &remote).is_empty());
        let bases = converged_bases(&local, &remote);
        assert_eq!(bases.len(), 1);
        assert_eq!(bases[0].0, "skill/deploy");
    }

    #[test]
    fn a_map_from_an_older_peer_has_no_skills_list() {
        let dm: DigestMap =
            serde_json::from_str(r#"{"projects":{},"globals":{},"templates":{}}"#).unwrap();
        assert!(dm.skills.is_none());
    }

    #[test]
    fn the_legacy_view_drops_skills() {
        let dm = skill_map(&[("deploy", skill("a", 1, "me", 5))], &["lint"]);
        let legacy = legacy_view(dm);
        assert!(legacy.skills.is_none());
        assert!(legacy.held_skills.is_empty());
    }

    #[test]
    fn only_global_files_and_skills_can_be_deleted() {
        assert!(delete_item("project", "web").is_err());
        assert!(delete_item("template", "web").is_err());
    }

    #[test]
    fn a_sidecar_key_names_its_skill() {
        assert_eq!(skill_of("skill/deploy"), Some("deploy"));
        assert_eq!(skill_of("skills/deploy"), None);
        assert_eq!(skill_of("global/skill/deploy"), None);
    }
}
