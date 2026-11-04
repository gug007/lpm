//! lpm — command-line companion for the lpm desktop app.
//!
//! Reads project config from `~/.lpm` and live state from the session daemon + the app's
//! status socket, plus control verbs (start/stop/service/set-status) that it
//! delegates to the running app over the status socket. It never writes to
//! `~/.lpm` or the repo configs directly — all mutation flows through the app.

mod ask;
mod auto_pull;
mod awake;
mod config;
mod config_cmd;
mod control;
mod cp;
mod exec;
mod duplicate;
mod error;
mod hook;
mod job;
mod job_answer;
mod job_edit;
mod job_manage;
mod job_move;
mod job_open;
mod job_runtime;
mod job_fields;
mod list;
mod logs;
mod lpm_commands;
mod lpm_commands_lists;
mod mobile;
mod project;
mod ready;
mod refreshlabel;
mod remove;
mod run;
mod service;
mod service_cmd;
mod pair;
mod ports;
mod setstatus;
mod start;
mod status;
mod statussock;
mod stop;
mod style;
mod terminals;
mod sessions;
mod update;
mod util;
mod wait;
mod waitagent;

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
configuration from ~/.lpm and live state from the session daemon and the app's status socket, and can \
control projects — start, stop, restart services, set agent status — by asking the running \
app over that socket (so the app stays the single owner of run-state).\n\n\
Inspection commands: `list`, `project`, `logs`, `status`, `config resolve`, `config validate`. \
Config transactions (need the app running): `config get`, `config apply`. Control commands: \
`start`, `stop`, `service`, `set-status`, `clear-status`, `duplicate`, `worktree`, `remove`, `run`, `refresh-label`, `automations`, `skills`. \
`auto-pull` shows whether the app pulls a project by itself; `auto-pull --set` changes it \
through the running app. \
Inside an automation run, `ask` puts a question to the user and waits for the answer. \
Connection commands (for a machine with no UI in front of it): `pair`, `connections`, \
and `mobile` for the iOS companion app. `update` checks for and installs lpm updates \
through the running app. `awake` keeps this machine from sleeping while agents work. \
`wait` polls client-side, except its `--agent` mode which queries the app. Inside an lpm \
terminal or a project directory the project name \
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
    /// Resolve, validate, and safely apply lpm YAML configuration.
    Config {
        #[command(subcommand)]
        command: config_cmd::Command,
    },
    #[command(
        name = "automations",
        visible_aliases = ["automation", "jobs"],
        aliases = ["job"],
        about = "Create, edit, run, pause, and inspect automations"
    )]
    Automations {
        #[command(subcommand)]
        command: job::Command,
    },
    #[command(
        name = "skills",
        visible_alias = "skill",
        about = "List, show, add, edit, and remove /name skills every agent can read"
    )]
    Saved {
        #[command(subcommand)]
        command: lpm_commands::Command,
    },
    /// Ask the user a question from inside an automation run.
    #[command(
        long_about = "Ask the user a question from inside an automation run: yes/no, a pick from \
a list, or free text. The question shows in the app, on paired phones and wherever the \
automation reports to, and the first answer from any of them wins."
    )]
    Ask(ask::AskArgs),
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
        /// With --json, include env maps, full action details, and terminal history.
        #[arg(long)]
        full: bool,
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
    /// Wait until a project / service / port is ready, or its agents settle.
    Wait {
        /// Project stem, `name:` field, or unambiguous prefix. Omit to infer it.
        name: Option<String>,
        /// The project, as a flag like the other commands take it.
        #[arg(long, short = 'p', conflicts_with = "name")]
        project: Option<String>,
        /// Wait for this declared service to be running.
        #[arg(long)]
        service: Option<String>,
        /// Wait for this TCP port to be listening (needs no project).
        #[arg(long, conflicts_with = "service")]
        port: Option<i64>,
        /// Wait until the project's AI agents settle: one reports after the wait
        /// starts and none is still working, ignoring the calling tab's own agent
        /// (needs the app running).
        #[arg(long, conflicts_with_all = ["service", "port"])]
        agent: bool,
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
        /// Terminal tab the status belongs to; defaults to the tab this runs in.
        #[arg(long)]
        pane: Option<String>,
        /// Project to set on; omit to infer from the environment / cwd.
        #[arg(long, short = 'p')]
        project: Option<String>,
    },
    /// Mint an invite so another machine can control this one.
    Pair {
        /// Withdraw the outstanding invite instead of minting one.
        #[arg(long)]
        cancel: bool,
        /// Accept connections on every network interface, not just this machine.
        /// Needed on a LAN; unsafe on a public IP without a firewall.
        #[arg(long)]
        lan: bool,
        /// Listen on this address only — e.g. a tailnet IP. Safer than --lan on a
        /// server, which would also expose the port to the public internet.
        #[arg(long, value_name = "ADDRESS", conflicts_with = "lan")]
        bind: Option<String>,
        /// Emit a single machine-readable JSON object.
        #[arg(long)]
        json: bool,
    },
    /// Keep this machine awake while agents work, for a set time, or until turned off.
    #[command(
        long_about = "Keep this machine from sleeping, as the app's Keep awake menu does. \
`agents` keeps it awake while any agent on it is working or waiting for an answer, and for a \
few minutes after the last one finishes (`--then` sets how long; 5 min by default). A time \
such as 45m, 2h or 1h30m keeps it awake that long; `on` until `off`. With no argument it \
says what is on now. Closing a laptop's lid still puts it to sleep."
    )]
    Awake {
        /// agents, on, off, a time such as 45m, 2h or 1h30m, or +1h to add an hour to the time left.
        what: Option<String>,
        /// After the last agent finishes, stay awake this long (e.g. 10m; 0 to let it sleep).
        #[arg(long, value_name = "TIME")]
        then: Option<String>,
        /// Emit a single machine-readable JSON object.
        #[arg(long)]
        json: bool,
    },
    /// List every listening TCP port with the project and service holding it.
    #[command(
        long_about = "List every TCP port this machine listens on, with the lpm project and \
service whose process holds it, or the process name and PID when nothing of lpm's does. \
--computers adds each connected paired computer's ports."
    )]
    Ports {
        /// Include each connected paired computer's ports.
        #[arg(long)]
        computers: bool,
        /// Emit a single machine-readable JSON object.
        #[arg(long)]
        json: bool,
    },
    /// Show what this machine hosts and what it's connected to.
    #[command(
        long_about = "Show what this machine hosts and what it's connected to, with what each \
connected computer lets this one's agents copy there. --activity lists the latest copies agents \
made from here or into here."
    )]
    Connections {
        /// List the latest copies agents made between computers instead.
        #[arg(long)]
        activity: bool,
        /// Emit a single machine-readable JSON object.
        #[arg(long)]
        json: bool,
    },
    /// Copy files between this computer and one it connects to.
    #[command(
        long_about = "Copy a file or folder between this computer and one it connects to. \
Write the other computer's side as NAME:PATH, NAME being any part of its name only it has, as \
`lpm connections` lists it. That computer decides what this one's agents may copy there \
(nothing, until someone allows it), and lpm asks you before anything moves. Keys, credentials \
and files that run on their own always ask again. A folder lands inside an existing folder \
under its own name; existing files are only replaced with --force."
    )]
    Cp {
        /// What to copy: a path here, or NAME:PATH on the other computer.
        src: String,
        /// Where to put it: a path here, or NAME:PATH on the other computer.
        dst: String,
        /// Replace files that are already there.
        #[arg(long)]
        force: bool,
        /// Emit a single machine-readable JSON object.
        #[arg(long)]
        json: bool,
    },
    /// Run a command on a computer this one connects to.
    #[command(
        long_about = "Run a command on a computer this one connects to, and print what it prints \
as it prints it. Write the computer as NAME, NAME being any part of its name only it has, as \
`lpm connections` lists it, and NAME:PATH to start in a folder there (its home folder \
otherwise; PATH may start with ~). One quoted command is run by the shell there as written, so \
it may hold && or a pipe; several words are run as one command, each word kept whole. Nothing \
is passed on stdin. That computer decides whether this one's agents may run commands there \
(nothing, until someone allows it), and lpm asks you before each one runs, or once for the rest \
of the tab. Exits with the command's exit code; stopping lpm exec stops the command there."
    )]
    Exec {
        /// The computer, and optionally the folder there: NAME or NAME:PATH.
        #[arg(long, value_name = "NAME[:PATH]")]
        on: String,
        /// Print one JSON object with the exit code and everything printed, at the end.
        #[arg(long)]
        json: bool,
        /// The command to run there, after --.
        #[arg(trailing_var_arg = true, allow_hyphen_values = true, required = true)]
        command: Vec<String>,
    },
    /// Pair a phone with this machine, and manage the phones already paired.
    Mobile {
        #[command(subcommand)]
        command: mobile::Command,
    },
    /// Clear an agent-status key on a project (via the running app).
    ClearStatus {
        /// Status key to clear.
        key: String,
        /// Project to clear on; omit to infer from the environment / cwd.
        #[arg(long, short = 'p')]
        project: Option<String>,
    },
    /// Duplicate a project into standalone copies.
    Duplicate {
        /// Project stem, `name:` field, or unambiguous prefix. Omit to infer it.
        name: Option<String>,
        /// Number of copies to create (1..=50).
        #[arg(long, short = 'n', default_value_t = 1, value_parser = clap::value_parser!(u32).range(1..=50))]
        count: u32,
        #[arg(
            long,
            help = "Display label in <project-name>-<short-description> form. Repeat in creation order"
        )]
        label: Vec<String>,
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
        /// Strip uncommitted changes from each copy (overrides the app setting).
        #[arg(long)]
        exclude_uncommitted: bool,
        /// Keep uncommitted changes in each copy (overrides the app setting).
        #[arg(long, conflicts_with = "exclude_uncommitted")]
        include_uncommitted: bool,
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
    /// Create linked Git worktrees of a project via the running app.
    Worktree {
        /// Project stem, `name:` field, or unambiguous prefix. Omit to infer it.
        name: Option<String>,
        /// Number of worktrees to create (1..=50).
        #[arg(long, short = 'n', default_value_t = 1, value_parser = clap::value_parser!(u32).range(1..=50))]
        count: u32,
        #[arg(
            long,
            help = "Display label in <project-name>-<short-description> form. Repeat in creation order"
        )]
        label: Vec<String>,
        /// Group the worktrees under this sidebar folder.
        #[arg(long)]
        group: Option<String>,
        /// Action to queue on each worktree (conflicts with --command).
        #[arg(long = "run", conflicts_with = "command")]
        run: Option<String>,
        /// Command to queue on each worktree (conflicts with --run).
        #[arg(long)]
        command: Option<String>,
        /// Prompt to send to the queued action/command.
        #[arg(long)]
        prompt: Option<String>,
        /// Reinstall dependencies in each worktree.
        #[arg(long)]
        reinstall_deps: bool,
        /// Emit a single machine-readable JSON object.
        #[arg(long)]
        json: bool,
    },
    /// Remove a project (via the running app). Originals and SSH projects require --force.
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
    /// Show or set whether the app fast-forwards a project from origin by itself.
    AutoPull {
        /// Project stem, `name:` field, or unambiguous prefix. Omit to infer it.
        name: Option<String>,
        /// Set this project's own auto pull via the running app; `default` removes
        /// it so the project follows its parent (for a duplicate or worktree) or the
        /// Settings mode.
        #[arg(long, value_enum, value_name = "STATE")]
        set: Option<auto_pull::Setting>,
        /// List every project instead of one.
        #[arg(long, conflicts_with_all = ["name", "set"])]
        all: bool,
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
        /// Prompt to send to the action/command; `/name args` sends that saved
        /// command's prompt with the arguments filled in.
        #[arg(long)]
        prompt: Option<String>,
        /// Project to run in; omit to infer from the environment / cwd.
        #[arg(long, short = 'p')]
        project: Option<String>,
        /// Emit a single machine-readable JSON object.
        #[arg(long)]
        json: bool,
    },
    /// Check for and install lpm updates through the running app.
    ///
    /// Without --now the install waits until no agent is mid-turn and no
    /// background action is running — run from an agent, that includes the
    /// agent itself. Installing restarts lpm, which closes its terminals;
    /// agents come back in their conversations, services keep running.
    Update {
        /// Report the installed and available versions, and whether services
        /// still run on an older lpm, without installing anything.
        #[arg(long, conflicts_with_all = ["now", "stable", "cancel", "restart_services"])]
        check: bool,
        /// Install right away, even if agents are mid-turn.
        #[arg(long)]
        now: bool,
        /// From a Beta build, install the latest stable release instead.
        #[arg(long)]
        stable: bool,
        /// Call off an install that is waiting, or still downloading.
        #[arg(long, conflicts_with_all = ["now", "stable", "restart_services"])]
        cancel: bool,
        /// Stop every service and start it again on this lpm. Services keep
        /// running through an update, on the build they started on.
        #[arg(long, conflicts_with_all = ["now", "stable"])]
        restart_services: bool,
        /// Emit machine-readable JSON.
        #[arg(long)]
        json: bool,
    },
    /// Rerun an action's label commands now (or every one in the project) and
    /// redraw labels built from git, via the running app.
    RefreshLabel {
        /// Action name (exact or unambiguous prefix); its menu items and options
        /// refresh too. Omit to refresh every label in the project.
        action: Option<String>,
        /// Project to refresh; omit to infer from the environment / cwd.
        #[arg(long, short = 'p')]
        project: Option<String>,
    },
}

fn exclude_uncommitted_override(exclude: bool, include: bool) -> Option<bool> {
    match (exclude, include) {
        (true, _) => Some(true),
        (_, true) => Some(false),
        _ => None,
    }
}

fn main() -> ExitCode {
    // Agent hooks bypass clap: a usage error exits 2, which Claude Code reads as
    // "block this tool call", so a hook always exits 0 whatever it was given.
    let args: Vec<String> = std::env::args_os()
        .map(|arg| arg.to_string_lossy().into_owned())
        .collect();
    if args.get(1).map(String::as_str) == Some("hook") {
        hook::run(&args[2..]);
        return ExitCode::SUCCESS;
    }
    // Cursor runs the hooks in Claude's settings without their `args`, so the
    // Windows ones start this with none — and a usage error's exit 2 is Cursor's
    // "block this action" too.
    if args.len() == 1 && std::env::var_os("CURSOR_VERSION").is_some() {
        return ExitCode::SUCCESS;
    }
    let cli = Cli::parse();
    let ctx = config::Ctx::from_home();

    let result = match cli.command {
        Commands::Ask(args) => return ask::run(&ctx, args),
        Commands::Config { command } => config_cmd::run(&ctx, command),
        Commands::Automations { command } => job::run(&ctx, command),
        Commands::Saved { command } => lpm_commands::run(&ctx, command),
        Commands::List { json } => list::run(&ctx, json),
        Commands::Project { name, json, full } => project::run(&ctx, name.as_deref(), json, full),
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
            project,
            service,
            port,
            agent,
            timeout,
            json,
        } => wait::run(
            &ctx,
            name.or(project).as_deref(),
            service.as_deref(),
            port,
            agent,
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
        Commands::Pair { cancel, lan, bind, json } => {
            pair::run(&ctx, cancel, lan, bind.as_deref(), json)
        }
        Commands::Ports { computers, json } => ports::run(&ctx, computers, json),
        Commands::Awake { what, then, json } => {
            awake::run(&ctx, what.as_deref(), then.as_deref(), json)
        }
        Commands::Connections { activity: true, json } => pair::run_activity(&ctx, json),
        Commands::Connections { activity: false, json } => pair::run_connections(&ctx, json),
        Commands::Cp {
            src,
            dst,
            force,
            json,
        } => cp::run(&ctx, &src, &dst, force, json),
        Commands::Exec { on, json, command } => exec::run(&ctx, &on, &command, json),
        Commands::Mobile { command } => mobile::run(&ctx, command),
        Commands::ClearStatus { key, project } => {
            setstatus::run_clear(&ctx, &key, project.as_deref())
        }
        Commands::Duplicate {
            name,
            count,
            label,
            group,
            run,
            command,
            prompt,
            exclude_uncommitted,
            include_uncommitted,
            reinstall_deps,
            no_pull,
            json,
        } => duplicate::run(
            &ctx,
            name.as_deref(),
            count,
            &label,
            group.as_deref(),
            false,
            run.as_deref(),
            command.as_deref(),
            prompt.as_deref(),
            exclude_uncommitted_override(exclude_uncommitted, include_uncommitted),
            reinstall_deps,
            no_pull,
            json,
        ),
        Commands::Worktree {
            name,
            count,
            label,
            group,
            run,
            command,
            prompt,
            reinstall_deps,
            json,
        } => duplicate::run(
            &ctx,
            name.as_deref(),
            count,
            &label,
            group.as_deref(),
            true,
            run.as_deref(),
            command.as_deref(),
            prompt.as_deref(),
            None,
            reinstall_deps,
            false,
            json,
        ),
        Commands::Remove { name, force, json } => remove::run(&ctx, &name, force, json),
        Commands::AutoPull {
            name,
            set,
            all,
            json,
        } => auto_pull::run(&ctx, name.as_deref(), set, all, json),
        Commands::Update {
            check,
            now,
            stable,
            cancel,
            restart_services,
            json,
        } => update::run(
            &ctx,
            update::Args {
                check,
                now,
                stable,
                cancel,
                restart_services,
                json,
            },
        ),
        Commands::RefreshLabel { action, project } => {
            refreshlabel::run(&ctx, action.as_deref(), project.as_deref())
        }
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
