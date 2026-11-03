// The local filesystem under a commands root (~/.lpm/commands, or a project's
// .lpm/commands on this computer).
use crate::lpm_commands::{command_name_of, is_visible_folder, CommandFile, CommandFs, Snapshot, MAX_FILE_BYTES};
use std::path::{Path, PathBuf};

pub(crate) struct LocalFs {
    base: PathBuf,
}

impl LocalFs {
    pub fn new(base: PathBuf) -> Self {
        Self { base }
    }

    fn path(&self, rel: &str) -> PathBuf {
        rel.split('/').fold(self.base.clone(), |p, part| p.join(part))
    }
}

fn read_capped(path: &Path) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    let end = bytes.len().min(MAX_FILE_BYTES);
    Some(String::from_utf8_lossy(&bytes[..end]).into_owned())
}

fn md_files(dir: &Path, folder: Option<&str>, out: &mut Vec<CommandFile>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let Some(file_name) = entry.file_name().to_str().map(str::to_string) else { continue };
        let Some(name) = command_name_of(&file_name) else { continue };
        if !entry.file_type().is_ok_and(|t| t.is_file()) {
            continue;
        }
        if let Some(content) = read_capped(&entry.path()) {
            out.push(CommandFile {
                folder: folder.map(str::to_string),
                name: name.to_string(),
                content,
            });
        }
    }
}

impl CommandFs for LocalFs {
    fn snapshot(&self) -> Result<Snapshot, String> {
        let mut out = Snapshot::default();
        let Ok(entries) = std::fs::read_dir(&self.base) else {
            return Ok(out);
        };
        for entry in entries.flatten() {
            let Some(name) = entry.file_name().to_str().map(str::to_string) else { continue };
            if entry.file_type().is_ok_and(|t| t.is_dir()) && is_visible_folder(&name) {
                md_files(&entry.path(), Some(&name), &mut out.files);
                out.folders.push(name);
            }
        }
        md_files(&self.base, None, &mut out.files);
        Ok(out)
    }

    fn write(&self, rel: &str, content: &str) -> Result<(), String> {
        let path = self.path(rel);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        crate::fsatomic::write(&path, content.as_bytes(), crate::fsatomic::Mode::Preserve(0o644))
            .map_err(|e| e.to_string())
    }

    fn remove_file(&self, rel: &str) -> Result<(), String> {
        match std::fs::remove_file(self.path(rel)) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
            _ => Ok(()),
        }
    }

    fn create_dir(&self, rel: &str) -> Result<(), String> {
        std::fs::create_dir_all(self.path(rel)).map_err(|e| e.to_string())
    }

    fn rename(&self, from: &str, to: &str) -> Result<(), String> {
        let to = self.path(to);
        if let Some(parent) = to.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::rename(self.path(from), to).map_err(|e| e.to_string())
    }

    fn remove_dir(&self, rel: &str) -> Result<(), String> {
        std::fs::remove_dir(self.path(rel)).map_err(|e| e.to_string())
    }
}

