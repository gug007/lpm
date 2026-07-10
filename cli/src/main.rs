//! lpm — read-only command-line companion for the lpm desktop app.
//!
//! Reads project config from `~/.lpm` and live state from tmux + the app's
//! status socket. It never writes to `~/.lpm` or the repo configs.

mod config;
mod error;
mod list;
mod logs;
mod project;
mod service;
mod status;
mod statussock;
mod style;
mod terminals;
mod tmux;
mod util;

use clap::{Parser, Subcommand};
use std::process::ExitCode;

/// Version reported by `--version`. In a CI release build `scripts/build-cli.sh`
/// injects `LPM_CLI_VERSION` (from the app's `LPM_VERSION`) so the CLI and the
/// desktop app report the same version; locally it falls back to the crate
/// version. Mirrors the app's `option_env!("LPM_VERSION")` pattern.
const VERSION: &str = match option_env!("LPM_CLI_VERSION") {
    Some(v) => v,
    None => env!("CARGO_PKG_VERSION"),
};

#[derive(Parser)]
#[command(
    name = "lpm",
    version = VERSION,
    about = "Inspect lpm projects from the command line (read-only)",
    long_about = "lpm is a read-only companion to the lpm desktop app. It reads project \
configuration from ~/.lpm and live state from tmux and the app's status socket.\n\n\
Commands: `list` (all projects + running state), `project` (one project in full), \
`logs` (a running service pane's recent output), `status` (live agent status). \
Inside an lpm terminal or a project directory the project name may be omitted — \
it is inferred from LPM_PROJECT_NAME or the current directory.\n\n\
Subcommands are agent-friendly: pass --json for stable machine-readable output. \
Errors go to stderr; exit codes are 0 (ok), 2 (usage / project not found), 1 (internal)."
)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// List every project with its running state, service counts, and agents.
    List {
        /// Emit a single machine-readable JSON object (no ANSI).
        #[arg(long)]
        json: bool,
    },
    /// Show everything about one project: services, terminals, actions, live status.
    Project {
        /// Project stem, `name:` field, or unambiguous prefix. Omit to infer it.
        name: Option<String>,
        /// Emit a single machine-readable JSON object (no ANSI).
        #[arg(long)]
        json: bool,
    },
    /// Print a running service pane's recent output (its scrollback).
    Logs {
        /// Service name (exact or unambiguous prefix). Omit if only one exists.
        service: Option<String>,
        /// Project to read from; omit to infer from the environment / cwd.
        #[arg(long, short = 'p')]
        project: Option<String>,
        /// Number of trailing lines to capture (1..=10000).
        #[arg(long, short = 'n', default_value_t = 200)]
        lines: i64,
        /// Capture pane by index instead of by service (0-based).
        #[arg(long, conflicts_with = "service")]
        pane: Option<usize>,
        /// Emit a machine-readable JSON object instead of raw text.
        #[arg(long)]
        json: bool,
    },
    /// Show live agent status (Running / Waiting / Done / Error) across projects.
    Status {
        /// Limit to one project; omit to show every project with live status.
        name: Option<String>,
        /// Emit a single machine-readable JSON object (no ANSI).
        #[arg(long)]
        json: bool,
    },
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    let ctx = config::Ctx::from_home();

    let result = match cli.command {
        Commands::List { json } => list::run(&ctx, json),
        Commands::Project { name, json } => project::run(&ctx, name.as_deref(), json),
        Commands::Logs {
            service,
            project,
            lines,
            pane,
            json,
        } => logs::run(
            &ctx,
            service.as_deref(),
            project.as_deref(),
            lines,
            pane,
            json,
        ),
        Commands::Status { name, json } => status::run(&ctx, name.as_deref(), json),
    };

    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(err) => {
            eprintln!("lpm: {}", err.message());
            ExitCode::from(err.code() as u8)
        }
    }
}
