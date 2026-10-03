//! `lpm remove <name> [--force]` — delete a project via the running app. The
//! name is required (never inferred — deleting off a cwd guess is a footgun).
//! Removing a local duplicate is free; removing an original or any SSH project
//! requires `--force`, as the app keeps its folder.

use crate::config::{self, Ctx};
use crate::control;
use crate::error::{resolve_error, RunError};
use crate::statussock::quote_arg;
use serde_json::json;

/// Whether removal may proceed client-side. A local duplicate (non-empty
/// parent) always may; anything else needs `--force`. Pure for tests.
fn force_ok(parent_name: &str, force: bool) -> bool {
    !parent_name.is_empty() || force
}

fn check_removal(ctx: &Ctx, file_name: &str, force: bool) -> Result<(), RunError> {
    let parent_name = config::removal_parent(ctx, file_name).unwrap_or_default();
    if !force_ok(&parent_name, force) {
        return Err(RunError::NotFound(
            "removing an original or SSH project requires --force (its folder is kept; \
local duplicates' folders are deleted)"
                .into(),
        ));
    }
    Ok(())
}

pub fn run(ctx: &Ctx, name: &str, force: bool, as_json: bool) -> Result<(), RunError> {
    control::require_app(ctx)?;
    let file_name = config::resolve_project_name(ctx, name).map_err(resolve_error)?;
    check_removal(ctx, &file_name, force)?;

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

    #[test]
    fn a_project_that_fails_to_load_can_still_be_removed_like_in_the_app() {
        let dir = tempfile::tempdir().unwrap();
        let ctx = Ctx {
            lpm_dir: dir.path().to_path_buf(),
            socket_override: None,
        };
        std::fs::create_dir_all(ctx.projects_dir()).unwrap();
        std::fs::write(
            ctx.project_path("broken"),
            "parent_name: web\nssh:\n  host: h\n  user: u\n  port: \"22\"\n",
        )
        .unwrap();

        let file_name = config::resolve_project_name(&ctx, "broken").unwrap();
        assert_eq!(file_name, "broken");
        // The app can't read the file, so it treats it as an original: --force.
        assert!(check_removal(&ctx, &file_name, false)
            .unwrap_err()
            .message()
            .contains("--force"));
        assert!(check_removal(&ctx, &file_name, true).is_ok());

        std::fs::write(ctx.project_path("copy"), "parent_name: web\nroot: /tmp/c\n").unwrap();
        assert!(check_removal(&ctx, "copy", false).is_ok());
    }

    #[test]
    fn an_ssh_duplicate_is_removed_like_an_original_as_in_the_app() {
        let dir = tempfile::tempdir().unwrap();
        let ctx = Ctx {
            lpm_dir: dir.path().to_path_buf(),
            socket_override: None,
        };
        std::fs::create_dir_all(ctx.projects_dir()).unwrap();
        std::fs::write(
            ctx.project_path("api-copy"),
            "parent_name: api\nssh:\n  host: h\n  user: u\n  dir: ~/code/api\nservices:\n  web: run\n",
        )
        .unwrap();
        assert!(config::resolve_project(&ctx, "api-copy").is_ok());

        // The app's load_root_and_parent fails for any SSH project, so it
        // keeps the remote folder and only drops the YAML: --force required.
        assert!(check_removal(&ctx, "api-copy", false)
            .unwrap_err()
            .message()
            .contains("--force"));
        assert!(check_removal(&ctx, "api-copy", true).is_ok());
    }
}
