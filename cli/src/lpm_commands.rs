//! `lpm commands list|show|add|edit|remove` — the prompts saved as `/name`
//! commands, a project's own and the global ones. Every read and write goes
//! through the running app, which keeps the naming rules, tells open windows and
//! phones about a change, and reaches an SSH project's list on its host.

use crate::config::{self, Ctx};
use crate::config_cmd::read_input;
use crate::error::{resolve_or_infer, RunError};
use crate::lpm_commands_lists::{
    fetch, find_in, parse_lists, render_table, request, rows, Saved, Scope,
};
use crate::util::print_json;
use clap::{Args, Subcommand};
use serde_json::{json, Value};
use std::path::PathBuf;

#[derive(Subcommand)]
pub enum Command {
    #[command(
        about = "List saved commands, the project's and the global ones",
        alias = "ls"
    )]
    List(ListArgs),
    #[command(about = "Print a saved command's prompt")]
    Show(NameArgs),
    #[command(about = "Save a new command", alias = "create")]
    Add(AddArgs),
    #[command(about = "Change a saved command")]
    Edit(EditArgs),
    #[command(
        about = "Delete a saved command",
        visible_alias = "rm",
        alias = "delete"
    )]
    Remove(NameArgs),
}

#[derive(Args)]
pub struct Place {
    #[arg(
        long,
        short = 'p',
        help = "Project whose list to use; defaults to the current one"
    )]
    project: Option<String>,
    #[arg(long, help = "Use the global list, which every project shares")]
    global: bool,
}

impl Place {
    fn scope(&self) -> Scope {
        if self.global {
            Scope::Global
        } else {
            Scope::Project
        }
    }
}

#[derive(Args)]
pub struct ListArgs {
    #[command(flatten)]
    at: Place,
    #[arg(long, help = "Emit machine-readable JSON")]
    json: bool,
}

#[derive(Args)]
pub struct NameArgs {
    #[arg(help = "Command name, with or without the leading /")]
    name: String,
    #[command(flatten)]
    at: Place,
    #[arg(long, help = "Emit machine-readable JSON")]
    json: bool,
}

#[derive(Args)]
pub struct Prompt {
    #[arg(long, value_name = "TEXT", conflicts_with_all = ["file", "stdin"], help = "The prompt; {{name}} asks for a value, {{branch}}, {{project}} and {{dir}} (the command's folder) fill themselves in")]
    prompt: Option<String>,
    #[arg(
        long,
        value_name = "PATH",
        conflicts_with = "stdin",
        help = "Read the prompt from a file"
    )]
    file: Option<PathBuf>,
    #[arg(long, help = "Read the prompt from standard input")]
    stdin: bool,
}

#[derive(Args)]
pub struct AddArgs {
    #[arg(help = "Name typed after /: letters, digits, '-' and '_'")]
    name: String,
    #[command(flatten)]
    prompt: Prompt,
    #[arg(long, value_name = "TEXT", help = "One line shown in the / menu")]
    description: Option<String>,
    #[arg(
        long,
        value_name = "NAME",
        help = "Folder to keep it in; created if new"
    )]
    folder: Option<String>,
    #[command(flatten)]
    at: Place,
    #[arg(long, help = "Emit machine-readable JSON")]
    json: bool,
}

#[derive(Args)]
pub struct EditArgs {
    #[arg(help = "Command name, with or without the leading /")]
    name: String,
    #[command(flatten)]
    prompt: Prompt,
    #[arg(
        long,
        value_name = "TEXT",
        help = "One line shown in the / menu; empty clears it"
    )]
    description: Option<String>,
    #[arg(
        long,
        value_name = "NAME",
        help = "Move it to this folder; empty moves it out of its folder"
    )]
    folder: Option<String>,
    #[arg(long, value_name = "NAME", help = "Give it a new name")]
    rename: Option<String>,
    #[arg(
        long,
        value_enum,
        value_name = "LIST",
        help = "Move it to the other list"
    )]
    to: Option<Scope>,
    #[command(flatten)]
    at: Place,
    #[arg(long, help = "Emit machine-readable JSON")]
    json: bool,
}

fn bare(name: &str) -> &str {
    name.trim_start_matches('/')
}

/// The project to read beside the global list, "" for none: only a project
/// named with `-p` has to exist, the global list works anywhere.
fn project_to_read(ctx: &Ctx, at: &Place) -> Result<String, RunError> {
    if at.global {
        return Ok(String::new());
    }
    match &at.project {
        Some(_) => resolve_or_infer(ctx, at.project.as_deref()),
        None => Ok(config::infer_project_name(ctx).unwrap_or_default()),
    }
}

/// The project a change has to name: none when it only touches the global list.
fn project_to_change(ctx: &Ctx, at: &Place, needed: bool) -> Result<String, RunError> {
    if !needed {
        return Ok(String::new());
    }
    resolve_or_infer(ctx, at.project.as_deref()).map_err(|e| {
        RunError::NotFound(format!(
            "{}\nor pass --global for the global list",
            e.message()
        ))
    })
}

fn read_prompt(p: &Prompt) -> Result<Option<String>, RunError> {
    if p.file.is_none() && !p.stdin {
        return Ok(p.prompt.clone());
    }
    read_input(p.stdin, p.file.as_deref()).map(Some)
}

fn list(ctx: &Ctx, args: ListArgs) -> Result<(), RunError> {
    let project = project_to_read(ctx, &args.at)?;
    let reply = request(ctx, "list", &project, Value::Null)?;
    if args.json {
        print_json(&reply);
        return Ok(());
    }
    let lists = parse_lists(&reply)?;
    if let Some(e) = &lists.project_error {
        eprintln!("lpm: couldn't read {project}'s list: {e}");
    }
    let rows = rows(&lists);
    if rows.is_empty() {
        println!("no saved commands");
    } else {
        println!("{}", render_table(&rows));
    }
    Ok(())
}

fn show(ctx: &Ctx, args: NameArgs) -> Result<(), RunError> {
    let name = bare(&args.name);
    let project = project_to_read(ctx, &args.at)?;
    let lists = fetch(ctx, &project)?;
    let command = if args.at.global {
        find_in(&lists, Scope::Global, name)?
    } else {
        lists.effective(name).ok_or_else(|| {
            RunError::NotFound(format!("no /{name} here\nsee `lpm commands list`"))
        })?
    };
    if args.json {
        print_json(&json!(command));
    } else {
        println!("{}", command.body);
    }
    Ok(())
}

fn reference(c: &Saved) -> Value {
    json!({ "scope": c.scope, "folder": c.folder, "name": c.name })
}

fn report(verb: &str, at: &str, c: &Saved, project: &str, as_json: bool) {
    let folder = c.folder.as_deref().filter(|f| !f.trim().is_empty());
    if as_json {
        print_json(&json!({
            "ok": true,
            "name": c.name,
            "scope": c.scope,
            "folder": folder,
            "project": (c.scope == Scope::Project).then_some(project),
        }));
        return;
    }
    let list = match c.scope {
        Scope::Project => project,
        Scope::Global => "the global list",
    };
    match folder {
        Some(f) => println!("{verb} /{} {at} {list}, folder {f}", c.name),
        None => println!("{verb} /{} {at} {list}", c.name),
    }
}

fn add(ctx: &Ctx, args: AddArgs) -> Result<(), RunError> {
    let scope = args.at.scope();
    let project = project_to_change(ctx, &args.at, scope == Scope::Project)?;
    let Some(body) = read_prompt(&args.prompt)? else {
        return Err(RunError::NotFound(
            "pass --prompt, --file or --stdin".into(),
        ));
    };
    let command = Saved {
        name: bare(&args.name).to_string(),
        folder: args.folder,
        description: args.description.unwrap_or_default(),
        body,
        scope,
        argument_hint: String::new(),
    };
    request(ctx, "save", &project, json!({ "command": command }))?;
    report("saved", "in", &command, &project, args.json);
    Ok(())
}

fn changes_nothing(args: &EditArgs, has_prompt: bool) -> bool {
    !has_prompt
        && args.description.is_none()
        && args.folder.is_none()
        && args.rename.is_none()
        && args.to.is_none()
}

/// The command as it stands with the flags given laid over it.
fn edited(c: &Saved, args: &EditArgs, body: Option<String>) -> Saved {
    Saved {
        name: args
            .rename
            .as_deref()
            .map_or(c.name.as_str(), bare)
            .to_string(),
        folder: args.folder.clone().or_else(|| c.folder.clone()),
        description: args
            .description
            .clone()
            .unwrap_or_else(|| c.description.clone()),
        body: body.unwrap_or_else(|| c.body.clone()),
        scope: args.to.unwrap_or(c.scope),
        argument_hint: String::new(),
    }
}

fn edit(ctx: &Ctx, args: EditArgs) -> Result<(), RunError> {
    let from = args.at.scope();
    let needs_project = from == Scope::Project || args.to == Some(Scope::Project);
    let project = project_to_change(ctx, &args.at, needs_project)?;
    let body = read_prompt(&args.prompt)?;
    if changes_nothing(&args, body.is_some()) {
        return Err(RunError::NotFound(
            "nothing to change: pass --prompt, --file, --stdin, --description, --folder, --rename or --to"
                .into(),
        ));
    }
    let lists = fetch(ctx, &project)?;
    let current = find_in(&lists, from, bare(&args.name))?;
    let command = edited(current, &args, body);
    let fields = json!({ "command": command, "previous": reference(current) });
    request(ctx, "save", &project, fields)?;
    report("saved", "in", &command, &project, args.json);
    Ok(())
}

fn remove(ctx: &Ctx, args: NameArgs) -> Result<(), RunError> {
    let scope = args.at.scope();
    let project = project_to_change(ctx, &args.at, scope == Scope::Project)?;
    let lists = fetch(ctx, &project)?;
    let target = find_in(&lists, scope, bare(&args.name))?;
    let fields = json!({ "target": reference(target) });
    request(ctx, "delete", &project, fields)?;
    report("removed", "from", target, &project, args.json);
    Ok(())
}

pub fn run(ctx: &Ctx, command: Command) -> Result<(), RunError> {
    match command {
        Command::List(args) => list(ctx, args),
        Command::Show(args) => show(ctx, args),
        Command::Add(args) => add(ctx, args),
        Command::Edit(args) => edit(ctx, args),
        Command::Remove(args) => remove(ctx, args),
    }
}

#[cfg(test)]
#[path = "lpm_commands_tests.rs"]
mod tests;
