//! Exit-coded error type shared by every subcommand, plus the helper that turns
//! a user-supplied (or inferred) project name into a resolved file-name stem.

use crate::config::{self, Ctx, ResolveError};

/// Exit-coded error for the CLI. `NotFound`/usage -> 2, everything else -> 1.
pub enum RunError {
    NotFound(String),
    Internal(String),
}

impl RunError {
    pub fn code(&self) -> i32 {
        match self {
            RunError::NotFound(_) => 2,
            RunError::Internal(_) => 1,
        }
    }
    pub fn message(&self) -> &str {
        match self {
            RunError::NotFound(m) | RunError::Internal(m) => m,
        }
    }
}

/// Render a `ResolveError` as the user-facing `RunError::NotFound` message
/// (exit 2), matching the wording the `project` command has always used.
pub fn resolve_error(err: ResolveError) -> RunError {
    match err {
        ResolveError::NotFound { query, available } => {
            let list = if available.is_empty() {
                "no projects found in ~/.lpm/projects".to_string()
            } else {
                format!("available projects: {}", available.join(", "))
            };
            RunError::NotFound(format!("no project matches {query:?}\n{list}"))
        }
        ResolveError::Ambiguous { query, candidates } => RunError::NotFound(format!(
            "{query:?} is ambiguous — matches: {}",
            candidates.join(", ")
        )),
    }
}

/// Resolve an optional project name to a file-name stem: the given name via
/// prefix matching, or — when absent — the current-project inference in
/// `config::infer_project_name`. A failed inference is a usage error (exit 2)
/// with a hint to pass a name explicitly.
pub fn resolve_or_infer(ctx: &Ctx, name: Option<&str>) -> Result<String, RunError> {
    match name {
        Some(query) => config::resolve_project_name(ctx, query).map_err(resolve_error),
        None => config::infer_project_name(ctx)
            .map_err(|m| RunError::NotFound(format!("{m}\npass a project name or run `lpm list`"))),
    }
}
