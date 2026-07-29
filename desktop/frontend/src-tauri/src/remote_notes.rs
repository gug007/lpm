// Phone-side Notes: the `notes*` verb family behind the mobile Notes screen.
//
// Thin shims over notes_cmds, so the phone shares the desktop's SQLCipher store,
// its blob dedup and its orphan sweeps rather than re-implementing any of it.
// The first call for a project opens the encrypted db (a Keychain round-trip,
// plus migrations on a legacy file) and every call afterwards runs SQL, so the
// whole family answers through the out-queue instead of the read loop.
//
// The desktop's two remaining notes commands stay desktop-only on purpose:
// notes_save_attachment opens a native folder picker and notes_read_file_as_input
// takes a Mac filesystem path — neither means anything on a phone, which sends
// bytes inline and saves through its own share sheet.
use crate::notes_cmds::{
    notes_add_message, notes_create_chat, notes_delete_chat, notes_delete_message,
    notes_edit_message, notes_list_chats, notes_list_messages, notes_read_attachment,
    notes_rename_chat, notes_search, NotesAttachmentInput, NotesState,
};
use serde::Serialize;
use serde_json::{json, Value};
use std::sync::mpsc::SyncSender;
use tauri::{AppHandle, Manager};

/// Attachments cross the phone link inline as base64 inside a single JSON text
/// frame, so they are capped far below the desktop's 100MB drop limit. The
/// binding constraint is the frame itself, not the disk: tungstenite refuses to
/// read a frame over 16MiB, and base64 inflates by 4/3, so 8MiB of bytes is
/// ~10.9MiB on the wire and still leaves room for the JSON envelope. The phone
/// must also raise URLSessionWebSocketTask's 1MiB default receive limit to match.
/// Anything larger stays a Mac-only attachment — the phone still lists it, it
/// just can't move the bytes.
const MAX_WS_ATTACHMENT_BYTES: usize = 8 * 1024 * 1024;
const TOO_LARGE_SEND: &str =
    "That file is too large to send from your phone. Add it from your Mac instead.";
const TOO_LARGE_READ: &str =
    "This attachment is too large to open on your phone. Open it on your Mac instead.";

/// Compare encoded lengths rather than decoding a payload we are about to
/// reject anyway. Base64 emits `ceil(n / 3)` four-character groups, so the bound
/// is derived in that direction — going back the other way (`len / 4 * 3`)
/// counts the padding as payload and rejects a file sitting exactly on the cap.
fn encoded_over_cap(encoded_len: usize) -> bool {
    encoded_len > (MAX_WS_ATTACHMENT_BYTES + 2) / 3 * 4
}

pub fn handle(app: &AppHandle, out: &SyncSender<String>, t: &str, v: &Value) {
    let verb = t.to_string();
    let payload = v.clone();
    let req_id = v.get("reqId").cloned().unwrap_or(Value::Null);
    let (app, out) = (app.clone(), out.clone());
    std::thread::spawn(move || {
        let project = string_at(&payload, "project");
        let mut reply = run(&app, &verb, &payload);
        reply["t"] = json!(verb);
        reply["project"] = json!(project);
        // Echo the addressing keys the phone matches on: several chats and
        // several attachments can be in flight at once on one connection.
        for key in ["chatId", "id", "hash", "query", "beforeId"] {
            if let Some(value) = payload.get(key) {
                if !value.is_null() && reply.get(key).is_none() {
                    reply[key] = value.clone();
                }
            }
        }
        if !req_id.is_null() {
            reply["reqId"] = req_id;
        }
        let _ = out.try_send(reply.to_string());
    });
}

fn run(app: &AppHandle, verb: &str, v: &Value) -> Value {
    let state = app.state::<NotesState>();
    let project = string_at(v, "project");
    let text = || string_at(v, "text");
    let chat_id = || string_at(v, "chatId");
    let id = || string_at(v, "id");

    match verb {
        "notesChats" => wrap("chats", notes_list_chats(state, project)),
        "notesCreateChat" => wrap(
            "chat",
            notes_create_chat(state, project, string_at(v, "title")),
        ),
        "notesRenameChat" => plain(notes_rename_chat(
            state,
            project,
            chat_id(),
            string_at(v, "title"),
        )),
        "notesDeleteChat" => plain(notes_delete_chat(state, project, chat_id())),
        "notesMessages" => wrap(
            "messages",
            notes_list_messages(
                state,
                project,
                chat_id(),
                int_at(v, "limit", 50),
                string_at(v, "beforeId"),
            ),
        ),
        "notesAddMessage" => add_message(state, project, chat_id(), text(), v),
        "notesEditMessage" => plain(notes_edit_message(state, project, id(), text())),
        "notesDeleteMessage" => plain(notes_delete_message(state, project, id())),
        "notesSearch" => wrap(
            "hits",
            notes_search(
                state,
                project,
                string_at(v, "query"),
                int_at(v, "limit", 50),
            ),
        ),
        "notesAttachment" => attachment(state, project, string_at(v, "hash")),
        _ => err("unknown notes request".into()),
    }
}

/// Reject an oversize payload before it reaches the blob store: a failed insert
/// after the write would leave the bytes on disk as an orphan until the next
/// chat delete sweeps them.
fn add_message(
    state: tauri::State<'_, NotesState>,
    project: String,
    chat_id: String,
    text: String,
    v: &Value,
) -> Value {
    let raw = v.get("attachments").cloned().unwrap_or_else(|| json!([]));
    let attachments: Vec<NotesAttachmentInput> = match serde_json::from_value(raw) {
        Ok(list) => list,
        Err(_) => return err("That attachment could not be read. Try sending it again.".into()),
    };
    if attachments.iter().any(|a| encoded_over_cap(a.data.len())) {
        return err(TOO_LARGE_SEND.into());
    }
    wrap(
        "message",
        notes_add_message(state, project, chat_id, text, attachments),
    )
}

fn attachment(state: tauri::State<'_, NotesState>, project: String, hash: String) -> Value {
    match notes_read_attachment(state, project, hash) {
        Ok(data) if encoded_over_cap(data.len()) => err(TOO_LARGE_READ.into()),
        Ok(data) => json!({ "ok": true, "data": data }),
        Err(e) => err(e),
    }
}

fn wrap<T: Serialize>(key: &str, result: Result<T, String>) -> Value {
    match result {
        Ok(value) => match serde_json::to_value(value) {
            Ok(value) => json!({ "ok": true, key: value }),
            Err(e) => err(e.to_string()),
        },
        Err(e) => err(e),
    }
}

fn plain(result: Result<(), String>) -> Value {
    match result {
        Ok(()) => json!({ "ok": true }),
        Err(e) => err(e),
    }
}

fn err(e: String) -> Value {
    json!({ "ok": false, "error": e })
}

fn string_at(v: &Value, key: &str) -> String {
    v.get(key)
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_default()
}

fn int_at(v: &Value, key: &str, fallback: i64) -> i64 {
    v.get(key).and_then(Value::as_i64).unwrap_or(fallback)
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::engine::general_purpose::STANDARD as B64;
    use base64::Engine;

    fn encoded_len_of(bytes: usize) -> usize {
        B64.encode(vec![0u8; bytes]).len()
    }

    #[test]
    fn a_photo_sized_attachment_is_accepted() {
        assert!(!encoded_over_cap(encoded_len_of(1024 * 1024)));
    }

    #[test]
    fn the_cap_holds_at_its_own_boundary() {
        assert!(!encoded_over_cap(encoded_len_of(MAX_WS_ATTACHMENT_BYTES)));
        assert!(encoded_over_cap(encoded_len_of(
            MAX_WS_ATTACHMENT_BYTES + 1024
        )));
    }

    /// The whole point of the cap: the encoded payload has to fit a frame the
    /// desktop will actually read (tungstenite refuses over 16MiB).
    #[test]
    fn an_accepted_attachment_still_fits_one_websocket_frame() {
        assert!(encoded_len_of(MAX_WS_ATTACHMENT_BYTES) < 16 * 1024 * 1024);
    }

    #[test]
    fn the_desktops_own_drop_limit_is_refused_on_this_link() {
        assert!(encoded_over_cap(encoded_len_of(100 * 1024 * 1024)));
    }
}
