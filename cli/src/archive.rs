//! `lpm archive <name>` / `lpm unarchive <name>` — take a project out of the
//! app's lists or bring it back, via the running app. Archiving stops its
//! services and pauses its automations; its config, notes and folder stay.
//! The archived names live in settings.json as `archivedProjects`.

use crate::config::{self, Ctx};
use crate::control;
use crate::error::{resolve_error, RunError};
use crate::statussock::quote_arg;
use serde_json::{json, Value};
use std::collections::HashSet;

const KEY: &str = "archivedProjects";

fn archived_in(settings: &Value) -> HashSet<String> {
    settings
        .get(KEY)
        .and_then(Value::as_object)
        .map(|m| m.keys().cloned().collect())
        .unwrap_or_default()
}

/// The names archived on this machine.
pub fn archived(ctx: &Ctx) -> HashSet<String> {
    std::fs::read(ctx.settings_path())
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
        .map(|s| archived_in(&s))
        .unwrap_or_default()
}

pub fn run(ctx: &Ctx, name: &str, archive: bool, as_json: bool) -> Result<(), RunError> {
    control::require_app(ctx)?;
    let file_name = config::resolve_project_name(ctx, name).map_err(resolve_error)?;
    let verb = if archive {
        "archive_project"
    } else {
        "unarchive_project"
    };
    control::send_command(ctx, &format!("{verb} {}", quote_arg(&file_name)))?;

    let done = if archive { "archived" } else { "unarchived" };
    if as_json {
        crate::util::print_json(&json!({ "ok": true, done: file_name }));
    } else {
        println!("{done} {file_name}");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_archived_names_and_nothing_else() {
        let settings =
            json!({ "archivedProjects": { "api": 1, "web": 2 }, "pinnedProjects": ["docs"] });
        let names = archived_in(&settings);
        assert_eq!(names.len(), 2);
        assert!(names.contains("api") && names.contains("web"));
        assert!(archived_in(&json!({})).is_empty());
        assert!(archived_in(&json!({ "archivedProjects": ["api"] })).is_empty());
    }

    #[test]
    fn a_missing_settings_file_archives_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let ctx = Ctx {
            lpm_dir: dir.path().to_path_buf(),
            socket_override: None,
        };
        assert!(archived(&ctx).is_empty());
    }
}
