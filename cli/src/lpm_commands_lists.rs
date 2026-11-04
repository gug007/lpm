//! What the app holds for `lpm skills`: the lists as its dispatcher returns
//! them, how a name finds a skill in them, and the one request every verb
//! makes.

use crate::config::Ctx;
use crate::control;
use crate::error::RunError;
use crate::statussock::hex_encode;
use clap::ValueEnum;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(ValueEnum, Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Scope {
    Project,
    Global,
}

impl Scope {
    pub(crate) fn word(self) -> &'static str {
        match self {
            Scope::Project => "project",
            Scope::Global => "global",
        }
    }
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Saved {
    pub(crate) name: String,
    pub(crate) folder: Option<String>,
    pub(crate) description: String,
    pub(crate) body: String,
    pub(crate) scope: Scope,
    pub(crate) argument_hint: String,
    /// What the app reports; older apps leave it out.
    #[serde(default, skip_serializing)]
    pub(crate) kept_out_of_git: bool,
    /// What a save asks for; left out, the skill stays as it is.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) keep_out_of_git: Option<bool>,
}

impl Saved {
    fn is(&self, name: &str) -> bool {
        self.name.eq_ignore_ascii_case(name)
    }
}

#[derive(Deserialize)]
pub(crate) struct ScopeList {
    pub(crate) commands: Vec<Saved>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Lists {
    pub(crate) global: ScopeList,
    pub(crate) project: Option<ScopeList>,
    pub(crate) project_error: Option<String>,
}

impl Lists {
    pub(crate) fn of(&self, scope: Scope) -> Result<&ScopeList, RunError> {
        match (scope, &self.project, &self.project_error) {
            (Scope::Global, ..) => Ok(&self.global),
            (Scope::Project, Some(list), _) => Ok(list),
            (Scope::Project, None, Some(e)) => Err(RunError::Internal(e.clone())),
            (Scope::Project, None, None) => Err(not_in_project()),
        }
    }

    fn all(&self) -> impl Iterator<Item = &Saved> {
        let own = self.project.iter().flat_map(|p| p.commands.iter());
        own.chain(self.global.commands.iter())
    }

    /// What `/name` runs: the project's own before a global one.
    pub(crate) fn effective(&self, name: &str) -> Option<&Saved> {
        self.all().find(|c| c.is(name))
    }
}

fn not_in_project() -> RunError {
    RunError::NotFound(
        "no project given and none could be inferred\npass -p <project>, or --global for the global list"
            .into(),
    )
}

pub(crate) fn request(
    ctx: &Ctx,
    kind: &str,
    project: &str,
    mut fields: Value,
) -> Result<Value, RunError> {
    control::require_app(ctx)?;
    fields["project"] = project.into();
    let payload = hex_encode(&fields.to_string());
    let line = format!("lpm_commands {kind} --payload-hex={payload}");
    control::parse_json(&control::send_within(ctx, &line, control::SSH_REPLY)?)
}

pub(crate) fn parse_lists(reply: &Value) -> Result<Lists, RunError> {
    serde_json::from_value(reply.clone())
        .map_err(|e| RunError::Internal(format!("could not read the app's reply: {e}")))
}

pub(crate) fn fetch(ctx: &Ctx, project: &str) -> Result<Lists, RunError> {
    parse_lists(&request(ctx, "list", project, Value::Null)?)
}

/// The one skill `name` means in a list. Files put in by hand can give two
/// folders the same name, and a change must not guess between them.
pub(crate) fn find_in<'a>(
    lists: &'a Lists,
    scope: Scope,
    name: &str,
) -> Result<&'a Saved, RunError> {
    let found: Vec<&Saved> = lists
        .of(scope)?
        .commands
        .iter()
        .filter(|c| c.is(name))
        .collect();
    match found.as_slice() {
        [one] => Ok(one),
        [] => Err(RunError::NotFound(not_found(lists, scope, name))),
        many => {
            let folders: Vec<&str> = many
                .iter()
                .map(|c| c.folder.as_deref().unwrap_or("No folder"))
                .collect();
            Err(RunError::NotFound(format!(
                "/{name} is in {} places ({}); rename or remove one in the app",
                many.len(),
                folders.join(", ")
            )))
        }
    }
}

fn not_found(lists: &Lists, scope: Scope, name: &str) -> String {
    let in_global = scope == Scope::Project && lists.global.commands.iter().any(|c| c.is(name));
    let hint = if in_global {
        "it's in the global list: pass --global"
    } else {
        "see `lpm skills list`"
    };
    format!("no /{name} in the {} list\n{hint}", scope.word())
}

/// One line for the list: the name as it's typed, then where it's kept and what
/// it does. A global skill the project's own hides says so.
pub(crate) fn rows(lists: &Lists) -> Vec<[String; 4]> {
    lists
        .all()
        .map(|c| {
            let typed = match c.argument_hint.as_str() {
                "" => format!("/{}", c.name),
                hint => format!("/{} {hint}", c.name),
            };
            let hidden = c.scope == Scope::Global
                && lists
                    .effective(&c.name)
                    .is_some_and(|e| e.scope == Scope::Project);
            let about = match (hidden, c.description.as_str()) {
                (true, "") => format!("(this project's /{} runs instead)", c.name),
                (true, d) => format!("{d} (this project's /{} runs instead)", c.name),
                (false, d) => d.to_string(),
            };
            [
                typed,
                c.scope.word().into(),
                c.folder.clone().unwrap_or_default(),
                about,
            ]
        })
        .collect()
}

pub(crate) fn render_table(rows: &[[String; 4]]) -> String {
    let head = ["SKILL", "LIST", "FOLDER", "DESCRIPTION"].map(String::from);
    let width = |i: usize| {
        rows.iter()
            .chain([&head])
            .map(|r| r[i].chars().count())
            .max()
            .unwrap_or(0)
    };
    let (w0, w1, w2) = (width(0), width(1), width(2));
    [&head]
        .into_iter()
        .chain(rows)
        .map(|r| {
            format!("{:<w0$}  {:<w1$}  {:<w2$}  {}", r[0], r[1], r[2], r[3])
                .trim_end()
                .to_string()
        })
        .collect::<Vec<_>>()
        .join("\n")
}
