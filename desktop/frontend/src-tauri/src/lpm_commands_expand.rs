// Turning `/name args` into the prompt the agent gets. Done here rather than in
// each client so the desktop composer and both phones expand a skill the same
// way, against the machine that holds the project.
//
// `{{branch}}`, `{{project}}` and `{{dir}}` (the skill's own folder, so a prompt
// can point at files kept beside it) fill themselves in. Any other `{{name}}`
// takes a word of the arguments, in order, the last one taking the rest;
// `$ARGUMENTS` (Claude Code's own form) takes all of them.
//
// An agent that starts skills itself gets the call rather than the prompt, so it
// runs as a skill: `native_call` says when it can.
use crate::lpm_commands::{
    effective, list_stores, project_place, stores_at, LpmCommand, LpmCommands, ProjectPlace, Scope, ScopeList,
    Stores,
};
use serde::Serialize;

pub(crate) const AUTO_VARS: [&str; 3] = ["branch", "project", "dir"];

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Expanded {
    pub text: String,
    /// Variables still unfilled: the text keeps their `{{name}}` so the user can
    /// fill them in before sending.
    pub missing: Vec<String>,
}

/// The command `/name` runs: the project's own before a global one.
pub(crate) fn find<'a>(list: &'a LpmCommands, name: &str) -> Option<&'a LpmCommand> {
    effective(list).find(|c| c.name.eq_ignore_ascii_case(name))
}

/// Each `{{name}}` in the prompt, once, in the order they first appear.
pub(crate) fn variables(body: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    replace_vars(body, |var| {
        if !out.iter().any(|v| v == var) {
            out.push(var.to_string());
        }
        None
    });
    out
}

/// The variables a run has to be given: every one lpm doesn't fill itself.
fn asked_vars(body: &str) -> Vec<String> {
    variables(body)
        .into_iter()
        .filter(|v| !AUTO_VARS.contains(&v.as_str()))
        .collect()
}

/// The variables a run has to be given, as the `<a> <b>` hint shown after
/// `/name `.
pub(crate) fn argument_hint(body: &str) -> String {
    let asks: Vec<String> = asked_vars(body).into_iter().map(|v| format!("<{v}>")).collect();
    if asks.is_empty() && body.contains("$ARGUMENTS") {
        return "<arguments>".into();
    }
    asks.join(" ")
}

pub(crate) fn expand_body(body: &str, args: &str, auto: &mut dyn FnMut(&str) -> Option<String>) -> Expanded {
    let args = args.trim();
    let asks = asked_vars(body);
    let values = positional(args, asks.len());
    let mut missing: Vec<String> = Vec::new();
    let mut text = replace_vars(body, |var| {
        let value = if AUTO_VARS.contains(&var) {
            auto(var)
        } else {
            asks.iter().position(|a| a == var).and_then(|i| values.get(i).cloned())
        };
        if value.is_none() && !missing.iter().any(|m| m == var) {
            missing.push(var.to_string());
        }
        value
    });
    let takes_all = text.contains("$ARGUMENTS");
    text = text.replace("$ARGUMENTS", args);
    if !args.is_empty() && asks.is_empty() && !takes_all {
        text = format!("{}\n\n{args}", text.trim_end());
    }
    Expanded { text, missing }
}

/// `n` values from the arguments: a word each, the last taking the rest.
fn positional(args: &str, n: usize) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = args.trim();
    while out.len() + 1 < n && !rest.is_empty() {
        let end = rest.find(char::is_whitespace).unwrap_or(rest.len());
        out.push(rest[..end].to_string());
        rest = rest[end..].trim_start();
    }
    if n > 0 && !rest.is_empty() {
        out.push(rest.to_string());
    }
    out
}

/// Rewrite every `{{name}}` with what `value` gives, leaving the token as it was
/// when it gives nothing.
fn replace_vars(body: &str, mut value: impl FnMut(&str) -> Option<String>) -> String {
    let mut out = String::with_capacity(body.len());
    let mut rest = body;
    while let Some(start) = rest.find("{{") {
        out.push_str(&rest[..start]);
        let after = &rest[start + 2..];
        let Some(end) = after.find("}}") else {
            out.push_str(&rest[start..]);
            return out;
        };
        let var = after[..end].trim();
        let token = &rest[start..start + 2 + end + 2];
        if is_var_name(var) {
            match value(var) {
                Some(v) => out.push_str(&v),
                None => out.push_str(token),
            }
        } else {
            out.push_str(token);
        }
        rest = &after[end + 2..];
    }
    out.push_str(rest);
    out
}

fn is_var_name(var: &str) -> bool {
    !var.is_empty() && var.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

/// An SSH project's agent works on its host, where a global skill's files aren't.
fn out_of_agents_way(place: Option<&ProjectPlace>, command: &LpmCommand) -> bool {
    command.scope == Scope::Global && place.is_some_and(|p| p.ssh.is_some())
}

/// What starts the skill in `cli` itself, when that does what lpm would. Not for
/// a prompt with `{{branch}}`, `{{project}}` or `{{dir}}`, which only lpm fills
/// in, or a name in both lists, where the agent's choice can differ from lpm's.
fn native_call(
    list: &LpmCommands,
    place: Option<&ProjectPlace>,
    command: &LpmCommand,
    cli: &str,
    args: &str,
) -> Option<String> {
    let (sigil, reached) = match cli {
        "claude" => ('/', command.reach.claude),
        "codex" => ('$', command.reach.codex),
        _ => return None,
    };
    let needs_lpm = variables(&command.body).iter().any(|v| AUTO_VARS.contains(&v.as_str()));
    let holds_it = |scope: &ScopeList| scope.commands.iter().any(|c| c.name == command.name);
    let in_both = holds_it(&list.global) && list.project.as_ref().is_some_and(holds_it);
    if !reached || needs_lpm || in_both || out_of_agents_way(place, command) {
        return None;
    }
    Some(format!("{sigil}{} {}", command.name, args.trim()).trim_end().to_string())
}

/// `/name args` in `project`, whose place and lists `dispatch` already resolved.
pub(crate) fn expand_at(
    project: &str,
    place: Option<&ProjectPlace>,
    stores: &Stores,
    name: &str,
    args: &str,
    cli: Option<&str>,
) -> Result<Expanded, String> {
    let list = list_stores(stores)?;
    let command = find(&list, name.trim_start_matches('/'))
        .ok_or_else(|| format!("/{name} isn't one of your skills."))?;
    if let Some(text) = cli.and_then(|cli| native_call(&list, place, command, cli, args)) {
        return Ok(Expanded { text, missing: Vec::new() });
    }
    Ok(fill(project, place, stores, command, args))
}

/// The skill's folder as the agent's computer names it.
fn command_dir(place: Option<&ProjectPlace>, stores: &Stores, command: &LpmCommand) -> Option<String> {
    if out_of_agents_way(place, command) {
        return None;
    }
    let list = stores.get(command.scope).ok()?;
    Some(list.location(&command.name))
}

fn fill(
    project: &str,
    place: Option<&ProjectPlace>,
    stores: &Stores,
    command: &LpmCommand,
    args: &str,
) -> Expanded {
    let mut auto = |var: &str| match var {
        "project" => place.map(|_| crate::config::project_display_name(project)),
        "branch" => place
            .and_then(|p| crate::git::git_out(&p.root, &["symbolic-ref", "--short", "-q", "HEAD"]).ok())
            .filter(|b| !b.is_empty()),
        "dir" => command_dir(place, stores, command),
        _ => None,
    };
    expand_body(&command.body, args, &mut auto)
}

/// The name and arguments of a message that is `/name args` as a whole, the way
/// the composer reads one. Whether the name is a command is the list's to say.
fn parse_run(text: &str) -> Option<(&str, &str)> {
    let rest = text.trim_start().strip_prefix('/')?;
    let end = rest.find(char::is_whitespace).unwrap_or(rest.len());
    (end > 0).then(|| (&rest[..end], rest[end..].trim()))
}

/// Why a run with no one to ask can't start: the composer leaves these for the
/// user to fill in by hand.
fn missing_error(command: &LpmCommand, missing: &[String]) -> String {
    let names: Vec<String> = missing.iter().map(|m| format!("{{{{{m}}}}}")).collect();
    let usage = match command.argument_hint.as_str() {
        "" => String::new(),
        hint => format!(" Run it as /{} {hint}.", command.name),
    };
    format!("/{} is missing {}.{usage}", command.name, names.join(", "))
}

/// What a prompt from outside the composer sends: the saved prompt when it is
/// `/name args` for one of the user's skills, otherwise the prompt itself,
/// so the agent's own `/compact` still reaches the agent.
pub(crate) fn expand_prompt(project: &str, prompt: &str) -> Result<String, String> {
    let Some((name, args)) = parse_run(prompt) else {
        return Ok(prompt.to_string());
    };
    let place = project_place(project)?;
    let stores = stores_at(place.as_ref());
    let list = list_stores(&stores)?;
    let Some(command) = find(&list, name) else {
        return Ok(prompt.to_string());
    };
    let expanded = fill(project, place.as_ref(), &stores, command, args);
    if expanded.missing.is_empty() {
        Ok(expanded.text)
    } else {
        Err(missing_error(command, &expanded.missing))
    }
}

#[cfg(test)]
#[path = "lpm_commands_expand_tests.rs"]
mod tests;
