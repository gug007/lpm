// lpm skills' requests and their one dispatcher, used by the Tauri commands, by
// lpm Link (remote_lpm_commands), by a Mac that drives this one's projects (the
// peer connection, so a headless host answers too) and by `lpm skills` (the
// socket verb). The names on those wires stay `lpm_commands`, so phones and
// computers on an older lpm keep working. Every change hands back the whole updated list and
// announces itself, so other windows, phones and paired Macs refresh.
use crate::lpm_commands::{
    list_stores, project_place, stores_at, CommandInput, CommandRef, LpmCommands, Scope, Stores,
};
use crate::lpm_commands_expand::Expanded;
use crate::lpm_commands_ops as ops;
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter};

pub(crate) const CHANGED_EVENT: &str = "lpm-commands-changed";

pub(crate) enum Request {
    List,
    Save { command: CommandInput, previous: Option<CommandRef> },
    Delete { target: CommandRef },
    CreateFolder { scope: Scope, name: String },
    RenameFolder { scope: Scope, name: String, new_name: String },
    DeleteFolder { scope: Scope, name: String },
    Import { scope: Scope },
    Expand { name: String, args: String },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub imported: usize,
    pub list: LpmCommands,
}

pub(crate) enum Reply {
    Lists(LpmCommands),
    Imported(ImportResult),
    Expanded(Expanded),
}

impl Reply {
    fn lists(self) -> Result<LpmCommands, String> {
        match self {
            Reply::Lists(lists) => Ok(lists),
            _ => Err("unexpected reply".into()),
        }
    }

    pub(crate) fn to_value(&self) -> Result<Value, String> {
        match self {
            Reply::Lists(l) => serde_json::to_value(l),
            Reply::Imported(i) => serde_json::to_value(i),
            Reply::Expanded(e) => serde_json::to_value(e),
        }
        .map_err(|e| e.to_string())
    }
}

fn field<T: DeserializeOwned>(args: &Value, key: &str) -> Result<T, String> {
    serde_json::from_value(args.get(key).cloned().unwrap_or(Value::Null)).map_err(|_| format!("bad {key}"))
}

impl Request {
    /// The request named by `kind` (`list`, `save`, `delete`, `createFolder`,
    /// `renameFolder`, `deleteFolder`, `import` or `expand`), its fields read
    /// from `args` under their camelCase names.
    pub(crate) fn parse(kind: &str, args: &Value) -> Result<Self, String> {
        let text = |k: &str| field::<Option<String>>(args, k).map(Option::unwrap_or_default);
        Ok(match kind {
            "list" => Request::List,
            "save" => Request::Save { command: field(args, "command")?, previous: field(args, "previous")? },
            "delete" => Request::Delete { target: field(args, "target")? },
            "createFolder" => Request::CreateFolder { scope: field(args, "scope")?, name: text("name")? },
            "renameFolder" => Request::RenameFolder {
                scope: field(args, "scope")?,
                name: text("name")?,
                new_name: text("newName")?,
            },
            "deleteFolder" => Request::DeleteFolder { scope: field(args, "scope")?, name: text("name")? },
            "import" => Request::Import { scope: field(args, "scope")? },
            "expand" => Request::Expand { name: text("name")?, args: text("args")? },
            _ => return Err(format!("unknown commands request {kind}")),
        })
    }

    /// The lists a change writes to; empty for a read.
    fn touches(&self) -> Vec<Scope> {
        match self {
            Request::Save { command, previous } => {
                let mut scopes = vec![command.scope];
                scopes.extend(previous.as_ref().map(|p| p.scope));
                scopes
            }
            Request::Delete { target } => vec![target.scope],
            Request::CreateFolder { scope, .. }
            | Request::RenameFolder { scope, .. }
            | Request::DeleteFolder { scope, .. }
            | Request::Import { scope } => vec![*scope],
            Request::List | Request::Expand { .. } => Vec::new(),
        }
    }
}

pub(crate) fn dispatch(app: &AppHandle, project: &str, request: Request) -> Result<Reply, String> {
    let place = project_place(project)?;
    let stores = stores_at(place.as_ref());
    let touches = request.touches();
    let mut imported = None;
    match request {
        Request::List => return list_stores(&stores).map(Reply::Lists),
        Request::Expand { name, args } => {
            return crate::lpm_commands_expand::expand_at(project, place.as_ref(), &stores, &name, &args)
                .map(Reply::Expanded)
        }
        Request::Save { command, previous } => ops::save(&stores, command, previous)?,
        Request::Delete { target } => ops::delete(&stores, &target)?,
        Request::CreateFolder { scope, name } => ops::create_folder(&stores, scope, &name)?,
        Request::RenameFolder { scope, name, new_name } => ops::rename_folder(&stores, scope, &name, &new_name)?,
        Request::DeleteFolder { scope, name } => ops::delete_folder(&stores, scope, &name)?,
        Request::Import { scope } => imported = Some(import(&stores, place.as_ref(), scope)?),
    }
    announce(app, project, &touches);
    let list = list_stores(&stores)?;
    Ok(match imported {
        Some(imported) => Reply::Imported(ImportResult { imported, list }),
        None => Reply::Lists(list),
    })
}

/// "" when the global list changed, which every project shows; else the project.
fn announce(app: &AppHandle, project: &str, touches: &[Scope]) {
    let named = if touches.contains(&Scope::Global) { "" } else { project };
    let _ = app.emit(CHANGED_EVENT, named);
}

fn import(stores: &Stores, place: Option<&crate::lpm_commands::ProjectPlace>, scope: Scope) -> Result<usize, String> {
    if scope == Scope::Project && place.is_some_and(|p| p.ssh.is_some()) {
        return Err("Import works for projects on this computer.".into());
    }
    let from = crate::lpm_commands_import::sources(scope, place.map(|p| p.root.as_str()));
    crate::lpm_commands_import::import(stores, scope, &from)
}

#[tauri::command(async)]
pub fn list_lpm_commands(app: AppHandle, project: String) -> Result<LpmCommands, String> {
    dispatch(&app, &project, Request::List)?.lists()
}

#[tauri::command(async)]
pub fn save_lpm_command(
    app: AppHandle,
    project: String,
    command: CommandInput,
    previous: Option<CommandRef>,
) -> Result<LpmCommands, String> {
    dispatch(&app, &project, Request::Save { command, previous })?.lists()
}

#[tauri::command(async)]
pub fn delete_lpm_command(app: AppHandle, project: String, target: CommandRef) -> Result<LpmCommands, String> {
    dispatch(&app, &project, Request::Delete { target })?.lists()
}

#[tauri::command(async)]
pub fn create_lpm_command_folder(
    app: AppHandle,
    project: String,
    scope: Scope,
    name: String,
) -> Result<LpmCommands, String> {
    dispatch(&app, &project, Request::CreateFolder { scope, name })?.lists()
}

#[tauri::command(async)]
pub fn rename_lpm_command_folder(
    app: AppHandle,
    project: String,
    scope: Scope,
    name: String,
    new_name: String,
) -> Result<LpmCommands, String> {
    dispatch(&app, &project, Request::RenameFolder { scope, name, new_name })?.lists()
}

#[tauri::command(async)]
pub fn delete_lpm_command_folder(
    app: AppHandle,
    project: String,
    scope: Scope,
    name: String,
) -> Result<LpmCommands, String> {
    dispatch(&app, &project, Request::DeleteFolder { scope, name })?.lists()
}

#[tauri::command(async)]
pub fn import_lpm_commands(app: AppHandle, project: String, scope: Scope) -> Result<ImportResult, String> {
    match dispatch(&app, &project, Request::Import { scope })? {
        Reply::Imported(result) => Ok(result),
        _ => Err("unexpected reply".into()),
    }
}

#[tauri::command(async)]
pub fn expand_lpm_command(app: AppHandle, project: String, name: String, args: String) -> Result<Expanded, String> {
    match dispatch(&app, &project, Request::Expand { name, args })? {
        Reply::Expanded(expanded) => Ok(expanded),
        _ => Err("unexpected reply".into()),
    }
}

// ---- calls from outside the app ------------------------------------------------------

/// The request a peer's Tauri command name asks for, if it is one of these.
pub(crate) fn peer_kind(cmd: &str) -> Option<&'static str> {
    Some(match cmd {
        "list_lpm_commands" => "list",
        "save_lpm_command" => "save",
        "delete_lpm_command" => "delete",
        "create_lpm_command_folder" => "createFolder",
        "rename_lpm_command_folder" => "renameFolder",
        "delete_lpm_command_folder" => "deleteFolder",
        "import_lpm_commands" => "import",
        "expand_lpm_command" => "expand",
        _ => return None,
    })
}

/// A paired Mac's or the CLI's call, answered from Rust: args arrive with the
/// frontend's camelCase keys.
pub(crate) fn answer(app: &AppHandle, kind: &str, args: &Value) -> Result<Value, String> {
    let project = field::<Option<String>>(args, "project")?.unwrap_or_default();
    dispatch(app, &project, Request::parse(kind, args)?)?.to_value()
}

/// `lpm_commands <kind> --payload-hex=JSON`: [`answer`] as a socket verb, its
/// reply as JSON or `ERROR: <msg>`.
pub(crate) fn cmd_lpm_commands(args: &[String], app: &AppHandle) -> String {
    let Some(kind) = args.first() else {
        return "ERROR: usage: lpm_commands <kind> --payload-hex=JSON".into();
    };
    match crate::socketsrv::decode_payload(args).and_then(|fields| answer(app, kind, &fields)) {
        Ok(value) => value.to_string(),
        Err(e) => format!("ERROR: {e}"),
    }
}
