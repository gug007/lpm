//! lpm — read-only command-line companion for the lpm desktop app.
//!
//! Reads project config from `~/.lpm` and live state from tmux + the app's
//! status socket. It never writes to `~/.lpm` or the repo configs.

mod config;
mod project;
mod statussock;
mod terminals;
mod tmux;

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
Subcommands are agent-friendly: pass --json for stable machine-readable output. \
Errors go to stderr; exit codes are 0 (ok), 2 (usage / project not found), 1 (internal)."
)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Show everything about one project: services, terminals, actions, live status.
    Project {
        /// Project file-name stem, its `name:` field, or an unambiguous prefix.
        name: String,
        /// Emit a single machine-readable JSON object (no ANSI).
        #[arg(long)]
        json: bool,
    },
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    let ctx = config::Ctx::from_home();

    let result = match cli.command {
        Commands::Project { name, json } => project::run(&ctx, &name, json),
    };

    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(err) => {
            eprintln!("lpm: {}", err.message());
            ExitCode::from(err.code() as u8)
        }
    }
}
