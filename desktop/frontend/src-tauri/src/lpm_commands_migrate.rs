// Moving an old .lpm/commands list into skills, once per list, the first time it
// is read. The old files stay where they are, marked as moved, so a teammate on
// an older lpm keeps theirs and nothing is lost if the move goes wrong. A name
// another skill holds gets a number rather than being dropped.
use crate::lpm_commands::{clean_folder, parse_doc, skill_name, CommandFs, LegacyFile};
use crate::lpm_commands_ops::create_skill;
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

const MAX_STEM_LEN: usize = 60;

static RUNNING: Mutex<()> = Mutex::new(());

fn free_name(base: &str, taken: &HashSet<String>) -> String {
    if !taken.contains(base) {
        return base.to_string();
    }
    let stem = base[..base.len().min(MAX_STEM_LEN)].trim_end_matches('-');
    (2..)
        .map(|n| format!("{stem}-{n}"))
        .find(|name| !taken.contains(name))
        .unwrap_or_else(|| base.to_string())
}

fn commands_by_folder(files: &[LegacyFile]) -> HashMap<&str, Vec<String>> {
    let mut out: HashMap<&str, Vec<String>> = HashMap::new();
    for file in files {
        if let Some(folder) = &file.folder {
            out.entry(folder).or_default().push(file.name.clone());
        }
    }
    out
}

pub(crate) fn run(fs: &dyn CommandFs) -> Result<(), String> {
    let _running = RUNNING.lock().unwrap_or_else(|e| e.into_inner());
    let snap = fs.snapshot()?;
    if !snap.legacy {
        return Ok(());
    }
    let legacy = fs.legacy_list()?;
    let beside = commands_by_folder(&legacy.files);
    let mut taken: HashSet<String> = snap
        .files
        .iter()
        .map(|f| f.name.clone())
        .chain(snap.others.iter().map(|n| n.to_lowercase()))
        .collect();
    let mut folders = snap.folders.clone();
    for folder in legacy.folders.iter().filter(|f| clean_folder(f).is_ok()) {
        if !folders.iter().any(|f| f.eq_ignore_ascii_case(folder)) {
            folders.push(folder.clone());
        }
    }
    for file in &legacy.files {
        let mut doc = parse_doc(&file.content);
        let Some(base) = skill_name(&file.name).filter(|_| !doc.body.trim().is_empty()) else {
            continue;
        };
        if snap.files.iter().any(|f| f.name == base && f.doc.body == doc.body) {
            continue;
        }
        let name = free_name(&base, &taken);
        taken.insert(name.clone());
        doc.folder = file.folder.clone().filter(|f| clean_folder(f).is_ok());
        create_skill(fs, &name, doc.made_by_lpm())?;
        if let Some(folder) = &file.folder {
            fs.copy_legacy_files(folder, &beside[folder.as_str()], &name)?;
        }
    }
    fs.save_folders(&folders)?;
    fs.finish_legacy()
}
