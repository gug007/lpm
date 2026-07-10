//! `lpm remove <name> [--force]` — delete a project via the running app. The
//! name is required (never inferred — deleting off a cwd guess is a footgun).
//! Removing a duplicate is free; removing an original requires `--force`.

use crate::config::{self, Ctx};
use crate::control;
use crate::error::{resolve_error, RunError};
use crate::statussock::quote_arg;
use serde_json::json;

/// Whether removal may proceed client-side. A duplicate (non-empty parent_name)
/// always may; an original (empty parent_name) needs `--force`. Pure for tests.
fn force_ok(parent_name: &str, force: bool) -> bool {
    !parent_name.is_empty() || force
}

pub fn run(ctx: &Ctx, name: &str, force: bool, as_json: bool) -> Result<(), RunError> {
    control::require_app(ctx)?;
    let file_name = config::resolve_project_name(ctx, name).map_err(resolve_error)?;
    let project = config::resolve_project(ctx, &file_name).map_err(RunError::Internal)?;

    if !force_ok(&project.parent_name, force) {
        return Err(RunError::NotFound(
            "removing an original project requires --force (its source folder is kept; \
duplicates' folders are deleted)"
                .into(),
        ));
    }

    control::send_command(ctx, &format!("remove_project {}", quote_arg(&file_name)))?;

    if as_json {
        crate::util::print_json(&json!({ "ok": true, "removed": file_name }));
    } else {
        println!("removed {file_name}");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn force_guard_decision() {
        assert!(force_ok("some-parent", false)); // duplicate: no force needed
        assert!(!force_ok("", false)); // original without force: blocked
        assert!(force_ok("", true)); // original with force: allowed
    }
}
