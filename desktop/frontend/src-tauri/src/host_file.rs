//! A whole file from an SSH project's host, for what the window draws from its
//! bytes: an image or a PDF. Text comes through read_project_file.
use crate::notes_cmds::NotesAttachmentInput;
use crate::sshexec::remote_project_for_path;

/// `rel` is the project's own file, or an absolute path on its host.
#[tauri::command]
pub async fn read_host_file(
    root: String,
    rel: String,
    max_bytes: u64,
) -> Result<NotesAttachmentInput, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let ssh = remote_project_for_path(&root)
            .ok_or_else(|| "This project isn't on an SSH host".to_string())?;
        let (name, data) = crate::file_download::read_from_host(&ssh, &root, &rel, max_bytes)?;
        Ok(NotesAttachmentInput::of(name, &data))
    })
    .await
    .map_err(|e| e.to_string())?
}
