// Notes + vault Tauri commands — port of desktop/notes.go's App methods.
//
// NotesState caches the vault key (one Keychain prompt per session) and an open
// Store+BlobStore per project. open() mirrors Go's lock-release-during-slow-open
// + retry-on-key-change so a large legacy-DB migration can't block other notes
// calls and a mid-open key import can't publish a stale store.
use crate::notes_blobs::BlobStore;
use crate::notes_store::{Attachment, Chat, Message, SearchHit, Store};
use crate::{config, vault};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Read;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

const MAX_DROPPED_ATTACHMENT_BYTES: u64 = 100 * 1024 * 1024;

/// Attachment payload from the frontend. `data` is base64 (standard, padded) —
/// Wails' []byte handling emitted a string, so we keep an explicit string here.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotesAttachmentInput {
    pub name: String,
    pub mime_type: String,
    pub data: String,
}

struct NotesBundle {
    store: Store,
    blobs: BlobStore,
}

#[derive(Default)]
pub struct NotesState {
    inner: Mutex<NotesStateInner>,
}

#[derive(Default)]
struct NotesStateInner {
    key: Option<[u8; 32]>,
    stores: HashMap<String, Arc<NotesBundle>>,
}

impl NotesState {
    fn open(&self, project: &str) -> Result<Arc<NotesBundle>, String> {
        config::validate_name(project)?;
        // Retry covers the race where invalidate_key fires while we're opening:
        // we'd otherwise publish a store built with a stale key.
        for _ in 0..3 {
            let key_at_open = {
                let mut g = self.inner.lock().unwrap();
                if let Some(b) = g.stores.get(project) {
                    return Ok(b.clone());
                }
                if g.key.is_none() {
                    g.key = Some(vault::key().map_err(String::from)?);
                }
                g.key.unwrap()
            };

            // Opening runs migrations (seconds on a large legacy DB) — do it
            // outside the lock so an unrelated first-open can't block everyone.
            let dir = config::notes_dir(project);
            let store = Store::open(&dir, &key_at_open)?;
            let blobs = BlobStore::new(store.blobs_dir(), &key_at_open);
            let bundle = Arc::new(NotesBundle { store, blobs });

            let mut g = self.inner.lock().unwrap();
            if let Some(existing) = g.stores.get(project) {
                return Ok(existing.clone()); // another caller won the race
            }
            if g.key != Some(key_at_open) {
                continue; // key invalidated mid-open; rebuild with the fresh key
            }
            g.stores.insert(project.to_string(), bundle.clone());
            return Ok(bundle);
        }
        Err("notes: vault key invalidated repeatedly during open".into())
    }

    /// Next access re-fetches from the Keychain; drops cached stores. Called
    /// after a key import.
    fn invalidate_key(&self) {
        let mut g = self.inner.lock().unwrap();
        g.key = None;
        g.stores.clear();
    }
}

// --- best-effort blob GC (failures tolerated; next sweep cleans up) ----------

fn gc_orphan_blobs(b: &NotesBundle, hashes: &[String]) {
    for h in hashes {
        if let Err(e) = b.blobs.delete(h) {
            eprintln!("warning: notes: delete orphan blob {h}: {e}");
        }
    }
}

fn sweep_unreferenced_blobs(b: &NotesBundle) {
    match b.store.all_attachment_hashes() {
        Ok(refs) => {
            if let Err(e) = b.blobs.gc(&refs) {
                eprintln!("warning: notes: blob sweep: {e}");
            }
        }
        Err(e) => eprintln!("warning: notes: list attachment refs: {e}"),
    }
}

/// Decode + store each attachment's bytes, preserving order. On error, blobs
/// written so far stay as orphans until the next delete GCs them (matches Go).
fn stash_attachments(b: &NotesBundle, inputs: &[NotesAttachmentInput]) -> Result<Vec<Attachment>, String> {
    let mut out = Vec::with_capacity(inputs.len());
    for input in inputs {
        let raw = B64
            .decode(input.data.as_bytes())
            .map_err(|e| format!("notes: bad base64 for {:?}: {e}", input.name))?;
        let (hash, size) = b
            .blobs
            .put(&raw)
            .map_err(|e| format!("notes: store attachment {:?}: {e}", input.name))?;
        out.push(Attachment {
            hash,
            name: input.name.clone(),
            size,
            mime_type: input.mime_type.clone(),
        });
    }
    Ok(out)
}

// --- commands ----------------------------------------------------------------

#[tauri::command(async)]
pub fn notes_create_chat(
    state: State<'_, NotesState>,
    project: String,
    title: String,
) -> Result<Chat, String> {
    state.open(&project)?.store.create_chat(&title)
}

#[tauri::command(async)]
pub fn notes_list_chats(state: State<'_, NotesState>, project: String) -> Result<Vec<Chat>, String> {
    state.open(&project)?.store.list_chats()
}

#[tauri::command(async)]
pub fn notes_rename_chat(
    state: State<'_, NotesState>,
    project: String,
    chat_id: String,
    title: String,
) -> Result<(), String> {
    state.open(&project)?.store.rename_chat(&chat_id, &title)
}

#[tauri::command(async)]
pub fn notes_delete_chat(
    state: State<'_, NotesState>,
    project: String,
    chat_id: String,
) -> Result<(), String> {
    let b = state.open(&project)?;
    let orphans = b.store.delete_chat(&chat_id)?;
    gc_orphan_blobs(&b, &orphans);
    // Belt-and-suspenders sweep also clears pre-existing orphans (failed
    // AddMessage writes / prior chat-deletes whose blob removal errored).
    sweep_unreferenced_blobs(&b);
    Ok(())
}

#[tauri::command(async)]
pub fn notes_add_message(
    state: State<'_, NotesState>,
    project: String,
    chat_id: String,
    text: String,
    attachments: Vec<NotesAttachmentInput>,
) -> Result<Message, String> {
    let b = state.open(&project)?;
    // Reject up-front so a send to a deleted chat doesn't orphan ~100MB of
    // encrypted blobs before the insert fails.
    if !attachments.is_empty() && !b.store.chat_exists(&chat_id)? {
        return Err("sql: no rows in result set".into());
    }
    let att_meta = stash_attachments(&b, &attachments)?;
    b.store.add_message(&chat_id, &text, &att_meta)
}

#[tauri::command(async)]
pub fn notes_list_messages(
    state: State<'_, NotesState>,
    project: String,
    chat_id: String,
    limit: i64,
    before_id: String,
) -> Result<Vec<Message>, String> {
    state
        .open(&project)?
        .store
        .list_messages(&chat_id, limit, &before_id)
}

#[tauri::command(async)]
pub fn notes_edit_message(
    state: State<'_, NotesState>,
    project: String,
    id: String,
    text: String,
) -> Result<(), String> {
    state.open(&project)?.store.edit_message(&id, &text)
}

#[tauri::command(async)]
pub fn notes_delete_message(
    state: State<'_, NotesState>,
    project: String,
    id: String,
) -> Result<(), String> {
    let b = state.open(&project)?;
    let orphans = b.store.delete_message(&id)?;
    gc_orphan_blobs(&b, &orphans); // no full sweep here (matches Go asymmetry)
    Ok(())
}

#[tauri::command(async)]
pub fn notes_search(
    state: State<'_, NotesState>,
    project: String,
    query: String,
    limit: i64,
) -> Result<Vec<SearchHit>, String> {
    state.open(&project)?.store.search(&query, limit)
}

#[tauri::command(async)]
pub fn notes_read_attachment(
    state: State<'_, NotesState>,
    project: String,
    hash: String,
) -> Result<String, String> {
    let data = state.open(&project)?.blobs.read(&hash)?;
    Ok(B64.encode(data))
}

#[tauri::command] // native folder dialog → must run on the main thread
pub fn notes_save_attachment(
    app: AppHandle,
    state: State<'_, NotesState>,
    project: String,
    hash: String,
    name: String,
) -> Result<String, String> {
    // Folder picker (native save dialog is flaky on newer macOS). "" = cancel.
    let dir = match app
        .dialog()
        .file()
        .set_title("Save attachment to folder")
        .blocking_pick_folder()
    {
        Some(fp) => fp.into_path().map_err(|e| e.to_string())?,
        None => return Ok(String::new()),
    };
    let data = state.open(&project)?.blobs.read(&hash)?;
    // file_name() strips any path components in `name` (traversal guard).
    let base = Path::new(&name)
        .file_name()
        .map(|s| s.to_os_string())
        .unwrap_or_else(|| name.clone().into());
    let path = dir.join(base);
    std::fs::write(&path, &data).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command(async)]
pub fn notes_read_file_as_input(path: String) -> Result<NotesAttachmentInput, String> {
    let p = Path::new(&path);
    let meta = std::fs::metadata(p).map_err(|e| e.to_string())?;
    let name = p
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    if meta.is_dir() {
        return Err(format!("{name} is a directory"));
    }
    if meta.len() > MAX_DROPPED_ATTACHMENT_BYTES {
        return Err(format!("{name} exceeds 100MB limit"));
    }
    let data = read_file_capped(p, MAX_DROPPED_ATTACHMENT_BYTES)?;
    let mime_type = mime_for(p, &data);
    Ok(NotesAttachmentInput {
        name,
        mime_type,
        data: B64.encode(&data),
    })
}

#[tauri::command] // native folder dialog → must run on the main thread
pub fn vault_export_key(
    app: AppHandle,
    _state: State<'_, NotesState>,
    passphrase: String,
) -> Result<String, String> {
    let dir = match app
        .dialog()
        .file()
        .set_title("Choose folder for lpm vault key")
        .blocking_pick_folder()
    {
        Some(fp) => fp.into_path().map_err(|e| e.to_string())?,
        None => return Ok(String::new()),
    };
    let data = vault::export_key(&passphrase)?;
    let host = config::sanitize_host(&config::hostname_or_mac());
    let ts = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let path = dir.join(format!("lpm-vault-{host}-{ts}.json"));
    std::fs::write(&path, data.as_bytes()).map_err(|e| e.to_string())?;
    let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command] // native file dialog → must run on the main thread
pub fn vault_import_key(
    app: AppHandle,
    state: State<'_, NotesState>,
    passphrase: String,
) -> Result<(), String> {
    let path = match app
        .dialog()
        .file()
        .add_filter("JSON", &["json"])
        .set_title("Import lpm vault key")
        .blocking_pick_file()
    {
        Some(fp) => fp.into_path().map_err(|e| e.to_string())?,
        None => return Ok(()),
    };
    let data = std::fs::read(&path).map_err(|e| e.to_string())?;
    vault::import_key(&passphrase, &data)?;
    state.invalidate_key();
    Ok(())
}

// --- helpers -----------------------------------------------------------------

/// Reads at most `cap` bytes; errors if the file grew past cap between stat and
/// read (TOCTOU) rather than returning a silently truncated payload.
fn read_file_capped(path: &Path, cap: u64) -> Result<Vec<u8>, String> {
    let f = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut data = Vec::new();
    f.take(cap + 1).read_to_end(&mut data).map_err(|e| e.to_string())?;
    if data.len() as u64 > cap {
        let name = path
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default();
        return Err(format!("{name} exceeds {cap} byte limit"));
    }
    Ok(data)
}

/// MIME from extension; falls back to a small magic-byte sniff, else octet-stream.
fn mime_for(path: &Path, data: &[u8]) -> String {
    if let Some(m) = mime_guess::from_path(path).first() {
        return m.essence_str().to_string();
    }
    sniff_mime(data)
}

fn sniff_mime(data: &[u8]) -> String {
    let head = &data[..data.len().min(512)];
    let starts = |sig: &[u8]| head.starts_with(sig);
    if starts(b"\x89PNG\r\n\x1a\n") {
        "image/png"
    } else if starts(b"\xff\xd8\xff") {
        "image/jpeg"
    } else if starts(b"GIF87a") || starts(b"GIF89a") {
        "image/gif"
    } else if head.len() >= 12 && &head[0..4] == b"RIFF" && &head[8..12] == b"WEBP" {
        "image/webp"
    } else if starts(b"%PDF-") {
        "application/pdf"
    } else if std::str::from_utf8(head).is_ok() {
        "text/plain; charset=utf-8"
    } else {
        "application/octet-stream"
    }
    .to_string()
}

