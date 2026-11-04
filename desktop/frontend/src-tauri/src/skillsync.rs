// Global lpm skills on config sync. A skill is one unit: its whole folder crosses as
// one item, so a prompt and the scripts beside it never land half new. Only skills
// marked as lpm's take part, and a name something else holds stays out of the plan on
// both sides. A skill lands by the same rules as one saved here: in the skills root
// with a link for Claude, or where this computer already keeps it. A project's skills
// are committed with its code, so they travel with git instead.
use crate::fsperm;
use crate::lpm_commands::{
    check_name, copy_tree, current, global_store, parse_doc, valid_name, CommandFs, LocalFs,
};
use crate::peersync::{
    base64_decode, base64_encode, mtime_millis, sha256_hex, ItemDigest, WireItem,
};
use crate::syncsurface::is_os_junk;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Component, Path, PathBuf};

pub(crate) const KIND: &str = "skill";

/// A folder past this stays on its computer. Base64 grows it by a third, which still
/// fits one sync message.
const MAX_SKILL_BYTES: u64 = 8 << 20;
const SKILL_FILE: &str = "SKILL.md";
const EXEC_BITS: u32 = 0o111;

pub(crate) struct LocalSkills {
    pub skills: BTreeMap<String, ItemDigest>,
    /// Names sync leaves alone here: someone else's skill, and any of lpm's that
    /// can't cross, being a link, too large, or named by looser rules.
    pub held: Vec<String>,
}

struct SkillFile {
    path: String,
    bytes: Vec<u8>,
    exec: bool,
}

struct Folder {
    files: Vec<SkillFile>,
    mtime: i64,
}

#[derive(Serialize, Deserialize)]
struct WireFile {
    path: String,
    b64: String,
    #[serde(default)]
    exec: bool,
}

#[derive(Serialize, Deserialize)]
struct WireSkill {
    files: Vec<WireFile>,
}

fn is_link(path: &Path) -> bool {
    std::fs::symlink_metadata(path).is_ok_and(|m| m.file_type().is_symlink())
}

fn is_exec(meta: &std::fs::Metadata) -> bool {
    fsperm::mode(meta) & EXEC_BITS != 0
}

fn walk(dir: &Path, prefix: &str, room: &mut u64, folder: &mut Folder) -> Option<()> {
    for entry in std::fs::read_dir(dir).ok()?.flatten() {
        let name = entry.file_name().to_str()?.to_string();
        if is_os_junk(&name) {
            continue;
        }
        let path = entry.path();
        let meta = std::fs::symlink_metadata(&path).ok()?;
        let rel = if prefix.is_empty() { name } else { format!("{prefix}/{name}") };
        if meta.is_dir() {
            walk(&path, &rel, room, folder)?;
        } else if meta.is_file() {
            *room = room.checked_sub(meta.len())?;
            folder.mtime = folder.mtime.max(mtime_millis(&path));
            folder.files.push(SkillFile {
                path: rel,
                bytes: std::fs::read(&path).ok()?,
                exec: is_exec(&meta),
            });
        }
    }
    Some(())
}

/// The skill's folder as it would cross, None when it can't: it is a link, too
/// large, unreadable or has no skill in it.
fn read_folder(dir: &Path) -> Option<Folder> {
    if is_link(dir) {
        return None;
    }
    let mut folder = Folder { files: Vec::new(), mtime: 0 };
    let mut room = MAX_SKILL_BYTES;
    walk(dir, "", &mut room, &mut folder)?;
    folder.files.sort_by(|a, b| a.path.cmp(&b.path));
    folder.files.iter().any(|f| f.path == SKILL_FILE).then_some(folder)
}

/// Path and content only: a file's mode doesn't exist on Windows, so two computers
/// comparing it would never agree.
fn digest(files: &[SkillFile]) -> String {
    let lines: String =
        files.iter().map(|f| format!("{}\0{}\n", f.path, sha256_hex(&f.bytes))).collect();
    sha256_hex(lines.as_bytes())
}

fn made_by_lpm(files: &[SkillFile]) -> bool {
    files
        .iter()
        .find(|f| f.path == SKILL_FILE)
        .is_some_and(|f| parse_doc(&String::from_utf8_lossy(&f.bytes)).created_with_lpm)
}

fn safe_rel(path: &str) -> bool {
    !path.is_empty()
        && !path.contains('\\')
        && Path::new(path).components().all(|c| matches!(c, Component::Normal(_)))
}

fn decode(json: &[u8]) -> Result<Vec<SkillFile>, String> {
    let wire: WireSkill = serde_json::from_slice(json).map_err(|e| e.to_string())?;
    let mut files = wire
        .files
        .into_iter()
        .map(|f| {
            if !safe_rel(&f.path) {
                return Err(format!("unsafe skill path: {}", f.path));
            }
            let bytes = base64_decode(&f.b64)?;
            Ok(SkillFile { path: f.path, bytes, exec: f.exec })
        })
        .collect::<Result<Vec<_>, String>>()?;
    files.sort_by(|a, b| a.path.cmp(&b.path));
    if !made_by_lpm(&files) {
        return Err("not an lpm skill".into());
    }
    Ok(files)
}

fn list_of(fs: &LocalFs) -> Option<LocalSkills> {
    if fs.is_unreadable() {
        return None;
    }
    let snap = current(fs).ok()?;
    let mut skills = BTreeMap::new();
    let mut held = snap.others.clone();
    for file in &snap.files {
        let folder = Some(&file.name)
            .filter(|name| valid_name(name))
            .and_then(|name| read_folder(Path::new(&fs.location(name))));
        match folder {
            Some(folder) => {
                let hash = digest(&folder.files);
                let item = ItemDigest { hash, mtime: folder.mtime, ..Default::default() };
                skills.insert(file.name.clone(), item);
            }
            None => held.push(file.name.clone()),
        }
    }
    held.sort();
    held.dedup();
    Some(LocalSkills { skills, held })
}

fn item_from(fs: &LocalFs, name: &str) -> Result<WireItem, String> {
    check_name(name)?;
    let folder = read_folder(Path::new(&fs.location(name)))
        .filter(|f| made_by_lpm(&f.files))
        .ok_or_else(|| format!("/{name} can't be synced"))?;
    let files = folder
        .files
        .iter()
        .map(|f| WireFile { path: f.path.clone(), b64: base64_encode(&f.bytes), exec: f.exec })
        .collect();
    Ok(WireItem {
        kind: KIND.into(),
        name: name.into(),
        enc: "text".into(),
        content: serde_json::to_string(&WireSkill { files }).map_err(|e| e.to_string())?,
        mtime: folder.mtime,
        ..Default::default()
    })
}

fn ensure_not_held(fs: &LocalFs, name: &str) -> Result<(), String> {
    if fs.snapshot()?.others.iter().any(|other| other == name) {
        return Err(format!("/{name} is another skill on this computer"));
    }
    Ok(())
}

fn stage(staged: &Path, target: &Path, files: &[SkillFile]) -> Result<(), String> {
    for file in files {
        let path = staged.join(&file.path);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::write(&path, &file.bytes).map_err(|e| e.to_string())?;
        // A Windows sender has no such bit, so it can't take one away.
        let was_exec =
            std::fs::metadata(target.join(&file.path)).is_ok_and(|m| is_exec(&m));
        if file.exec || was_exec {
            fsperm::set_mode(&path, 0o755).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn swap_in(staged: &Path, target: &Path, retired: &Path) -> Result<(), String> {
    let had = target.exists();
    if had {
        std::fs::rename(target, retired).map_err(|e| e.to_string())?;
    }
    if let Err(e) = std::fs::rename(staged, target) {
        if had {
            let _ = std::fs::rename(retired, target);
        }
        return Err(e.to_string());
    }
    if had {
        let _ = std::fs::remove_dir_all(retired);
    }
    Ok(())
}

/// Replaces the folder in one move, so an agent reading it, or a sync of another
/// computer, never sees half of it. The names start with a dot, which no list reads.
fn apply_to(fs: &LocalFs, name: &str, json: &[u8]) -> Result<String, String> {
    check_name(name)?;
    let files = decode(json)?;
    ensure_not_held(fs, name)?;
    let target = PathBuf::from(fs.location(name));
    if is_link(&target) {
        return Err(format!("/{name} is a link on this computer"));
    }
    let root = target.parent().ok_or("no skills folder")?;
    let staged = root.join(format!(".sync-{name}"));
    let retired = root.join(format!(".sync-old-{name}"));
    for leftover in [&staged, &retired] {
        let _ = std::fs::remove_dir_all(leftover);
    }
    let landed = stage(&staged, &target, &files)
        .and_then(|()| swap_in(&staged, &target, &retired));
    if landed.is_err() {
        let _ = std::fs::remove_dir_all(&staged);
    }
    landed?;
    fs.link_claude(name)?;
    Ok(digest(&files))
}

fn delete_from(fs: &LocalFs, name: &str) -> Result<(), String> {
    check_name(name)?;
    ensure_not_held(fs, name)?;
    if fs.snapshot()?.files.iter().any(|f| f.name == name) {
        fs.remove_skill(name)?;
    }
    Ok(())
}

fn back_up_from(fs: &LocalFs, dst: &Path) -> Result<(), String> {
    for file in fs.snapshot()?.files {
        let from = PathBuf::from(fs.location(&file.name));
        if from.is_dir() {
            std::fs::create_dir_all(dst).map_err(|e| e.to_string())?;
            copy_tree(&from, &dst.join(&file.name)).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// This computer's global lpm skills, None when the list can't be read, which must
/// not look like every skill having been deleted.
pub(crate) fn local_list() -> Option<LocalSkills> {
    list_of(&global_store())
}

pub(crate) fn read_item(name: &str) -> Result<WireItem, String> {
    item_from(&global_store(), name)
}

pub(crate) fn wire_digest(json: &[u8]) -> Result<String, String> {
    decode(json).map(|files| digest(&files))
}

pub(crate) fn apply(name: &str, json: &[u8]) -> Result<String, String> {
    apply_to(&global_store(), name, json)
}

pub(crate) fn delete(name: &str) -> Result<(), String> {
    delete_from(&global_store(), name)
}

pub(crate) fn back_up(dst: &Path) -> Result<(), String> {
    back_up_from(&global_store(), dst)
}

#[cfg(test)]
#[path = "skillsync_tests.rs"]
mod tests;
