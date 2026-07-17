// AI generation — port of desktop/aigen.go + internal/aigen. Shells out to the
// user's AI CLI (claude/codex/gemini/opencode), streams progress events, and
// returns the generated text. The 8 *-instructions read/save commands live in
// templates.rs and are reused here. Each run can carry a caller-supplied
// `gen_id` so `cancel_ai_generate` can reap it. DEFERRED: SSH port/dir in the
// action-yaml context (config.rs lacks them yet).
use crate::config;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader, Read};
use std::os::unix::process::CommandExt;
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

const LPM_ACTION_REFERENCE: &str =
    include_str!("../../../../lpm-config/references/actions.md");
const MAX_OUTPUT: usize = 4 * 1024 * 1024;
const MAX_DIFF: usize = 30_000;
const MAX_BRANCH_DIFF: usize = 6_000;

// ---- CLI detection ----------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiCliAvailability {
    pub claude: bool,
    pub codex: bool,
    pub gemini: bool,
    pub opencode: bool,
}

// Name = snake("CheckAICLIs") as emitted by the binding generator.
#[tauri::command(async)]
pub fn check_aicl_is() -> AiCliAvailability {
    AiCliAvailability {
        claude: crate::sys::which("claude"),
        codex: crate::sys::which("codex"),
        gemini: crate::sys::which("gemini"),
        opencode: crate::sys::which("opencode"),
    }
}

fn is_supported_cli(cli: &str) -> bool {
    matches!(cli, "claude" | "codex" | "gemini" | "opencode")
}

fn detect(cli: &str) -> Result<(), String> {
    if is_supported_cli(cli) && crate::sys::which(cli) {
        Ok(())
    } else if is_supported_cli(cli) {
        Err(format!("{cli} CLI not found in PATH. Install it or pick another"))
    } else {
        Err(format!("unsupported AI CLI {cli:?}"))
    }
}

// ---- slash-command enumeration ----------------------------------------------

// One slash command offered by the composer's autocomplete: a CLI built-in or a
// user/project command discovered on disk.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCommand {
    pub name: String,          // no leading "/", e.g. "review" or "prompts:draftpr"
    pub description: String,
    pub argument_hint: String, // frontmatter argument-hint, "" when absent
    pub source: String,        // "builtin" | "project" | "user"
}

// Conservative, high-confidence built-in sets. Both CLIs ship more (and filter
// by plan/platform at runtime), so we seed only the stable core and lean on the
// disk scan for the long tail.
const CLAUDE_BUILTINS: &[(&str, &str, &str)] = &[
    ("add-dir", "Add a working directory for file access", "<path>"),
    ("agents", "Manage subagent configurations", ""),
    ("clear", "Start a new conversation with empty context", ""),
    ("compact", "Summarize the conversation to free context", "[instructions]"),
    ("config", "Open settings", ""),
    ("context", "Visualize context usage", ""),
    ("cost", "Show token cost and usage", ""),
    ("diff", "Open the diff viewer", ""),
    ("doctor", "Diagnose the install and settings", ""),
    ("effort", "Set the model effort level", "[low|medium|high|xhigh|max|auto]"),
    ("exit", "Exit the CLI", ""),
    ("help", "Show help and available commands", ""),
    ("init", "Initialize the project with a CLAUDE.md guide", ""),
    ("mcp", "Manage MCP server connections", ""),
    ("memory", "Edit CLAUDE.md memory files", ""),
    ("model", "Switch the AI model", "[model]"),
    ("permissions", "Manage tool permission rules", ""),
    ("resume", "Resume a previous conversation", "[session]"),
    ("review", "Review a pull request", "[PR]"),
    ("status", "Show version, model, and account", ""),
    ("usage", "Show usage limits and stats", ""),
    // Skills bundled with Claude Code (embedded in the binary, not on disk, so
    // they can't be discovered by the filesystem scan). Seeded so the menu
    // matches the CLI's own /-menu for the common everyday ones.
    ("claude-api", "Reference for the Claude API and Anthropic SDK", ""),
    ("code-review", "Review the current diff for bugs and cleanups", "[level] [PR]"),
    ("fewer-permission-prompts", "Reduce permission prompts via an allowlist", ""),
    ("keybindings-help", "Customize keyboard shortcuts", ""),
    ("loop", "Run a prompt or command on a recurring interval", "[interval] [prompt]"),
    ("run", "Launch and drive the app to see a change", ""),
    ("schedule", "Create or manage scheduled cloud agents", "[description]"),
    ("security-review", "Security-review the pending changes", ""),
    ("simplify", "Clean up changed code for reuse and simplicity, then apply fixes", "[target]"),
    ("update-config", "Configure the Claude Code harness via settings.json", ""),
    ("verify", "Run the app to confirm a change works", ""),
];

const CODEX_BUILTINS: &[(&str, &str, &str)] = &[
    ("init", "Generate an AGENTS.md scaffold", ""),
    ("compact", "Summarize the conversation to free context", ""),
    ("clear", "Clear the screen and start fresh", ""),
    ("new", "Start a new conversation", ""),
    ("diff", "Show the git diff", ""),
    ("mention", "Attach files to the conversation", ""),
    ("status", "Show session config and token counts", ""),
    ("model", "Choose the active model", ""),
    ("review", "Review the working tree", ""),
    ("resume", "Resume a saved conversation", ""),
    ("fork", "Fork the conversation", ""),
    ("plan", "Switch to plan mode", ""),
    ("mcp", "List configured MCP tools", ""),
    ("skills", "Browse and use skills", ""),
    ("ide", "Include open editor context", ""),
    ("usage", "View token usage", ""),
    ("quit", "Exit the CLI", ""),
];

fn builtins(cli: &str) -> Vec<AgentCommand> {
    let table: &[(&str, &str, &str)] = match cli {
        "claude" => CLAUDE_BUILTINS,
        "codex" => CODEX_BUILTINS,
        _ => &[],
    };
    table
        .iter()
        .map(|(n, d, a)| AgentCommand {
            name: (*n).to_string(),
            description: (*d).to_string(),
            argument_hint: (*a).to_string(),
            source: "builtin".to_string(),
        })
        .collect()
}

fn yaml_str(v: &serde_yaml::Value, k: &str) -> String {
    v.get(k).and_then(|x| x.as_str()).unwrap_or("").trim().to_string()
}

// Split a markdown file into (frontmatter yaml head, body). Recognizes a leading
// `---` fence closed by a `---` at the start of a later line.
fn split_frontmatter(content: &str) -> (Option<&str>, &str) {
    let trimmed = content.trim_start_matches('\u{feff}');
    let rest = match trimmed.strip_prefix("---\n").or_else(|| trimmed.strip_prefix("---\r\n")) {
        Some(r) => r,
        None => return (None, content),
    };
    let mut from = 0;
    while let Some(pos) = rest[from..].find("---") {
        let abs = from + pos;
        if abs == 0 || rest.as_bytes()[abs - 1] == b'\n' {
            let head = &rest[..abs];
            let body = rest[abs + 3..].trim_start_matches(['\r', '\n']);
            return (Some(head), body);
        }
        from = abs + 3;
    }
    (None, content)
}

// (description, argument_hint, user_invocable) for a command/skill file. A
// missing description falls back to the first non-blank body line.
fn parse_frontmatter(content: &str) -> (String, String, bool) {
    let (head, body) = split_frontmatter(content);
    let mut description = String::new();
    let mut argument_hint = String::new();
    let mut user_invocable = true;
    if let Some(head) = head {
        if let Ok(val) = serde_yaml::from_str::<serde_yaml::Value>(head) {
            description = yaml_str(&val, "description");
            argument_hint = yaml_str(&val, "argument-hint");
            if let Some(b) = val.get("user-invocable").and_then(|v| v.as_bool()) {
                user_invocable = b;
            }
        }
    }
    if description.is_empty() {
        description = body
            .lines()
            .map(|l| l.trim())
            .find(|l| !l.is_empty() && !l.starts_with("```") && !l.starts_with('#'))
            .unwrap_or("")
            .chars()
            .take(200)
            .collect();
    }
    (description, argument_hint, user_invocable)
}

fn glob_md(dir: &std::path::Path, recursive: bool) -> Vec<std::path::PathBuf> {
    let pattern = dir.join(if recursive { "**/*.md" } else { "*.md" });
    match glob::glob(&pattern.to_string_lossy()) {
        Ok(paths) => paths.filter_map(|p| p.ok()).collect(),
        Err(_) => Vec::new(),
    }
}

fn read_to_string(path: &std::path::Path) -> String {
    std::fs::read_to_string(path).unwrap_or_default()
}

// ---- per-file classification (shared by the local and remote scans) ---------
// Each takes a file's derived name + raw contents and produces the AgentCommand,
// so the SSH scan reuses the exact naming/frontmatter/skip rules rather than
// re-deriving them.

// Claude command: name is the filename stem.
fn claude_command_entry(name: &str, contents: &str, source: &str) -> AgentCommand {
    let (description, argument_hint, _) = parse_frontmatter(contents);
    AgentCommand { name: name.to_string(), description, argument_hint, source: source.to_string() }
}

// Claude skill: name is the skill directory name. `user-invocable: false` skills
// are background-only and skipped (None).
fn claude_skill_entry(name: &str, contents: &str, source: &str) -> Option<AgentCommand> {
    let (description, argument_hint, user_invocable) = parse_frontmatter(contents);
    if !user_invocable {
        return None;
    }
    Some(AgentCommand { name: name.to_string(), description, argument_hint, source: source.to_string() })
}

// Codex prompt: surfaced as `prompts:<name>` (the canonical invocation form),
// always user scope.
fn codex_prompt_entry(name: &str, contents: &str) -> AgentCommand {
    let (description, argument_hint, _) = parse_frontmatter(contents);
    AgentCommand {
        name: format!("prompts:{name}"),
        description,
        argument_hint,
        source: "user".to_string(),
    }
}

// Claude `.claude/commands/**/*.md` — command name is the filename stem.
fn scan_claude_commands(dir: &std::path::Path, source: &str, out: &mut Vec<AgentCommand>) {
    for path in glob_md(dir, true) {
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else { continue };
        out.push(claude_command_entry(stem, &read_to_string(&path), source));
    }
}

// Claude `.claude/skills/<name>/SKILL.md` — command name is the directory name.
fn scan_claude_skills(skills_dir: &std::path::Path, source: &str, out: &mut Vec<AgentCommand>) {
    let Ok(entries) = std::fs::read_dir(skills_dir) else { return };
    for entry in entries.filter_map(|e| e.ok()) {
        let dir = entry.path();
        let skill_md = dir.join("SKILL.md");
        if !skill_md.is_file() {
            continue;
        }
        let Some(name) = dir.file_name().and_then(|s| s.to_str()) else { continue };
        if let Some(cmd) = claude_skill_entry(name, &read_to_string(&skill_md), source) {
            out.push(cmd);
        }
    }
}

// Codex `${CODEX_HOME:-~/.codex}/prompts/*.md` (top-level only).
fn scan_codex_prompts(prompts_dir: &std::path::Path, out: &mut Vec<AgentCommand>) {
    for path in glob_md(prompts_dir, false) {
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else { continue };
        out.push(codex_prompt_entry(stem, &read_to_string(&path)));
    }
}

// Custom commands discovered on disk, user scope before project scope so a
// later first-wins dedup keeps the user copy when names clash.
fn scan_custom(cli: &str, cwd: &str) -> Vec<AgentCommand> {
    let home = dirs::home_dir().unwrap_or_default();
    let mut user: Vec<AgentCommand> = Vec::new();
    let mut project: Vec<AgentCommand> = Vec::new();
    match cli {
        "claude" => {
            scan_claude_commands(&home.join(".claude/commands"), "user", &mut user);
            scan_claude_skills(&home.join(".claude/skills"), "user", &mut user);
            if !cwd.trim().is_empty() {
                let root = std::path::Path::new(cwd);
                scan_claude_commands(&root.join(".claude/commands"), "project", &mut project);
                scan_claude_skills(&root.join(".claude/skills"), "project", &mut project);
            }
        }
        "codex" => {
            let base = std::env::var("CODEX_HOME")
                .ok()
                .filter(|s| !s.is_empty())
                .map(std::path::PathBuf::from)
                .unwrap_or_else(|| home.join(".codex"));
            scan_codex_prompts(&base.join("prompts"), &mut user);
        }
        _ => {}
    }
    user.extend(project);
    user
}

// Drop duplicate names (first-wins, custom before builtin), then order for the
// menu: project, then user, then builtin — alphabetical within each group.
fn dedup_and_sort(items: Vec<AgentCommand>) -> Vec<AgentCommand> {
    use std::collections::HashSet;
    let mut seen = HashSet::new();
    let mut out: Vec<AgentCommand> = Vec::new();
    for it in items {
        if seen.insert(it.name.clone()) {
            out.push(it);
        }
    }
    fn rank(source: &str) -> u8 {
        match source {
            "project" => 0,
            "user" => 1,
            _ => 2,
        }
    }
    out.sort_by(|a, b| rank(&a.source).cmp(&rank(&b.source)).then_with(|| a.name.cmp(&b.name)));
    out
}

// ---- remote (SSH) custom-command scan ---------------------------------------
// For an SSH terminal the agent runs on the host, so both the user scope
// (remote $HOME) and the project scope (remote cwd) live remotely. One `bash`
// round trip streams the candidate files length-framed as
// `KIND\x1fSCOPE\x1fNAME\x1f<bytelen>\n<contents>` (control-byte delimited,
// explicit length so markdown bodies can hold anything). Any ssh failure yields
// an empty list, degrading the composer to builtins-only.

const REMOTE_SCAN_FILE_CAP: usize = 500;
const REMOTE_SCAN_BYTE_CAP: usize = 65536;

// Shared preamble: `emit KIND SCOPE NAME FILE` frames one file, capped in count
// and per-file bytes. `\037` is the field separator (0x1f).
const REMOTE_SCAN_PREAMBLE: &str = "N=0
emit() {
  [ \"$N\" -ge 500 ] && return 0
  [ -f \"$4\" ] || return 0
  L=$(head -c 65536 \"$4\" | wc -c | tr -d ' ')
  printf '%s\\037%s\\037%s\\037%s\\n' \"$1\" \"$2\" \"$3\" \"$L\"
  head -c 65536 \"$4\"
  N=$((N+1))
}
";

fn remote_scan_script(cli: &str, dir: &str) -> String {
    match cli {
        "claude" => format!(
            "{REMOTE_SCAN_PREAMBLE}CWD={cwd}
scan_cmds() {{
  [ -d \"$1/.claude/commands\" ] || return 0
  while IFS= read -r f; do b=\"${{f##*/}}\"; emit command \"$2\" \"${{b%.md}}\" \"$f\"; done < <(find \"$1/.claude/commands\" -type f -name '*.md' 2>/dev/null)
}}
scan_skills() {{
  [ -d \"$1/.claude/skills\" ] || return 0
  while IFS= read -r f; do d=\"${{f%/*}}\"; emit skill \"$2\" \"${{d##*/}}\" \"$f\"; done < <(find \"$1/.claude/skills\" -mindepth 2 -maxdepth 2 -type f -name 'SKILL.md' 2>/dev/null)
}}
scan_cmds \"$HOME\" user
scan_skills \"$HOME\" user
if [ -n \"$CWD\" ]; then scan_cmds \"$CWD\" project; scan_skills \"$CWD\" project; fi
",
            cwd = config::quote_remote_path(dir)
        ),
        "codex" => format!(
            "{REMOTE_SCAN_PREAMBLE}CH=\"${{CODEX_HOME:-$HOME/.codex}}\"
if [ -d \"$CH/prompts\" ]; then
  while IFS= read -r f; do b=\"${{f##*/}}\"; emit codex user \"${{b%.md}}\" \"$f\"; done < <(find \"$CH/prompts\" -maxdepth 1 -type f -name '*.md' 2>/dev/null)
fi
"
        ),
        _ => String::new(),
    }
}

fn scan_custom_remote(cli: &str, ssh: &config::SshSettings, dir: &str) -> Vec<AgentCommand> {
    let script = remote_scan_script(cli, dir);
    if script.is_empty() {
        return Vec::new();
    }
    let out = crate::sshexec::remote_command(ssh, "", "bash", &["-lc", &script], &[]).output();
    match out {
        Ok(o) if o.status.success() => parse_remote_scan(&o.stdout),
        _ => Vec::new(),
    }
}

fn parse_remote_scan(bytes: &[u8]) -> Vec<AgentCommand> {
    let mut user: Vec<AgentCommand> = Vec::new();
    let mut project: Vec<AgentCommand> = Vec::new();
    let mut i = 0;
    let mut count = 0;
    while i < bytes.len() && count < REMOTE_SCAN_FILE_CAP {
        let Some(nl) = bytes[i..].iter().position(|&b| b == b'\n') else { break };
        let header = &bytes[i..i + nl];
        i += nl + 1;
        let fields: Vec<&[u8]> = header.split(|&b| b == 0x1f).collect();
        if fields.len() != 4 {
            break;
        }
        let kind = String::from_utf8_lossy(fields[0]);
        let scope = String::from_utf8_lossy(fields[1]);
        let name = String::from_utf8_lossy(fields[2]).into_owned();
        let Some(len) = std::str::from_utf8(fields[3]).ok().and_then(|s| s.trim().parse::<usize>().ok())
        else {
            break;
        };
        if len > REMOTE_SCAN_BYTE_CAP || i + len > bytes.len() {
            break;
        }
        let contents = String::from_utf8_lossy(&bytes[i..i + len]).into_owned();
        i += len;
        count += 1;
        let source = if scope == "project" { "project" } else { "user" };
        let bucket = if scope == "project" { &mut project } else { &mut user };
        match kind.as_ref() {
            "command" => bucket.push(claude_command_entry(&name, &contents, source)),
            "skill" => {
                if let Some(cmd) = claude_skill_entry(&name, &contents, source) {
                    bucket.push(cmd);
                }
            }
            "codex" => user.push(codex_prompt_entry(&name, &contents)),
            _ => {}
        }
    }
    // User before project so the first-wins dedup keeps the user copy on clash.
    user.extend(project);
    user
}

/// Enumerate the slash commands available for `cli` (built-ins + custom commands
/// discovered under `cwd` and the user's home), for the composer's autocomplete.
/// Pure, stateless filesystem query — the frontend caches per (cli, cwd). For an
/// SSH project both scopes are scanned on the remote host instead.
#[tauri::command(async)]
pub fn list_agent_commands(cli: String, cwd: String) -> Result<Vec<AgentCommand>, String> {
    if !is_supported_cli(&cli) {
        return Err(format!("unsupported AI CLI {cli:?}"));
    }
    let mut items = match crate::sshexec::remote_project_for_path(&cwd) {
        Some(ssh) => scan_custom_remote(&cli, &ssh, &cwd),
        None => scan_custom(&cli, &cwd),
    };
    items.extend(builtins(&cli));
    Ok(dedup_and_sort(items))
}

// ---- shared streaming run ---------------------------------------------------

struct RunOptions {
    model: String,
    effort: String,
    fast: bool,
    writes: bool,
    claude_env: config::ClaudeEnv,
}

fn build_args(cli: &str, prompt: &str, o: &RunOptions) -> Vec<String> {
    let s = |x: &str| x.to_string();
    match cli {
        "claude" => {
            let mut a = vec![
                s("-p"),
                s("--verbose"),
                s("--output-format"),
                s("stream-json"),
                s("--permission-mode"),
                s("bypassPermissions"),
            ];
            if !o.writes {
                a.push(s("--disallowedTools=Edit,Write,NotebookEdit"));
            }
            if !o.model.is_empty() {
                a.push(s("--model"));
                a.push(o.model.clone());
            }
            if !o.effort.is_empty() {
                a.push(s("--effort"));
                a.push(o.effort.clone());
            }
            a.push(prompt.to_string());
            a
        }
        "codex" => {
            let sandbox = if o.writes { "workspace-write" } else { "read-only" };
            let mut a = vec![s("exec"), s("--sandbox"), s(sandbox), s("--skip-git-repo-check")];
            if !o.model.is_empty() {
                a.push(s("--model"));
                a.push(o.model.clone());
            }
            if !o.effort.is_empty() {
                a.push(s("-c"));
                a.push(format!("model_reasoning_effort={}", o.effort));
            }
            if o.fast {
                a.push(s("-c"));
                a.push(s("service_tier=fast"));
            }
            a.push(prompt.to_string());
            a
        }
        "gemini" => {
            let mut a = vec![s("-p"), prompt.to_string(), s("--approval-mode"), s("yolo")];
            if !o.model.is_empty() {
                a.push(s("--model"));
                a.push(o.model.clone());
            }
            a
        }
        // opencode
        _ => {
            let mut a = vec![s("run")];
            if !o.model.is_empty() {
                a.push(s("--model"));
                a.push(o.model.clone());
            }
            a.push(prompt.to_string());
            a
        }
    }
}

// ---- cancellation -----------------------------------------------------------

/// The error a canceled run rejects with, so the frontend can stay silent
/// instead of surfacing it as a failure.
pub const AI_CANCELED: &str = "canceled";

/// gen_id -> pid of the CLI child currently running for it. Untracked runs
/// (empty gen_id) never enter the map and so can't be canceled.
fn active_gens() -> &'static Mutex<HashMap<String, i32>> {
    static MAP: OnceLock<Mutex<HashMap<String, i32>>> = OnceLock::new();
    MAP.get_or_init(|| Mutex::new(HashMap::new()))
}

fn canceled_gens() -> &'static Mutex<HashSet<String>> {
    static SET: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    SET.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Keeps the pid registration tied to the lifetime of the run, so every exit
/// path (including the `?` early returns) deregisters.
struct GenGuard(String);

impl GenGuard {
    fn register(gen_id: &str, pid: i32) -> Self {
        if !gen_id.is_empty() {
            active_gens().lock().unwrap().insert(gen_id.to_string(), pid);
        }
        Self(gen_id.to_string())
    }
}

impl Drop for GenGuard {
    fn drop(&mut self) {
        if !self.0.is_empty() {
            active_gens().lock().unwrap().remove(&self.0);
            // Also drops a flag raised by a cancel that landed after the run had
            // already read it, so nothing is left behind.
            canceled_gens().lock().unwrap().remove(&self.0);
        }
    }
}

/// Consume the cancel flag, so a later run reusing the id isn't poisoned.
fn take_canceled(gen_id: &str) -> bool {
    !gen_id.is_empty() && canceled_gens().lock().unwrap().remove(gen_id)
}

/// Stop the run registered under `gen_id`, reaping the CLI's whole process tree
/// (the CLI spawns its own helpers). Returns whether a run was found to stop.
#[tauri::command(async)]
pub fn cancel_ai_generate(gen_id: String) -> bool {
    if gen_id.is_empty() {
        return false;
    }
    let Some(pid) = active_gens().lock().unwrap().get(&gen_id).copied() else {
        return false;
    };
    canceled_gens().lock().unwrap().insert(gen_id);
    // Snapshot before signalling: once the roots die their children reparent.
    crate::proctree::kill_pids_async(crate::proctree::trees(&[pid]));
    true
}

/// Spawn the CLI, stream stdout line-by-line emitting `event` progress chunks,
/// and return the trimmed final text. claude parses stream-json events; the
/// others accumulate raw stdout.
fn run_ai(
    app: &AppHandle,
    cli: &str,
    cwd: &str,
    prompt: &str,
    opts: RunOptions,
    event: &str,
    gen_id: &str,
) -> Result<String, String> {
    detect(cli)?;
    let args = build_args(cli, prompt, &opts);

    let mut cmd = Command::new(cli);
    cmd.args(&args)
        .current_dir(cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    opts.claude_env.apply(&mut cmd);
    // Own session so cancelling reaps the CLI's descendants along with it.
    unsafe {
        cmd.pre_exec(|| {
            if libc::setsid() == -1 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }
    let mut child = cmd.spawn().map_err(|e| format!("{cli}: start: {e}"))?;
    let _gen = GenGuard::register(gen_id, child.id() as i32);

    let stdout = child.stdout.take().ok_or("no stdout")?;
    // Drain stderr on its own thread so a chatty CLI can't deadlock on a full pipe.
    let stderr_handle = child.stderr.take().map(|mut se| {
        std::thread::spawn(move || {
            let mut buf = String::new();
            let _ = se.read_to_string(&mut buf);
            buf
        })
    });

    let _ = app.emit(event, format!("Starting {cli}…"));

    let is_claude = cli == "claude";
    let is_codex = cli == "codex";
    let mut result = String::new(); // claude result text
    let mut full = String::new(); // others: raw stdout (capped)

    for line in BufReader::new(stdout).lines() {
        let Ok(line) = line else { break };
        if is_claude {
            let t = line.trim();
            if t.is_empty() {
                continue;
            }
            if let Ok(ev) = serde_json::from_str::<serde_json::Value>(t) {
                handle_claude_event(&ev, app, event, &mut result);
            }
        } else {
            if full.len() < MAX_OUTPUT {
                full.push_str(&line);
                full.push('\n');
            }
            let msg = if is_codex {
                codex_progress_line(&line)
            } else {
                let tr = line.trim();
                if tr.is_empty() {
                    String::new()
                } else {
                    truncate(tr, 100)
                }
            };
            if !msg.is_empty() {
                let _ = app.emit(event, msg);
            }
        }
    }

    let status = child.wait().map_err(|e| e.to_string())?;
    let stderr_text = stderr_handle.and_then(|h| h.join().ok()).unwrap_or_default();
    let canceled = take_canceled(gen_id);
    if !status.success() {
        if canceled {
            return Err(AI_CANCELED.into());
        }
        let se = stderr_text.trim();
        if se.is_empty() {
            return Err(format!("{cli} failed"));
        }
        let capped = &se[..se.len().min(1024)];
        return Err(format!("{cli} failed:\n{capped}"));
    }
    if !is_claude {
        let _ = app.emit(event, "Done.");
    }
    Ok(if is_claude {
        result.trim().to_string()
    } else {
        full.trim().to_string()
    })
}

fn handle_claude_event(ev: &serde_json::Value, app: &AppHandle, event: &str, result: &mut String) {
    match ev.get("type").and_then(|v| v.as_str()) {
        Some("assistant") => {
            if let Some(content) = ev
                .get("message")
                .and_then(|m| m.get("content"))
                .and_then(|c| c.as_array())
            {
                for c in content {
                    if c.get("type").and_then(|v| v.as_str()) == Some("tool_use") {
                        let msg = format_tool_use(c);
                        if !msg.is_empty() {
                            let _ = app.emit(event, msg);
                        }
                    }
                }
            }
        }
        Some("result") => {
            if let Some(r) = ev.get("result").and_then(|v| v.as_str()) {
                *result = r.to_string();
            }
            let _ = app.emit(event, "Done.");
        }
        _ => {}
    }
}

fn basename(p: &str) -> String {
    std::path::Path::new(p)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(p)
        .to_string()
}

fn format_tool_use(cm: &serde_json::Value) -> String {
    let name = cm.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let inp = |k: &str| {
        cm.get("input")
            .and_then(|i| i.get(k))
            .and_then(|v| v.as_str())
    };
    match name {
        "Read" => inp("file_path").map_or("Reading file".into(), |p| format!("Reading {}", basename(p))),
        "Grep" => inp("pattern").map_or("Searching".into(), |p| format!("Searching: {}", truncate(p, 60))),
        "Glob" => inp("pattern").map_or("Listing files".into(), |p| format!("Matching: {p}")),
        "LS" => inp("path").map_or("Listing directory".into(), |p| format!("Listing {}", basename(p))),
        "Bash" => inp("command").map_or("Running shell".into(), |c| format!("Running: {}", truncate(c, 60))),
        "" => String::new(),
        other => format!("Using {other}"),
    }
}

fn codex_progress_line(line: &str) -> String {
    let t = line.trim();
    if t.is_empty() {
        return String::new();
    }
    const DROP_PREFIX: &[&str] = &[
        "model:", "sandbox:", "session id:", "workdir:", "approval:", "provider:", "reasoning",
        "OpenAI Codex", "Reading additional input", "Shell cwd was reset",
    ];
    const DROP_EXACT: &[&str] = &["--------", "user", "codex", "tokens used"];
    if DROP_EXACT.contains(&t) || DROP_PREFIX.iter().any(|p| t.starts_with(p)) {
        return String::new();
    }
    truncate(t, 100)
}

fn truncate(s: &str, n: usize) -> String {
    let s = s.trim();
    if s.len() <= n {
        return s.to_string();
    }
    let mut end = n;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…", &s[..end])
}

fn truncate_diff(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    let mut end = max;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}\n... (truncated)", &s[..end])
}

fn extract_yaml(out: &str) -> String {
    let out = out.trim();
    if let Some(idx) = out.find("```") {
        let mut rest = &out[idx + 3..];
        if let Some(nl) = rest.find('\n') {
            rest = &rest[nl + 1..];
        }
        if let Some(end) = rest.find("```") {
            rest = &rest[..end];
        }
        return rest.trim().to_string();
    }
    for key in ["name:", "root:", "services:"] {
        if let Some(idx) = out.find(key) {
            let mut start = idx;
            let bytes = out.as_bytes();
            while start > 0 && bytes[start - 1] != b'\n' {
                start -= 1;
            }
            return out[start..].trim().to_string();
        }
    }
    out.to_string()
}

// ---- prompts ----------------------------------------------------------------

const COMMIT_MSG_PROMPT: &str = r#"Given the following git diff, write a concise commit message.
Use conventional commit format: type(scope): description
Types: feat, fix, refactor, docs, test, chore, style, perf
Keep the first line under 72 characters.
If needed, add a blank line then a brief body paragraph.
Output ONLY the commit message text. No code fences. No explanation.

"#;

const PR_TITLE_PROMPT: &str = r#"Given the following git diff and commit log from a feature branch, generate a pull request title.

Requirements:
- Keep under 70 characters
- Be descriptive but concise
- Start with a verb (Add, Fix, Update, Refactor, etc.)

Output ONLY the title text. No quotes. No code fences. No explanation.

"#;

const PR_DESCRIPTION_PROMPT: &str = r#"Given the following git diff and commit log from a feature branch, generate a pull request description.

Requirements:
- Start with a brief summary (2-3 sentences max)
- Include a bulleted list of key changes
- Keep it concise but informative

Output ONLY the description text. No code fences. No explanation.

"#;

const BRANCH_NAME_PROMPT: &str = r#"Given the following git diff and commit log, generate a short git branch name.

Requirements:
- Use kebab-case (lowercase words separated by hyphens)
- Keep under 50 characters
- Optionally prefix with a type: feat/, fix/, refactor/, docs/, chore/
- Be descriptive but concise
- No trailing slash, no spaces, no quotes

Output ONLY the branch name. No code fences. No explanation.

"#;

const MERGE_CONFLICT_PROMPT: &str = r#"Resolve all unresolved git merge conflict markers (<<<<<<<, =======, >>>>>>>) in the working tree.

Rules:
- Inspect every file currently listed by `git diff --name-only --diff-filter=U`.
- For each conflict, choose the resolution that keeps both sides' intent when both are additive (e.g. independent imports, distinct icons, separate functions). When the two sides truly conflict on the same logic, pick the side that matches the project's current direction; if unclear, prefer the incoming branch.
- Remove every conflict marker. The final file must contain no <<<<<<<, =======, or >>>>>>> lines.
- After resolving each file run `git add <file>` to stage it.
- Do NOT run `git commit`; the user reviews and commits manually.
- If a file cannot be resolved confidently, leave it alone and report the file path in your final message.

Output ONLY a brief summary of what you changed when done.
"#;

const PROJECT_CONFIG_TEMPLATE: &str = r#"Analyze the project in the current directory and generate an lpm project manager config in YAML.

lpm is a local project manager that starts/stops dev services using config files.

Config schema:
  name: <project name>              # required
  root: <absolute path>             # required
  services:                         # required, at least one
    <service_name>:
      cmd: <shell command>          # required
      cwd: <relative or absolute>   # optional, e.g. ./backend
      port: <port number>           # optional
      env:                          # optional
        KEY: value
  profiles:                         # optional — groups of service names
    default: [svc1, svc2]
    full: [svc1, svc2, svc3]
  actions:                          # optional — one-shot commands (test, migrate, deploy)
    <action_name>: <cmd string>
    # or object form:
    <action_name>:
      cmd: <shell command>
      cwd: <optional>
      confirm: true                 # show confirmation dialog

Rules:
- Read project files (package.json, Gemfile, go.mod, requirements.txt, pyproject.toml, Cargo.toml, docker-compose.yml, Makefile, manage.py, etc.) to detect services.
- Name services descriptively: frontend, backend, api, worker, db, web, etc.
- For monorepos with separate subdirs (backend/, frontend/, apps/*, services/*), use cwd on each service to point to the subdir.
- Use scripts from package.json (prefer "dev", fall back to "start") for Node projects.
- Include common actions when scripts exist: test, lint, build, migrate, typecheck.
- Set "name" to {{NAME}} and "root" to {{ROOT}}.
- Output ONLY raw YAML. No markdown code fences. No explanation. No preamble. No trailing text.
"#;

fn build_pr_prompt(base: &str, instructions: &str, diff: &str, commit_log: &str) -> String {
    let mut p = base.to_string();
    if !instructions.is_empty() {
        p.push_str(&format!("Additional instructions from the user:\n{instructions}\n\n"));
    }
    if !commit_log.is_empty() {
        p.push_str(&format!("Commits:\n{commit_log}\n"));
    }
    p.push_str(&format!("Diff:\n{diff}"));
    p
}

/// (diff, commit_log) for a feature branch vs base. Errs when there's no diff.
fn pr_diff_and_log(cwd: &str, base: &str) -> Result<(String, String), String> {
    let diff = crate::git::git_diff_branch(cwd.to_string(), base.to_string())
        .map_err(|_| "no diff to summarize".to_string())?;
    if diff.trim().is_empty() {
        return Err("no diff to summarize".into());
    }
    let diff = truncate_diff(&diff, MAX_DIFF);
    let commit_log = crate::git::git_log_branch(cwd.to_string(), base.to_string())
        .map(|commits| {
            commits
                .iter()
                .map(|c| format!("{} {}\n", c.hash, c.subject))
                .collect::<String>()
        })
        .unwrap_or_default();
    Ok((diff, commit_log))
}

// ---- commands ---------------------------------------------------------------

#[tauri::command(async)]
pub fn generate_commit_message(
    app: AppHandle,
    project_name: String,
    cwd: String,
    cli: String,
    model: String,
    effort: String,
    fast: bool,
    files: Vec<String>,
    task_description: String,
    gen_id: String,
) -> Result<String, String> {
    let diff = crate::git::git_diff(cwd.clone(), files)?;
    if diff.trim().is_empty() {
        return Err("no diff to summarize".into());
    }
    let diff = truncate_diff(&diff, MAX_DIFF);
    let instr = crate::templates::resolve_instructions(&project_name, "commit");
    let mut prompt = COMMIT_MSG_PROMPT.to_string();
    if !instr.is_empty() {
        prompt.push_str(&format!("Additional instructions from the user:\n{instr}\n\n"));
    }
    let task = task_description.trim();
    if !task.is_empty() {
        prompt.push_str(&format!(
            "The change implements the following task. Use it as the main basis for the message; the diff below confirms the details:\n{task}\n\n"
        ));
    }
    prompt.push_str(&diff);
    run_ai(&app, &cli, &cwd, &prompt, ropts(Some(&project_name), model, effort, fast, false), "commit-msg-progress", &gen_id)
}

#[tauri::command(async)]
pub fn generate_pr_title(
    app: AppHandle,
    project_name: String,
    cwd: String,
    cli: String,
    model: String,
    effort: String,
    fast: bool,
    base: String,
    gen_id: String,
) -> Result<String, String> {
    let (diff, log) = pr_diff_and_log(&cwd, &base)?;
    let instr = crate::templates::resolve_instructions(&project_name, "pr-title");
    let prompt = build_pr_prompt(PR_TITLE_PROMPT, &instr, &diff, &log);
    run_ai(&app, &cli, &cwd, &prompt, ropts(Some(&project_name), model, effort, fast, false), "pr-title-progress", &gen_id)
}

#[tauri::command(async)]
pub fn generate_pr_description(
    app: AppHandle,
    project_name: String,
    cwd: String,
    cli: String,
    model: String,
    effort: String,
    fast: bool,
    base: String,
    gen_id: String,
) -> Result<String, String> {
    let (diff, log) = pr_diff_and_log(&cwd, &base)?;
    let instr = crate::templates::resolve_instructions(&project_name, "pr-description");
    let prompt = build_pr_prompt(PR_DESCRIPTION_PROMPT, &instr, &diff, &log);
    run_ai(&app, &cli, &cwd, &prompt, ropts(Some(&project_name), model, effort, fast, false), "pr-description-progress", &gen_id)
}

#[tauri::command(async)]
pub fn generate_branch_name(
    app: AppHandle,
    project_name: String,
    cwd: String,
    cli: String,
    model: String,
    effort: String,
    fast: bool,
    gen_id: String,
) -> Result<String, String> {
    let mut commit_log = String::new();
    let mut diff = git_diff_head(&cwd);
    if diff.is_empty() {
        let base = crate::git::git_default_branch(cwd.clone());
        if !base.is_empty() {
            if let Ok((d, log)) = pr_diff_and_log(&cwd, &base) {
                diff = d;
                commit_log = log;
            }
        }
    }
    if diff.is_empty() {
        return Err("no changes to summarize".into());
    }
    let diff = truncate_diff(&diff, MAX_BRANCH_DIFF);
    let instr = crate::templates::resolve_instructions(&project_name, "branch-name");
    let prompt = build_pr_prompt(BRANCH_NAME_PROMPT, &instr, &diff, &commit_log);
    run_ai(&app, &cli, &cwd, &prompt, ropts(Some(&project_name), model, effort, fast, false), "branch-name-progress", &gen_id)
}

#[tauri::command(async)]
pub fn resolve_merge_conflicts_with_ai(
    app: AppHandle,
    project_name: Option<String>,
    cwd: String,
    cli: String,
    model: String,
    effort: String,
    fast: bool,
    gen_id: String,
) -> Result<String, String> {
    if crate::git::git_merge_conflicts(cwd.clone()).is_empty() {
        return Err("no merge conflicts to resolve".into());
    }
    run_ai(&app, &cli, &cwd, MERGE_CONFLICT_PROMPT, ropts(project_name.as_deref(), model, effort, fast, true), "merge-conflict-progress", &gen_id)
}

#[tauri::command(async)]
pub fn generate_action_yaml(
    app: AppHandle,
    project_name: String,
    cli: String,
    model: String,
    effort: String,
    fast: bool,
    user_prompt: String,
    current_yaml: String,
    gen_id: String,
) -> Result<String, String> {
    let user_prompt = user_prompt.trim();
    if user_prompt.is_empty() {
        return Err("describe what the action should do".into());
    }
    let (root, is_remote) = config::project_root(&project_name)?;
    let prompt = build_action_yaml_prompt(&project_name, &root, is_remote, user_prompt, &current_yaml);
    let cwd = if root.is_empty() { ".".to_string() } else { root };
    run_ai(&app, &cli, &cwd, &prompt, ropts(Some(&project_name), model, effort, fast, false), "action-yaml-progress", &gen_id)
}

const TRANSFORM_OUTPUT_RULES: &str = r#"

Apply the instruction above to the text below.
Output ONLY the resulting text — no preamble, no explanation, no surrounding quotes, no code fences.
Preserve any "[Image #N]" tokens exactly as they appear, keeping them in their original positions.

Text:
"#;

/// Run a user-defined composer action: apply its instruction to the composer's
/// current text and return the transformed text. A pure text transform — no file
/// writes — sharing the same CLI runner as the other generators.
#[tauri::command(async)]
pub fn transform_text(
    app: AppHandle,
    project_name: Option<String>,
    cwd: String,
    cli: String,
    model: String,
    effort: String,
    fast: bool,
    instruction: String,
    text: String,
    gen_id: String,
) -> Result<String, String> {
    let instruction = instruction.trim();
    if instruction.is_empty() {
        return Err("this action has no instruction".into());
    }
    if text.trim().is_empty() {
        return Err("nothing to transform".into());
    }
    let prompt = format!("{instruction}{TRANSFORM_OUTPUT_RULES}{text}");
    let dir = if cwd.trim().is_empty() { ".".to_string() } else { cwd };
    run_ai(&app, &cli, &dir, &prompt, ropts(project_name.as_deref(), model, effort, fast, false), "composer-transform-progress", &gen_id)
}

#[tauri::command(async)]
pub fn generate_project_config(
    app: AppHandle,
    project_name: String,
    cli: String,
    extra_prompt: String,
    gen_id: String,
) -> Result<String, String> {
    let (root, _) = config::project_root(&project_name)?;
    if root.is_empty() {
        return Err("aigen: ProjectDir is required".into());
    }
    let mut prompt = PROJECT_CONFIG_TEMPLATE
        .replace("{{NAME}}", &format!("{project_name:?}"))
        .replace("{{ROOT}}", &format!("{root:?}"));
    let extra = extra_prompt.trim();
    if !extra.is_empty() {
        prompt.push_str(&format!(
            "\nAdditional user instructions (follow these precisely, they override defaults):\n{extra}\n"
        ));
    }
    let result = run_ai(&app, &cli, &root, &prompt, ropts(Some(&project_name), String::new(), String::new(), false, false), "ai-generate-output", &gen_id)?;
    let yaml = extract_yaml(&result);
    if yaml.is_empty() {
        return Err(format!("no YAML found in {cli} output"));
    }
    Ok(yaml)
}

fn ropts(
    project_name: Option<&str>,
    model: String,
    effort: String,
    fast: bool,
    writes: bool,
) -> RunOptions {
    RunOptions {
        model,
        effort,
        fast,
        writes,
        claude_env: project_name
            .map(config::claude_env_for_project)
            .unwrap_or(config::ClaudeEnv::Inherit),
    }
}

fn git_diff_head(cwd: &str) -> String {
    Command::new("git")
        .args(["diff", "HEAD"])
        .current_dir(cwd)
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default()
}

fn build_action_yaml_prompt(
    name: &str,
    root: &str,
    is_remote: bool,
    user_prompt: &str,
    current_yaml: &str,
) -> String {
    let mut ctx = String::from("# Project context\n\n");
    ctx.push_str(&format!("- Name: {name}\n"));
    if is_remote {
        ctx.push_str("- Kind: SSH (remote)\n");
    } else {
        ctx.push_str("- Kind: local\n");
        if !root.is_empty() {
            ctx.push_str(&format!("- Project root (absolute path): {root}\n"));
        }
    }
    ctx.push_str(&format!(
        "- User-level config file: {}\n",
        config::project_path(name).to_string_lossy()
    ));

    let mut task = String::from("# Task\n\n");
    task.push_str("Produce the YAML body for a SINGLE lpm action (the value of one `actions:` entry), not a whole config file.\n\n");
    task.push_str("Output rules:\n");
    task.push_str("- Output ONLY the action's YAML fields at indent 0 — no surrounding `name:` key, no `actions:` wrapper, no code fences, no comments, no prose.\n");
    task.push_str("- Omit fields you don't need; do not invent fields outside the skill's schema.\n");
    task.push_str("- Children go under `actions:` with the same field set (no `display:` on children).\n");
    task.push_str("- The wizard already handles `display:` and `position:` — omit them.\n");
    task.push_str("- `cwd:` is relative to the project root (or `ssh.dir` for SSH projects). Use relative paths; only use absolute paths when there's a clear reason.\n\n");
    if current_yaml.trim().is_empty() {
        task.push_str("Generate a new action from the user's request below.\n\n");
        task.push_str(&format!("User's request:\n{user_prompt}\n"));
    } else {
        task.push_str("Modify the current action to satisfy the user's instruction. Return the FULL updated YAML body — not a diff. Preserve fields the user didn't ask to change.\n\n");
        task.push_str(&format!("User's instruction:\n{user_prompt}\n\nCurrent action YAML:\n{current_yaml}\n"));
    }

    format!("{ctx}\n# Reference: lpm action schema\n\n{LPM_ACTION_REFERENCE}\n\n{task}")
}

#[cfg(test)]
mod cancel_tests {
    use super::*;

    #[test]
    fn untracked_runs_are_not_cancelable() {
        assert!(!cancel_ai_generate(String::new()));
        assert!(!cancel_ai_generate("never-registered".into()));
        assert!(!take_canceled(""));
    }

    #[test]
    fn guard_deregisters_and_clears_a_late_flag() {
        {
            let _g = GenGuard::register("gen-1", 424242);
            assert_eq!(active_gens().lock().unwrap().get("gen-1"), Some(&424242));
            canceled_gens().lock().unwrap().insert("gen-1".to_string());
        }
        assert!(!active_gens().lock().unwrap().contains_key("gen-1"));
        assert!(!canceled_gens().lock().unwrap().contains("gen-1"));
    }

    #[test]
    fn take_canceled_consumes_the_flag_once() {
        let _g = GenGuard::register("gen-2", 424243);
        canceled_gens().lock().unwrap().insert("gen-2".to_string());
        assert!(take_canceled("gen-2"));
        // A later run reusing the id must not inherit the cancel.
        assert!(!take_canceled("gen-2"));
    }
}

#[cfg(test)]
mod action_yaml_prompt_tests {
    use super::*;

    #[test]
    fn prompt_uses_focused_canonical_reference() {
        let prompt = build_action_yaml_prompt("web", "/tmp/web", false, "run tests", "");
        assert!(prompt.contains("# Actions and terminals"));
        assert!(prompt.contains("`command`"));
        assert!(prompt.contains("Output ONLY the action's YAML fields"));
        assert!(!prompt.contains("Install this skill"));
        assert!(!prompt.contains("Pick the target project file"));
    }
}

#[cfg(test)]
mod remote_scan_tests {
    use super::*;

    // Frame one file the way the remote script does: header fields separated by
    // 0x1f, then a newline, then exactly `contents.len()` bytes.
    fn record(kind: &str, scope: &str, name: &str, contents: &str) -> Vec<u8> {
        let mut v = Vec::new();
        v.extend_from_slice(format!("{kind}\u{1f}{scope}\u{1f}{name}\u{1f}{}\n", contents.len()).as_bytes());
        v.extend_from_slice(contents.as_bytes());
        v
    }

    #[test]
    fn parses_multiple_files_and_scopes() {
        let mut stream = Vec::new();
        stream.extend(record("command", "user", "review", "---\ndescription: Review it\n---\nbody"));
        stream.extend(record("command", "project", "deploy", "just the body line"));
        let cmds = parse_remote_scan(&stream);
        assert_eq!(cmds.len(), 2);
        let review = cmds.iter().find(|c| c.name == "review").unwrap();
        assert_eq!(review.description, "Review it");
        assert_eq!(review.source, "user");
        let deploy = cmds.iter().find(|c| c.name == "deploy").unwrap();
        assert_eq!(deploy.description, "just the body line");
        assert_eq!(deploy.source, "project");
    }

    #[test]
    fn frontmatter_with_apostrophes_and_multiline_survives() {
        // A description containing an apostrophe and a body with control-adjacent
        // punctuation must round-trip because framing is length-based, not
        // delimiter-scanning.
        let body = "---\ndescription: don't drop this line\nargument-hint: <path>\n---\nline one\nline two";
        let cmds = parse_remote_scan(&record("command", "user", "x", body));
        assert_eq!(cmds[0].description, "don't drop this line");
        assert_eq!(cmds[0].argument_hint, "<path>");
    }

    #[test]
    fn skill_user_invocable_false_is_skipped() {
        let mut stream = Vec::new();
        stream.extend(record("skill", "user", "shown", "---\ndescription: A\n---\n"));
        stream.extend(record("skill", "project", "hidden", "---\ndescription: B\nuser-invocable: false\n---\n"));
        let cmds = parse_remote_scan(&stream);
        assert_eq!(cmds.len(), 1);
        assert_eq!(cmds[0].name, "shown");
    }

    #[test]
    fn codex_prompts_get_prefix_and_user_source() {
        let cmds = parse_remote_scan(&record("codex", "user", "draftpr", "---\ndescription: Draft a PR\n---\n"));
        assert_eq!(cmds[0].name, "prompts:draftpr");
        assert_eq!(cmds[0].source, "user");
    }

    #[test]
    fn truncated_or_malformed_stream_stops_cleanly() {
        // Header promises 999 bytes but the stream is short: no panic, no entry.
        let bad = b"command\x1fuser\x1fx\x1f999\nshort".to_vec();
        assert!(parse_remote_scan(&bad).is_empty());
        // A header with the wrong field count is ignored.
        assert!(parse_remote_scan(b"command\x1fuser\x1f5\nhello").is_empty());
    }

    #[test]
    fn script_embeds_remote_home_expanded_cwd_for_claude() {
        let script = remote_scan_script("claude", "~/code/app");
        assert!(script.contains("CWD=\"$HOME\"'/code/app'"), "{script}");
        assert!(script.contains(".claude/commands"));
        assert!(script.contains("SKILL.md"));
        // codex/other CLIs produce their own / no script.
        assert!(remote_scan_script("codex", "/x").contains("CODEX_HOME"));
        assert!(remote_scan_script("gemini", "/x").is_empty());
    }
}
