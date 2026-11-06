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
use crate::lpm_commands_folds::{self as folds, SkillFolds};
use crate::lpm_commands_ops as ops;
use crate::lpm_commands_shared as shared;
use crate::lpm_commands_usage as usage;
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};

pub(crate) const CHANGED_EVENT: &str = "lpm-commands-changed";

pub(crate) enum Request {
    List,
    Save { command: CommandInput, previous: Option<CommandRef> },
    Delete { target: CommandRef },
    CreateFolder { scope: Scope, name: String },
    RenameFolder { scope: Scope, name: String, new_name: String },
    DeleteFolder { scope: Scope, name: String },
    /// `root` shows it with the skills in no folder; a `folder` wins over it, and
    /// neither puts it back in the Other skills group.
    MoveOther { scope: Scope, name: String, folder: Option<String>, root: bool },
    Convert { scope: Scope, name: String, to_lpm: bool },
    Import { scope: Scope },
    /// `cli` is the agent the run goes to, None to get the prompt whatever it is.
    Expand { name: String, args: String, cli: Option<String> },
    /// A composer sent `/name` and it isn't an lpm skill, which `Expand` counts.
    Used { name: String },
    Folds,
    /// No `folder` means the Other skills group.
    Fold { scope: Scope, folder: Option<String>, open: bool },
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
    Folds(SkillFolds),
    Noted,
}

impl Reply {
    fn lists(self) -> Result<LpmCommands, String> {
        match self {
            Reply::Lists(lists) => Ok(lists),
            _ => Err("unexpected reply".into()),
        }
    }

    fn folds(self) -> Result<SkillFolds, String> {
        match self {
            Reply::Folds(folds) => Ok(folds),
            _ => Err("unexpected reply".into()),
        }
    }

    pub(crate) fn to_value(&self) -> Result<Value, String> {
        match self {
            Reply::Lists(l) => serde_json::to_value(l),
            Reply::Imported(i) => serde_json::to_value(i),
            Reply::Expanded(e) => serde_json::to_value(e),
            Reply::Folds(f) => serde_json::to_value(f),
            Reply::Noted => Ok(Value::Null),
        }
        .map_err(|e| e.to_string())
    }
}

fn field<T: DeserializeOwned>(args: &Value, key: &str) -> Result<T, String> {
    serde_json::from_value(args.get(key).cloned().unwrap_or(Value::Null)).map_err(|_| format!("bad {key}"))
}

impl Request {
    /// The request named by `kind` (`list`, `save`, `delete`, `createFolder`,
    /// `renameFolder`, `deleteFolder`, `moveOther`, `convert`, `import`, `expand`,
    /// `used`, `folds` or `fold`), its fields read from `args` under their camelCase
    /// names.
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
            "moveOther" => Request::MoveOther {
                scope: field(args, "scope")?,
                name: text("name")?,
                folder: field(args, "folder")?,
                root: field::<Option<bool>>(args, "root")?.unwrap_or(false),
            },
            "convert" => Request::Convert {
                scope: field(args, "scope")?,
                name: text("name")?,
                to_lpm: field(args, "toLpm")?,
            },
            "import" => Request::Import { scope: field(args, "scope")? },
            "expand" => Request::Expand { name: text("name")?, args: text("args")?, cli: field(args, "cli")? },
            "used" => Request::Used { name: text("name")? },
            "folds" => Request::Folds,
            "fold" => Request::Fold { scope: field(args, "scope")?, folder: field(args, "folder")?, open: field(args, "open")? },
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
            | Request::MoveOther { scope, .. }
            | Request::Convert { scope, .. }
            | Request::Import { scope } => vec![*scope],
            Request::List
            | Request::Expand { .. }
            | Request::Used { .. }
            | Request::Folds
            | Request::Fold { .. } => Vec::new(),
        }
    }
}

pub(crate) fn dispatch(app: &AppHandle, project: &str, request: Request) -> Result<Reply, String> {
    let place = project_place(project)?;
    let stores = stores_at(place.as_ref());
    let touches = request.touches();
    let mut imported = None;
    match request {
        Request::List => {
            shared::refresh(project);
            return listed(project, &stores).map(Reply::Lists);
        }
        Request::Folds => return Ok(Reply::Folds(folds::of(&stores))),
        Request::Fold { scope, folder, open } => {
            folds::set(stores.get(scope)?.layout_path(), folder.as_deref(), open)?;
            return Ok(Reply::Folds(folds::of(&stores)));
        }
        Request::Expand { name, args, cli } => {
            let (expanded, ran) = crate::lpm_commands_expand::expand_at(
                project,
                place.as_ref(),
                &stores,
                &name,
                &args,
                cli.as_deref(),
            )?;
            announce(app, project, &[ran]);
            return Ok(Reply::Expanded(expanded));
        }
        Request::Used { name } => {
            if !is_slash_name(&name) {
                return Err(format!("/{name} isn't a command name."));
            }
            usage::record_agent(project, &name);
            announce(app, project, &[Scope::Project]);
            return Ok(Reply::Noted);
        }
        Request::Save { command, previous } => {
            let renamed = previous.as_ref().map(|p| ((p.scope, p.name.clone()), (command.scope, command.name.clone())));
            let own = previous.as_ref().filter(|p| p.scope == Scope::Project).map(|p| p.name.as_str());
            let holder = shared::holder(project, own.unwrap_or(&command.name));
            let (there, stores) = holder.as_ref().map_or((project, &stores), |(p, s)| (p.as_str(), s));
            ops::save(stores, command, previous)?;
            if let Some(((from_scope, from), (to_scope, to))) = renamed {
                usage::rename(project, (from_scope, &from), (to_scope, &to));
                if from_scope == Scope::Project && (from_scope, &from) != (to_scope, &to) {
                    crate::skillsync_kept::note_removed(there, &from);
                }
            }
        }
        Request::Delete { target } => {
            let holder = shared::holder(project, &target.name);
            let (there, stores) = holder.as_ref().map_or((project, &stores), |(p, s)| (p.as_str(), s));
            ops::delete(stores, &target)?;
            usage::forget(project, target.scope, &target.name);
            if target.scope == Scope::Project {
                crate::skillsync_kept::note_removed(there, &target.name);
            }
        }
        Request::CreateFolder { scope, name } => ops::create_folder(&stores, scope, &name)?,
        Request::RenameFolder { scope, name, new_name } => ops::rename_folder(&stores, scope, &name, &new_name)?,
        Request::DeleteFolder { scope, name } => ops::delete_folder(&stores, scope, &name)?,
        Request::MoveOther { scope, name, folder: None, root: true } => {
            ops::move_other_to_root(&stores, scope, &name)?
        }
        Request::MoveOther { scope, name, folder, .. } => {
            ops::move_other(&stores, scope, &name, folder.as_deref())?
        }
        Request::Convert { scope, name, to_lpm } => {
            let holder = shared::holder(project, &name);
            ops::convert(holder.as_ref().map_or(&stores, |(_, s)| s), scope, &name, to_lpm)?
        }
        Request::Import { scope } => imported = Some(import(&stores, place.as_ref(), scope)?),
    }
    if touches.contains(&Scope::Project) {
        shared::refresh_all(project);
    }
    announce(app, project, &touches);
    // Nothing watches a project's skills, so a kept-out one's change is told here.
    if touches.contains(&Scope::Project) {
        if let Some(engine) = app.try_state::<crate::autosync::Engine>() {
            engine.notify_local_change();
        }
    }
    let list = listed(project, &stores)?;
    Ok(match imported {
        Some(imported) => Reply::Imported(ImportResult { imported, list }),
        None => Reply::Lists(list),
    })
}

/// What the `/` menu takes as a name, so a phone's word can't grow the run log.
fn is_slash_name(name: &str) -> bool {
    (1..=128).contains(&name.len())
        && name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, ':' | '_' | '-'))
}

/// Both lists, each skill with how often it ran here.
fn listed(project: &str, stores: &Stores) -> Result<LpmCommands, String> {
    let mut lists = list_stores(stores)?;
    usage::annotate(project, &mut lists);
    shared::show_original_git(project, &mut lists);
    Ok(lists)
}

/// "" when the global list changed, which every project shows; else each project
/// sharing the list.
pub(crate) fn announce(app: &AppHandle, project: &str, touches: &[Scope]) {
    if touches.contains(&Scope::Global) {
        let _ = app.emit(CHANGED_EVENT, "");
        return;
    }
    for named in shared::family(project) {
        let _ = app.emit(CHANGED_EVENT, named);
    }
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
pub fn move_other_skill(
    app: AppHandle,
    project: String,
    scope: Scope,
    name: String,
    folder: Option<String>,
    root: Option<bool>,
) -> Result<LpmCommands, String> {
    let root = root.unwrap_or(false);
    dispatch(&app, &project, Request::MoveOther { scope, name, folder, root })?.lists()
}

#[tauri::command(async)]
pub fn convert_skill(
    app: AppHandle,
    project: String,
    scope: Scope,
    name: String,
    to_lpm: bool,
) -> Result<LpmCommands, String> {
    dispatch(&app, &project, Request::Convert { scope, name, to_lpm })?.lists()
}

#[tauri::command(async)]
pub fn import_lpm_commands(app: AppHandle, project: String, scope: Scope) -> Result<ImportResult, String> {
    match dispatch(&app, &project, Request::Import { scope })? {
        Reply::Imported(result) => Ok(result),
        _ => Err("unexpected reply".into()),
    }
}

#[tauri::command(async)]
pub fn expand_lpm_command(
    app: AppHandle,
    project: String,
    name: String,
    args: String,
    cli: Option<String>,
) -> Result<Expanded, String> {
    match dispatch(&app, &project, Request::Expand { name, args, cli })? {
        Reply::Expanded(expanded) => Ok(expanded),
        _ => Err("unexpected reply".into()),
    }
}

#[tauri::command(async)]
pub fn record_slash_command(app: AppHandle, project: String, name: String) -> Result<(), String> {
    dispatch(&app, &project, Request::Used { name }).map(|_| ())
}

#[tauri::command(async)]
pub fn load_skill_folds(app: AppHandle, project: String) -> Result<SkillFolds, String> {
    dispatch(&app, &project, Request::Folds)?.folds()
}

#[tauri::command(async)]
pub fn set_skill_fold(
    app: AppHandle,
    project: String,
    scope: Scope,
    folder: Option<String>,
    open: bool,
) -> Result<SkillFolds, String> {
    dispatch(&app, &project, Request::Fold { scope, folder, open })?.folds()
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
        "move_other_skill" => "moveOther",
        "convert_skill" => "convert",
        "import_lpm_commands" => "import",
        "expand_lpm_command" => "expand",
        "record_slash_command" => "used",
        "load_skill_folds" => "folds",
        "set_skill_fold" => "fold",
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
