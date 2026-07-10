//! lpm — command-line companion for the lpm desktop app.
//!
//! Reads project config from `~/.lpm` and live state from tmux + the app's
//! status socket, plus control verbs (start/stop/service/set-status) that it
//! delegates to the running app over the status socket. It never writes to
//! `~/.lpm` or the repo configs directly — all mutation flows through the app.

mod config;
mod control;
mod duplicate;
mod error;
mod list;
mod logs;
mod project;
mod remove;
mod run;
mod service;
mod service_cmd;
mod setstatus;
mod start;
mod status;
mod statussock;
mod stop;
mod style;
mod terminals;
mod tmux;
mod util;
mod wait;

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
    about = "Inspect and control lpm projects from the command line",
    long_about = "lpm is the command-line companion to the lpm desktop app. It reads project \
configuration from ~/.lpm and live state from tmux and the app's status socket, and can \
control projects — start, stop, restart services, set agent status — by asking the running \
app over that socket (so the app stays the single owner of run-state).\n\n\
Read commands: `list`, `project`, `logs`, `status`. Control commands (need the app running): \
`start`, `stop`, `service`, `set-status`, `clear-status`, `duplicate`, `remove`, `run`. \
`wait` polls client-side. Inside an lpm terminal or a project directory the project name \
may be omitted — it is inferred from LPM_PROJECT_NAME or the current directory.\n\n\
Subcommands are agent-friendly: pass --json for stable machine-readable output. Errors go \
to stderr; exit codes are 0 (ok), 2 (usage / not found / app not running), 1 (internal / \
timeout / app-side failure)."
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
    /// Start a project's services via the running app.
    Start {
        /// Project stem, `name:` field, or unambiguous prefix. Omit to infer it.
        name: Option<String>,
        /// Start only a named profile's subset of services.
        #[arg(long)]
        profile: Option<String>,
        /// Emit a single machine-readable JSON object.
        #[arg(long)]
        json: bool,
    },
    /// Stop a project's services via the running app.
    Stop {
        /// Project stem, `name:` field, or unambiguous prefix. Omit to infer it.
        name: Option<String>,
        /// Emit a single machine-readable JSON object.
        #[arg(long)]
        json: bool,
    },
    /// Start, stop, or restart one service via the running app.
    Service {
        /// Exact declared service name (the app owns matching — no prefixes).
        service: String,
        /// What to do with the service.
        #[arg(value_enum)]
        op: service_cmd::Op,
        /// Project to act on; omit to infer from the environment / cwd.
        #[arg(long, short = 'p')]
        project: Option<String>,
        /// Emit a single machine-readable JSON object.
        #[arg(long)]
        json: bool,
    },
    /// Wait (client-side poll) until a project / service / port is ready.
    Wait {
        /// Project stem, `name:` field, or unambiguous prefix. Omit to infer it.
        name: Option<String>,
        /// Wait for this declared service to be running.
        #[arg(long)]
        service: Option<String>,
        /// Wait for this TCP port to be listening (needs no project).
        #[arg(long, conflicts_with = "service")]
        port: Option<i64>,
        /// Give up after this many seconds (1..=3600).
        #[arg(long, default_value_t = 60)]
        timeout: i64,
        /// Emit a single machine-readable JSON object.
        #[arg(long)]
        json: bool,
    },
    /// Set an agent-status key on a project (via the running app).
    SetStatus {
        /// Status key (per-pane identifier).
        key: String,
        /// Status value (e.g. Running / Waiting / Done / Error).
        value: String,
        #[arg(long)]
        icon: Option<String>,
        #[arg(long)]
        color: Option<String>,
        #[arg(long)]
        priority: Option<i64>,
        #[arg(long)]
        pane: Option<String>,
        /// Project to set on; omit to infer from the environment / cwd.
        #[arg(long, short = 'p')]
        project: Option<String>,
    },
    /// Clear an agent-status key on a project (via the running app).
    ClearStatus {
        /// Status key to clear.
        key: String,
        /// Project to clear on; omit to infer from the environment / cwd.
        #[arg(long, short = 'p')]
        project: Option<String>,
    },
    /// Duplicate a project into N throwaway copies (via the running app).
    Duplicate {
        /// Project stem, `name:` field, or unambiguous prefix. Omit to infer it.
        name: Option<String>,
        /// Number of copies to create (1..=50).
        #[arg(long, short = 'n', default_value_t = 1, value_parser = clap::value_parser!(u32).range(1..=50))]
        count: u32,
        /// Group the copies under this sidebar folder.
        #[arg(long)]
        group: Option<String>,
        /// Action to queue on each copy (conflicts with --command).
        #[arg(long = "run", conflicts_with = "command")]
        run: Option<String>,
        /// Command to queue on each copy (conflicts with --run).
        #[arg(long)]
        command: Option<String>,
        /// Prompt to send to the queued action/command.
        #[arg(long)]
        prompt: Option<String>,
        /// Exclude uncommitted changes from the clone.
        #[arg(long)]
        exclude_uncommitted: bool,
        /// Reinstall dependencies in each copy.
        #[arg(long)]
        reinstall_deps: bool,
        /// Do not git-pull latest in each copy (overrides the app default).
        #[arg(long)]
        no_pull: bool,
        /// Emit a single machine-readable JSON object.
        #[arg(long)]
        json: bool,
    },
    /// Remove a project (via the running app). Originals require --force.
    Remove {
        /// Project stem, `name:` field, or unambiguous prefix (required).
        name: String,
        /// Allow removing an original project (its source folder is kept).
        #[arg(long)]
        force: bool,
        /// Emit a single machine-readable JSON object.
        #[arg(long)]
        json: bool,
    },
    /// Queue an action/command in a new terminal in the app (fire-and-forget).
    Run {
        /// Action name (exact or unambiguous prefix). Omit when using --command.
        action: Option<String>,
        /// Shell command to run instead of a declared action.
        #[arg(long, conflicts_with = "action")]
        command: Option<String>,
        /// Prompt to send to the action/command.
        #[arg(long)]
        prompt: Option<String>,
        /// Project to run in; omit to infer from the environment / cwd.
        #[arg(long, short = 'p')]
        project: Option<String>,
        /// Emit a single machine-readable JSON object.
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
        Commands::Start {
            name,
            profile,
            json,
        } => start::run(&ctx, name.as_deref(), profile.as_deref(), json),
        Commands::Stop { name, json } => stop::run(&ctx, name.as_deref(), json),
        Commands::Service {
            service,
            op,
            project,
            json,
        } => service_cmd::run(&ctx, &service, op, project.as_deref(), json),
        Commands::Wait {
            name,
            service,
            port,
            timeout,
            json,
        } => wait::run(
            &ctx,
            name.as_deref(),
            service.as_deref(),
            port,
            timeout,
            json,
        ),
        Commands::SetStatus {
            key,
            value,
            icon,
            color,
            priority,
            pane,
            project,
        } => setstatus::run_set(
            &ctx,
            &key,
            &value,
            icon.as_deref(),
            color.as_deref(),
            priority,
            pane.as_deref(),
            project.as_deref(),
        ),
        Commands::ClearStatus { key, project } => {
            setstatus::run_clear(&ctx, &key, project.as_deref())
        }
        Commands::Duplicate {
            name,
            count,
            group,
            run,
            command,
            prompt,
            exclude_uncommitted,
            reinstall_deps,
            no_pull,
            json,
        } => duplicate::run(
            &ctx,
            name.as_deref(),
            count,
            group.as_deref(),
            run.as_deref(),
            command.as_deref(),
            prompt.as_deref(),
            exclude_uncommitted,
            reinstall_deps,
            no_pull,
            json,
        ),
        Commands::Remove { name, force, json } => remove::run(&ctx, &name, force, json),
        Commands::Run {
            action,
            command,
            prompt,
            project,
            json,
        } => run::run(
            &ctx,
            action.as_deref(),
            command.as_deref(),
            prompt.as_deref(),
            project.as_deref(),
            json,
        ),
    };

    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(err) => {
            eprintln!("lpm: {}", err.message());
            ExitCode::from(err.code() as u8)
        }
    }
}
