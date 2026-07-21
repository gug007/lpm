// Agent status hooks — port of desktop/agent_detect.go.
//
// Installs Claude Code (~/.claude/settings.json) and Codex (~/.codex/{config.toml,
// hooks.json}) hooks that pipe `set_status`/`clear_status` to the lpm status
// socket (socketsrv.rs) as the agent runs. Without this, the socket server has
// no clients and status badges stay dark. Install is idempotent via a
// `# lpm-hook` marker and only ever touches the `hooks` key — every other
// setting is preserved (serde_json::Value round-trips losslessly; key ordering
// alphabetizes exactly as Go's map+MarshalIndent did).
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::path::{Path, PathBuf};

const MARKER: &str = "# lpm-hook";
const STATUSLINE_MARKER: &str = "# lpm-statusline:";

// Status line scripts (presets and the user's Custom line) are generated from a
// spec by `build_custom_statusline`, composing these shared sh building blocks —
// the exact idioms the presets always used (jqr, tint, meter, append, DIM/RESET).

const STATUSLINE_HEADER: &str = r##"#!/bin/sh
input=$(cat)
jqr() { printf '%s' "$input" | jq -r "$1"; }
"##;

const STATUSLINE_TINT_FN: &str = r##"tint() { if [ "$1" -ge 80 ]; then printf '\033[31m'; elif [ "$1" -ge 50 ]; then printf '\033[33m'; else printf '\033[32m'; fi; }
"##;

// Label-less meter: the caller prints the (optionally colored) label, then this
// prints the tinted bar + track + percentage. Width comes from `$MW`.
const STATUSLINE_METER_FN: &str = r##"meter() {
    pct=$1 width=$MW
    units=$(( (pct * width * 2 + 50) / 100 ))
    [ "$units" -gt $((width * 2)) ] && units=$((width * 2)); [ "$units" -lt 0 ] && units=0
    full=$((units / 2)) half=$((units % 2))
    fill="" i=0
    while [ "$i" -lt "$full" ]; do fill="${fill}━"; i=$((i + 1)); done
    [ "$half" -eq 1 ] && fill="${fill}╸"
    track="" i=$((full + half))
    while [ "$i" -lt "$width" ]; do track="${track}━"; i=$((i + 1)); done
    printf '%b%s%b%b%s%b %s%%' "$(tint "$pct")" "$fill" "$RESET" "$DIM" "$track" "$RESET" "$pct"
}
"##;

// Equalizer meter: filled cells rise to full height, the fractional
// cell steps through the vertical eighths, the empty track sits flat and dim.
const STATUSLINE_METER_FN_BLOCKS: &str = r##"meter() {
    pct=$1 width=$MW
    filled=$(( pct * width / 100 ))
    [ "$filled" -gt "$width" ] && filled=$width
    [ "$filled" -lt 0 ] && filled=0
    rem=$(( pct * width - filled * 100 ))
    fill="" i=0
    while [ "$i" -lt "$filled" ]; do fill="${fill}▇"; i=$((i + 1)); done
    used=$filled
    if [ "$used" -lt "$width" ] && [ "$rem" -ge 15 ]; then
        if [ "$rem" -ge 85 ]; then p=▇; elif [ "$rem" -ge 70 ]; then p=▆; elif [ "$rem" -ge 55 ]; then p=▅; elif [ "$rem" -ge 40 ]; then p=▄; elif [ "$rem" -ge 27 ]; then p=▃; else p=▂; fi
        fill="${fill}${p}"; used=$((used + 1))
    fi
    track="" i=$used
    while [ "$i" -lt "$width" ]; do track="${track}▁"; i=$((i + 1)); done
    printf '%b%s%b%b%s%b %s%%' "$(tint "$pct")" "$fill" "$RESET" "$DIM" "$track" "$RESET" "$pct"
}
"##;

// Dotted meter: filled ● up to the rounded percentage, hollow ○ for the rest.
const STATUSLINE_METER_FN_DOTS: &str = r##"meter() {
    pct=$1 width=$MW
    filled=$(( (pct * width + 50) / 100 ))
    [ "$filled" -gt "$width" ] && filled=$width
    [ "$filled" -lt 0 ] && filled=0
    fill="" i=0
    while [ "$i" -lt "$filled" ]; do fill="${fill}●"; i=$((i + 1)); done
    track="" i=$filled
    while [ "$i" -lt "$width" ]; do track="${track}○"; i=$((i + 1)); done
    printf '%b%s%b%b%s%b %s%%' "$(tint "$pct")" "$fill" "$RESET" "$DIM" "$track" "$RESET" "$pct"
}
"##;

// Segmented meter: solid ▰ up to the rounded percentage, hollow ▱ for the rest.
const STATUSLINE_METER_FN_SEGMENTS: &str = r##"meter() {
    pct=$1 width=$MW
    filled=$(( (pct * width + 50) / 100 ))
    [ "$filled" -gt "$width" ] && filled=$width
    [ "$filled" -lt 0 ] && filled=0
    fill="" i=0
    while [ "$i" -lt "$filled" ]; do fill="${fill}▰"; i=$((i + 1)); done
    track="" i=$filled
    while [ "$i" -lt "$width" ]; do track="${track}▱"; i=$((i + 1)); done
    printf '%b%s%b%b%s%b %s%%' "$(tint "$pct")" "$fill" "$RESET" "$DIM" "$track" "$RESET" "$pct"
}
"##;

// Square meter: filled ■ up to the rounded percentage, hollow □ for the rest.
const STATUSLINE_METER_FN_SQUARES: &str = r##"meter() {
    pct=$1 width=$MW
    filled=$(( (pct * width + 50) / 100 ))
    [ "$filled" -gt "$width" ] && filled=$width
    [ "$filled" -lt 0 ] && filled=0
    fill="" i=0
    while [ "$i" -lt "$filled" ]; do fill="${fill}■"; i=$((i + 1)); done
    track="" i=$filled
    while [ "$i" -lt "$width" ]; do track="${track}□"; i=$((i + 1)); done
    printf '%b%s%b%b%s%b %s%%' "$(tint "$pct")" "$fill" "$RESET" "$DIM" "$track" "$RESET" "$pct"
}
"##;

// Shaded meter: dense ▓ cells, one medium ▒ cell for the fractional part, and a
// light ░ track.
const STATUSLINE_METER_FN_SHADE: &str = r##"meter() {
    pct=$1 width=$MW
    filled=$(( pct * width / 100 ))
    [ "$filled" -gt "$width" ] && filled=$width
    [ "$filled" -lt 0 ] && filled=0
    rem=$(( pct * width - filled * 100 ))
    fill="" i=0
    while [ "$i" -lt "$filled" ]; do fill="${fill}▓"; i=$((i + 1)); done
    used=$filled
    if [ "$used" -lt "$width" ] && [ "$rem" -ge 30 ]; then
        fill="${fill}▒"; used=$((used + 1))
    fi
    track="" i=$used
    while [ "$i" -lt "$width" ]; do track="${track}░"; i=$((i + 1)); done
    printf '%b%s%b%b%s%b %s%%' "$(tint "$pct")" "$fill" "$RESET" "$DIM" "$track" "$RESET" "$pct"
}
"##;

// Braille meter: full ⣿ cells, the fractional cell steps through the eight
// braille dot counts, the empty track sits on a dim ⣀ baseline.
const STATUSLINE_METER_FN_BRAILLE: &str = r##"meter() {
    pct=$1 width=$MW
    filled=$(( pct * width / 100 ))
    [ "$filled" -gt "$width" ] && filled=$width
    [ "$filled" -lt 0 ] && filled=0
    rem=$(( pct * width - filled * 100 ))
    fill="" i=0
    while [ "$i" -lt "$filled" ]; do fill="${fill}⣿"; i=$((i + 1)); done
    used=$filled
    if [ "$used" -lt "$width" ] && [ "$rem" -ge 12 ]; then
        if [ "$rem" -ge 88 ]; then p=⣷; elif [ "$rem" -ge 75 ]; then p=⣧; elif [ "$rem" -ge 62 ]; then p=⣇; elif [ "$rem" -ge 50 ]; then p=⡇; elif [ "$rem" -ge 38 ]; then p=⡆; elif [ "$rem" -ge 25 ]; then p=⡄; else p=⡀; fi
        fill="${fill}${p}"; used=$((used + 1))
    fi
    track="" i=$used
    while [ "$i" -lt "$width" ]; do track="${track}⣀"; i=$((i + 1)); done
    printf '%b%s%b%b%s%b %s%%' "$(tint "$pct")" "$fill" "$RESET" "$DIM" "$track" "$RESET" "$pct"
}
"##;

const STATUSLINE_APPEND_FN: &str = r##"out=""
append() { if [ -n "$out" ]; then out="${out}${SEP}${1}"; else out="$1"; fi; }
"##;

fn home() -> PathBuf {
    dirs::home_dir().unwrap_or_default()
}

fn claude_settings_path() -> PathBuf {
    home().join(".claude").join("settings.json")
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeHooksStatus {
    pub settings_exists: bool,
    pub hooks_installed: bool,
}

#[tauri::command]
pub fn check_claude_hooks() -> ClaudeHooksStatus {
    claude_hooks_status_at(&claude_settings_path())
}

#[tauri::command]
pub fn reset_claude_hooks() -> Result<(), String> {
    reset_claude_hooks_at(&claude_settings_path())
}

fn claude_hooks_status_at(path: &Path) -> ClaudeHooksStatus {
    let Ok(data) = std::fs::read(path) else {
        return ClaudeHooksStatus::default();
    };
    let Ok(settings) = serde_json::from_slice::<Value>(&data) else {
        return ClaudeHooksStatus {
            settings_exists: true,
            hooks_installed: false,
        };
    };
    let hooks_installed = settings
        .get("hooks")
        .filter(|h| h.is_object())
        .map(has_marker)
        .unwrap_or(false);
    ClaudeHooksStatus {
        settings_exists: true,
        hooks_installed,
    }
}

fn reset_claude_hooks_at(path: &Path) -> Result<(), String> {
    // Validate for a real UI error, then reinstall (which strips+re-adds lpm hooks,
    // keeping the user's own — unlike removing the whole `hooks` key).
    let data = std::fs::read(path).map_err(|e| format!("cannot read Claude settings: {e}"))?;
    serde_json::from_slice::<Value>(&data)
        .map_err(|e| format!("invalid JSON in Claude settings: {e}"))?;
    install_claude_hooks_at(path)
}

/// Fired async at startup (app.go: `go a.installAgentHooks()`).
pub fn install_agent_hooks() {
    let _ = install_claude_hooks_at(&claude_settings_path()); // best-effort at startup
    install_codex_hooks();
}

/// Merge the six lpm Claude hooks into settings JSON `data`, returning Some(new
/// bytes) when a change is needed and None when unchanged or the input is not a
/// JSON object (invalid JSON is never rewritten). Pure — the transport (local fs
/// vs remote ssh) is the caller's job, so both share this exact merge/strip logic.
fn merge_claude_hooks(data: &[u8]) -> Option<Vec<u8>> {
    let mut settings = serde_json::from_slice::<Value>(data).ok()?;
    let original = settings.clone();
    let obj = settings.as_object_mut()?;
    if !obj.get("hooks").map(Value::is_object).unwrap_or(false) {
        obj.insert("hooks".into(), json!({}));
    }
    let hooks = obj.get_mut("hooks").unwrap().as_object_mut().unwrap();
    // Strip prior lpm hooks first so re-runs stay idempotent and migrate old keys;
    // the user's own hooks are kept.
    strip_lpm_hooks(hooks);

    // Per-pane key: a shared key collides in the StatusStore (keyed by project+key),
    // so only one pane would show as running.
    let set_running = send_cmd("set_status '$LPM_PROJECT_NAME' claude_code_$LPM_PANE_ID Running --icon=bolt --color=#4C8DFF --pane=$LPM_PANE_ID");
    let set_done = send_cmd("set_status '$LPM_PROJECT_NAME' claude_code_$LPM_PANE_ID Done --icon=checkmark --color=#4ade80 --pane=$LPM_PANE_ID");
    let set_error = send_cmd("set_status '$LPM_PROJECT_NAME' claude_code_$LPM_PANE_ID Error --icon=warning --color=#ef4444 --pane=$LPM_PANE_ID");
    let set_waiting = send_cmd("set_status '$LPM_PROJECT_NAME' claude_code_$LPM_PANE_ID Waiting --icon=bell --color=#f59e0b --pane=$LPM_PANE_ID");
    let clear = send_cmd("clear_status '$LPM_PROJECT_NAME' claude_code_$LPM_PANE_ID");

    append_hook(hooks, "UserPromptSubmit", claude_hook(&set_running, ""));
    append_hook(hooks, "PreToolUse", claude_hook(&set_running, ""));
    append_hook(
        hooks,
        "Notification",
        claude_hook(&set_waiting, "permission_prompt"),
    );
    append_hook(hooks, "Stop", claude_hook(&set_done, ""));
    append_hook(hooks, "StopFailure", claude_hook(&set_error, ""));
    append_hook(hooks, "SessionEnd", claude_hook(&clear, ""));

    if settings == original {
        return None;
    }
    serde_json::to_string_pretty(&settings)
        .ok()
        .map(String::into_bytes)
}

fn install_claude_hooks_at(path: &Path) -> Result<(), String> {
    let Ok(data) = std::fs::read(path) else {
        return Ok(()); // missing settings — do NOT create the file
    };
    // Write only on change; errors propagate so the Reset button can surface them.
    if let Some(out) = merge_claude_hooks(&data) {
        std::fs::write(path, out).map_err(|e| format!("cannot write Claude settings: {e}"))?;
    }
    Ok(())
}

/// Best-effort: install the Claude status hooks into the REMOTE
/// ~/.claude/settings.json over ssh, so agents on the host report status. Reads
/// via `cat` (skips a missing/unreadable file — never creates it), reuses the
/// shared merge, and writes back only on change via a temp file + atomic rename.
pub fn install_remote_claude_hooks(ssh: &crate::config::SshSettings) {
    let read = crate::sshexec::remote_command(
        ssh,
        "",
        "bash",
        &["-lc", "cat \"$HOME/.claude/settings.json\" 2>/dev/null"],
        &[],
    )
    .output();
    let Ok(out) = read else { return };
    if !out.status.success() || out.stdout.is_empty() {
        return; // missing/unreadable settings — never create
    }
    let Some(merged) = merge_claude_hooks(&out.stdout) else {
        return;
    };
    write_remote_file(ssh, "\"$HOME/.claude/settings.json\"", &merged);
}

/// Best-effort: install the Codex status hooks on the REMOTE host — enable the
/// codex_hooks feature in ~/.codex/config.toml and merge the lpm entries into
/// ~/.codex/hooks.json. Gated on the remote ~/.codex dir existing (never
/// created), the same gate the local install applies; within it, config.toml
/// and hooks.json are created when missing, also matching local.
pub fn install_remote_codex_hooks(ssh: &crate::config::SshSettings) {
    let read = |script: &str| {
        crate::sshexec::remote_command(ssh, "", "bash", &["-lc", script], &[])
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| o.stdout)
    };
    let Some(gate) = read("[ -d \"$HOME/.codex\" ] && echo yes || true") else {
        return;
    };
    if String::from_utf8_lossy(&gate).trim() != "yes" {
        return;
    }
    if let Some(config) = read("cat \"$HOME/.codex/config.toml\" 2>/dev/null || true") {
        if let Some(new) = merge_codex_feature(&String::from_utf8_lossy(&config)) {
            write_remote_file(ssh, "\"$HOME/.codex/config.toml\"", new.as_bytes());
        }
    }
    if let Some(hooks) = read("cat \"$HOME/.codex/hooks.json\" 2>/dev/null || true") {
        if let Some(new) = merge_codex_hooks(&hooks) {
            write_remote_file(ssh, "\"$HOME/.codex/hooks.json\"", &new);
        }
    }
}

/// Overwrite a remote file atomically (temp + rename) with `bytes` piped over
/// stdin. `path_expr` is a shell expression the remote login shell expands —
/// callers pass it quoted, e.g. `"$HOME/.claude/settings.json"`.
fn write_remote_file(ssh: &crate::config::SshSettings, path_expr: &str, bytes: &[u8]) {
    let script = format!("t={path_expr}.lpmtmp; cat > \"$t\" && mv -f \"$t\" {path_expr}");
    let child = crate::sshexec::remote_command(ssh, "", "bash", &["-lc", &script], &[])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn();
    let Ok(mut child) = child else { return };
    if let Some(mut stdin) = child.stdin.take() {
        use std::io::Write;
        let _ = stdin.write_all(bytes); // stdin drops here -> EOF so `cat` finishes
    }
    let _ = child.wait();
}

/// Install the remote Claude + Codex hooks once per host per app run
/// (best-effort, off-thread). Called on remote terminal spawn.
pub fn install_remote_agent_hooks_once(ssh: &crate::config::SshSettings) {
    use std::collections::HashSet;
    use std::sync::{Mutex, OnceLock};
    static DONE: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    let key = format!("{}@{}:{}", ssh.user, ssh.host, ssh.port);
    let first = DONE
        .get_or_init(Default::default)
        .lock()
        .unwrap()
        .insert(key);
    if !first {
        return;
    }
    let ssh = ssh.clone();
    std::thread::spawn(move || {
        install_remote_claude_hooks(&ssh);
        install_remote_codex_hooks(&ssh);
    });
}

fn install_codex_hooks() {
    install_codex_hooks_at(&home().join(".codex"));
}

fn install_codex_hooks_at(codex_dir: &Path) {
    if !codex_dir.exists() {
        return;
    }
    let config_path = codex_dir.join("config.toml");
    let content = std::fs::read_to_string(&config_path).unwrap_or_default();
    if let Some(new) = merge_codex_feature(&content) {
        let _ = std::fs::write(&config_path, new);
    }
    let hooks_path = codex_dir.join("hooks.json");
    let data = std::fs::read(&hooks_path).unwrap_or_default();
    if let Some(out) = merge_codex_hooks(&data) {
        let _ = std::fs::write(&hooks_path, out);
    }
}

/// Pure: config.toml content with the codex_hooks feature enabled, or None when
/// it already is. Shared by the local and remote installs.
fn merge_codex_feature(content: &str) -> Option<String> {
    if content.contains("codex_hooks") {
        return None;
    }
    Some(if content.contains("[features]") {
        content.replacen("[features]", "[features]\ncodex_hooks = true", 1)
    } else {
        format!("{content}\n[features]\ncodex_hooks = true\n")
    })
}

/// Pure: merge the lpm Codex hooks into hooks.json `data` (missing/invalid →
/// built fresh), returning Some(new bytes) when a write is needed and None when
/// unchanged. Shared by the local and remote installs.
fn merge_codex_hooks(data: &[u8]) -> Option<Vec<u8>> {
    // Per-pane key, same reason as the Claude hooks.
    let set_running = send_cmd("set_status '$LPM_PROJECT_NAME' codex_$LPM_PANE_ID Running --icon=sparkle --color=#10A37F --pane=$LPM_PANE_ID");
    let set_done = send_cmd("set_status '$LPM_PROJECT_NAME' codex_$LPM_PANE_ID Done --icon=checkmark --color=#4ade80 --pane=$LPM_PANE_ID");
    let set_waiting = send_cmd("set_status '$LPM_PROJECT_NAME' codex_$LPM_PANE_ID Waiting --icon=bell --color=#f59e0b --pane=$LPM_PANE_ID");
    let set_resume = capture_resume_cmd();

    // Each event maps to its ordered list of hook entries. SessionStart carries
    // two: the status ping plus the resume-capture hook that reports Codex's
    // real session id back to the socket (Codex has no --session-id-at-launch).
    let new_events: Vec<(&str, Vec<Value>)> = vec![
        (
            "SessionStart",
            vec![codex_entry(&set_running), codex_entry(&set_resume)],
        ),
        ("UserPromptSubmit", vec![codex_entry(&set_running)]),
        ("PreToolUse", vec![codex_entry(&set_running)]),
        // Abstains from the allow/deny decision (no stdout), so approvals still
        // reach the user — it only flips the status badge to Waiting.
        ("PermissionRequest", vec![codex_entry(&set_waiting)]),
        ("Stop", vec![codex_entry(&set_done)]),
    ];

    let original = serde_json::from_slice::<Value>(data).ok();

    let hooks_data = if let Some(mut existing) = original
        .clone()
        .filter(|e| e.get("hooks").map(Value::is_object).unwrap_or(false))
    {
        let eh = existing.get_mut("hooks").unwrap().as_object_mut().unwrap();
        strip_lpm_hooks(eh);
        for (event, entries) in &new_events {
            for entry in entries {
                append_hook(eh, event, entry.clone());
            }
        }
        existing
    } else {
        let mut m = Map::new();
        for (event, entries) in new_events {
            m.insert(event.to_string(), Value::Array(entries));
        }
        json!({ "hooks": Value::Object(m) })
    };

    if original.as_ref() == Some(&hooks_data) {
        return None;
    }
    serde_json::to_string_pretty(&hooks_data)
        .ok()
        .map(String::into_bytes)
}

/// Backgrounded socket write; only runs when the socket exists. Ends with the
/// `# lpm-hook` marker so installs are idempotent.
fn send_cmd(cmd: &str) -> String {
    format!(
        "{{ [ -n \"$LPM_SOCKET_PATH\" ] && [ -S \"$LPM_SOCKET_PATH\" ] && echo \"{cmd}\" | nc -w1 -U \"$LPM_SOCKET_PATH\" & }} >/dev/null 2>&1; {MARKER}"
    )
}

/// Claude hook entry: {matcher, hooks: [{type: command, command}]}.
fn claude_hook(cmd: &str, matcher: &str) -> Value {
    json!({ "matcher": matcher, "hooks": [ { "type": "command", "command": cmd } ] })
}

/// Codex hook entry: {hooks: [{type: command, command}]}.
fn codex_entry(cmd: &str) -> Value {
    json!({ "hooks": [ { "type": "command", "command": cmd } ] })
}

/// SessionStart resume hook: read Codex's JSON payload from stdin, extract
/// `session_id`, and report it to the socket as `set_resume` so the tab can
/// later resume this exact session (Codex has no --session-id-at-launch). stdin
/// is consumed synchronously by `sed` before the send is backgrounded — the
/// plain `send_cmd` helper ignores stdin, so this hook needs its own shape.
/// Ends with the `# lpm-hook` marker like the others so strip/idempotency works.
fn capture_resume_cmd() -> String {
    format!(
        "sid=$(sed -n 's/.*\"session_id\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p' | head -n1); {{ [ -n \"$LPM_SOCKET_PATH\" ] && [ -S \"$LPM_SOCKET_PATH\" ] && [ -n \"$LPM_PANE_ID\" ] && [ -n \"$sid\" ] && echo \"set_resume '$LPM_PROJECT_NAME' $LPM_PANE_ID $sid\" | nc -w1 -U \"$LPM_SOCKET_PATH\" & }} >/dev/null 2>&1; {MARKER}"
    )
}

// ---- Claude usage-limit statusline forwarder --------------------------------
//
// Consent-gated: enabling "Claude usage limits" installs a `statusLine` command
// into ~/.claude/settings.json that reads the statusline JSON on stdin, forwards
// it (base64) into the status socket as `agent_limits <account> --payload-b64=…`,
// and — if the user already had a statusline — chains their original command so
// their display is unchanged. The forwarder derives the account from the live
// CLAUDE_CONFIG_DIR, so a single install covers every account (per-account
// settings.json symlink to this one file). Disable restores the exact prior
// statusLine, which is preserved base64-encoded in the trailing marker.

fn claude_config_dir_env() -> &'static str {
    crate::config::CLAUDE_CONFIG_DIR_ENV
}

/// Build the wrapper `command` string. `original` is the user's prior statusLine
/// object (or Null when there was none); it is both chained inline (via its
/// `command`) and embedded base64 in the trailing marker for exact restore.
fn statusline_command(original: &Value) -> String {
    let original_cmd = original.get("command").and_then(Value::as_str);
    let embedded =
        base64::engine::general_purpose::STANDARD.encode(serde_json::to_vec(original).unwrap_or_default());
    let env = claude_config_dir_env();
    let mut s = format!(
        "acct=default; case \"${{{env}:-}}\" in */claude-accounts/*) acct=\"${{{env}##*/}}\";; esac; "
    );
    s.push_str("i=$(cat); ");
    s.push_str(
        "printf %s \"$i\" | base64 | tr -d '\\n' | { IFS= read -r b; [ -n \"$LPM_SOCKET_PATH\" ] && [ -S \"$LPM_SOCKET_PATH\" ] && printf 'agent_limits %s --payload-b64=%s\\n' \"${acct:-default}\" \"$b\" | nc -w1 -U \"$LPM_SOCKET_PATH\"; } >/dev/null 2>&1 &",
    );
    if let Some(orig) = original_cmd {
        s.push(' ');
        s.push_str("printf %s \"$i\" | ( ");
        s.push_str(orig);
        s.push_str(" )");
    }
    s.push(' ');
    s.push_str(STATUSLINE_MARKER);
    s.push_str(&embedded);
    s
}

/// If `command` is an lpm-installed wrapper, return the embedded original
/// statusLine value (an object, or Null when the user had no prior statusLine);
/// None when the command is not ours.
fn unwrap_statusline(command: &str) -> Option<Value> {
    let idx = command.rfind(STATUSLINE_MARKER)?;
    let b64 = command[idx + STATUSLINE_MARKER.len()..].trim();
    let bytes = base64::engine::general_purpose::STANDARD.decode(b64).ok()?;
    serde_json::from_slice(&bytes).ok()
}

/// The user's true prior statusLine, unwrapping our own wrapper if present so a
/// reinstall never nests. Null when there was no usable prior statusLine.
fn prior_statusline(settings: &Value) -> Value {
    let prior = settings.get("statusLine");
    let cmd = prior.and_then(|v| v.get("command")).and_then(Value::as_str);
    match cmd {
        Some(c) => match unwrap_statusline(c) {
            Some(embedded) => embedded,
            None => prior.cloned().unwrap_or(Value::Null),
        },
        None => Value::Null,
    }
}

/// Merge the statusLine forwarder into settings bytes, returning Some(new bytes)
/// on change and None when unchanged or the input is not a JSON object. Pure so
/// install/restore share one tested transform.
fn install_statusline(data: &[u8]) -> Option<Vec<u8>> {
    let before = serde_json::from_slice::<Value>(data).ok()?;
    let mut settings = before.clone();
    settings.as_object()?; // must be an object
    let original = prior_statusline(&settings);
    let command = statusline_command(&original);

    let mut slo = original.as_object().cloned().unwrap_or_default();
    slo.insert("type".into(), json!("command"));
    slo.insert("command".into(), json!(command));
    // Keep meters fresh while idle; never slow down a user's faster interval.
    let refresh = slo
        .get("refreshInterval")
        .and_then(Value::as_i64)
        .filter(|n| *n > 0)
        .unwrap_or(30)
        .min(30);
    slo.insert("refreshInterval".into(), json!(refresh));

    settings
        .as_object_mut()
        .unwrap()
        .insert("statusLine".into(), Value::Object(slo));
    if settings == before {
        return None;
    }
    serde_json::to_string_pretty(&settings)
        .ok()
        .map(String::into_bytes)
}

/// Restore the pre-install statusLine (or remove it if there was none), only
/// touching an lpm-installed wrapper. None when unchanged or not ours.
fn remove_statusline(data: &[u8]) -> Option<Vec<u8>> {
    let before = serde_json::from_slice::<Value>(data).ok()?;
    let cmd = before
        .get("statusLine")
        .and_then(|v| v.get("command"))
        .and_then(Value::as_str)?;
    let embedded = unwrap_statusline(cmd)?; // not ours -> leave untouched
    let mut settings = before.clone();
    let obj = settings.as_object_mut()?;
    match embedded {
        Value::Null => {
            obj.remove("statusLine");
        }
        other => {
            obj.insert("statusLine".into(), other);
        }
    }
    if settings == before {
        return None;
    }
    serde_json::to_string_pretty(&settings)
        .ok()
        .map(String::into_bytes)
}

fn install_claude_statusline_at(path: &Path) -> Result<(), String> {
    // On explicit opt-in, create a minimal settings.json when absent (unlike the
    // status hooks, which never create the file) so the meter can turn on.
    let data = std::fs::read(path).unwrap_or_else(|_| b"{}".to_vec());
    if let Some(out) = install_statusline(&data) {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("cannot create {}: {e}", parent.display()))?;
        }
        std::fs::write(path, out).map_err(|e| format!("cannot write Claude settings: {e}"))?;
    }
    Ok(())
}

fn remove_claude_statusline_at(path: &Path) -> Result<(), String> {
    let Ok(data) = std::fs::read(path) else {
        return Ok(()); // no file -> nothing to restore
    };
    if let Some(out) = remove_statusline(&data) {
        std::fs::write(path, out).map_err(|e| format!("cannot write Claude settings: {e}"))?;
    }
    Ok(())
}

/// Install or uninstall the Claude usage-limit forwarder. The frontend toggle
/// owns the persisted `claudeLimitsEnabled` flag; this only performs the
/// filesystem side effect.
#[tauri::command(async)]
pub fn apply_claude_limits(enabled: bool) -> Result<(), String> {
    let path = claude_settings_path();
    if enabled {
        install_claude_statusline_at(&path)
    } else {
        remove_claude_statusline_at(&path)
    }
}

/// Startup re-apply: silently reinstall the forwarder when the user previously
/// enabled it (mirrors the skill/CLI refresh — startup only refreshes opt-ins).
pub fn reapply_claude_limits_if_enabled() {
    let enabled = crate::config::load_settings()
        .get("claudeLimitsEnabled")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if enabled {
        let _ = install_claude_statusline_at(&claude_settings_path());
    }
}

// ---- Claude status line templates -------------------------------------------
//
// Built-in status line looks the user can pick in Settings. Applying one writes
// its shell script under ~/.lpm/statuslines/ and points the *underlying*
// statusLine at it — composing with the usage-limit forwarder above: if the live
// statusLine is our forwarder wrapper, the template becomes the wrapped original
// and the forwarder is re-chained on top; otherwise the template object is
// written directly. "My status line" restores the snapshot taken the first time
// a template replaced a non-lpm original.

fn statuslines_dir() -> PathBuf {
    crate::config::lpm_dir().join("statuslines")
}

/// One segment of a status line: `id` picks the source, `color` optionally tints
/// it, `label` overrides the value prefix, and `text` carries free text.
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Segment {
    pub id: String,
    #[serde(default = "default_color")]
    pub color: String,
    #[serde(default)]
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

fn default_color() -> String {
    "default".into()
}

/// Accept both the current object form and the legacy plain-string array (old
/// custom.json / older frontend payloads), normalizing everything to objects.
fn deserialize_segments<'de, D>(d: D) -> Result<Vec<Segment>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum In {
        Plain(String),
        Full(Segment),
    }
    let raw = Vec::<In>::deserialize(d)?;
    Ok(raw
        .into_iter()
        .map(|x| match x {
            In::Plain(id) => Segment {
                id,
                color: default_color(),
                text: String::new(),
                label: None,
                icon: None,
            },
            In::Full(s) => s,
        })
        .collect())
}

/// A user-composable status line: an ordered list of segments, a separator token,
/// how usage segments render, and the meter width. The presets are just fixed
/// specs (see `preset_spec`), so `build_custom_statusline` is the single generator.
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CustomSpec {
    #[serde(deserialize_with = "deserialize_segments")]
    pub segments: Vec<Segment>,
    pub separator: String,
    pub meter_style: String,
    #[serde(default = "default_meter_width")]
    pub meter_width: u32,
    /// Prefix each segment with an emoji glyph (📁 🌿 ✳ …).
    #[serde(default)]
    pub icons: bool,
    /// Decorate the git branch with a dirty marker and ahead/behind counts.
    #[serde(default)]
    pub git_status: bool,
}

fn default_meter_width() -> u32 {
    7
}

/// The emoji glyph shown before a segment when `icons` is on. Empty for ids that
/// read better bare (the free-text segment carries its own leading glyph).
fn default_segment_icon(id: &str) -> &'static str {
    match id {
        "folder" => "📁",
        "path" => "📂",
        "model" => "✳",
        "branch" => "🌿",
        "ctx" => "🧠",
        "five" => "⚡",
        "seven" => "📆",
        "cost" => "💰",
        _ => "",
    }
}

fn segment_icon(segment: &Segment) -> &str {
    segment
        .icon
        .as_deref()
        .unwrap_or_else(|| default_segment_icon(&segment.id))
}

fn segment_label<'a>(segment: &'a Segment, default: &'a str) -> &'a str {
    segment.label.as_deref().unwrap_or(default)
}

fn segment_label_prefix(segment: &Segment, default: &str) -> String {
    let label = segment_label(segment, default);
    if label.is_empty() {
        String::new()
    } else {
        format!("{label} ")
    }
}

const SEGMENT_IDS: [&str; 9] = [
    "folder", "path", "model", "branch", "ctx", "five", "seven", "cost", "text",
];

const SEGMENT_COLORS: [&str; 9] = [
    "default", "dim", "red", "green", "yellow", "blue", "magenta", "cyan", "claude",
];

const METER_STYLES: [&str; 8] =
    ["bar", "blocks", "shade", "segments", "dots", "squares", "braille", "percent"];

fn seg(id: &str) -> Segment {
    Segment {
        id: id.into(),
        color: default_color(),
        text: String::new(),
        label: None,
        icon: None,
    }
}

fn colseg(id: &str, color: &str) -> Segment {
    Segment {
        id: id.into(),
        color: color.into(),
        text: String::new(),
        label: None,
        icon: None,
    }
}

fn default_custom_spec() -> CustomSpec {
    CustomSpec {
        segments: vec![
            seg("folder"),
            colseg("model", "claude"),
            seg("ctx"),
            seg("five"),
            seg("seven"),
            colseg("cost", "yellow"),
        ],
        separator: "·".into(),
        meter_style: "bar".into(),
        meter_width: 7,
        icons: true,
        git_status: false,
    }
}

fn preset_spec(id: &str) -> Option<CustomSpec> {
    let (segments, icons) = match id {
        "minimal" => (
            vec![
                seg("folder"),
                seg("model"),
                seg("ctx"),
                seg("five"),
                seg("seven"),
                seg("cost"),
            ],
            false,
        ),
        "context" => (
            vec![
                seg("folder"),
                colseg("model", "claude"),
                seg("ctx"),
                seg("cost"),
            ],
            false,
        ),
        "meters" => (
            vec![
                seg("folder"),
                colseg("model", "claude"),
                seg("ctx"),
                seg("five"),
                seg("seven"),
                colseg("cost", "yellow"),
            ],
            false,
        ),
        "vibrant" => (
            vec![
                colseg("folder", "blue"),
                colseg("model", "claude"),
                seg("ctx"),
                seg("five"),
                seg("seven"),
                colseg("cost", "yellow"),
            ],
            true,
        ),
        _ => return None,
    };
    Some(CustomSpec {
        segments,
        separator: "·".into(),
        meter_style: "bar".into(),
        meter_width: 7,
        icons,
        git_status: false,
    })
}

/// The ANSI open sequence for a chosen color, or None for "default". Emitted as a
/// literal `\033[Nm` that the script's final `printf '%b'` turns into a real ESC.
/// "claude" is Claude's brand orange as a truecolor escape (not in the ANSI 16).
fn color_open(color: &str) -> Option<String> {
    let code = match color {
        "dim" => "2",
        "red" => "31",
        "green" => "32",
        "yellow" => "33",
        "blue" => "94",
        "magenta" => "35",
        "cyan" => "36",
        "claude" => "38;2;217;119;87",
        _ => return None,
    };
    Some(format!("\\033[{code}m"))
}

/// The open sequence for a segment: the chosen color if any, else the segment's
/// natural style (`${DIM}` for normally-dim segments, empty otherwise).
fn open_seq(color: &str, default_dim: bool) -> String {
    match color_open(color) {
        Some(c) => c,
        None if default_dim => "${DIM}".into(),
        None => String::new(),
    }
}

fn close_seq(open: &str) -> &'static str {
    if open.is_empty() {
        ""
    } else {
        "${RESET}"
    }
}

fn meter_append(var: &str, label: &str, jq: &str, style: &str, color: &str, icon: &str) -> String {
    // The icon and label take the segment color (or dim); the bar/number keep their tint.
    let lopen = open_seq(color, true);
    let label = if label.is_empty() { String::new() } else { format!("{label} ") };
    let prefix = format!("{icon}{label}");
    let compute = format!("{var}=$(jqr '{jq} // empty | round')\n");
    let body = if style == "percent" {
        format!("[ -n \"${var}\" ] && append \"${{RESET}}{lopen}{prefix}${{RESET}}$(tint \"${var}\")${{{var}}}%${{RESET}}\"\n")
    } else {
        format!("[ -n \"${var}\" ] && append \"${{RESET}}{lopen}{prefix}${{RESET}}$(meter \"${var}\")\"\n")
    };
    format!("{compute}{body}")
}

// Branch with git status: dirty marker (✳) plus ahead/behind counts vs upstream.
// Placeholders are substituted so we never fight `format!`'s brace escaping over
// the many `${...}` shell expansions inside.
const BRANCH_GIT_STATUS: &str = r##"gitdir=$(jqr '.cwd // "."')
branch=$(git -C "$gitdir" branch --show-current 2>/dev/null)
if [ -n "$branch" ]; then
  gs=""
  [ -n "$(git -C "$gitdir" status --porcelain 2>/dev/null | head -c 1)" ] && gs="✳"
  ab=$(git -C "$gitdir" rev-list --left-right --count HEAD...@{upstream} 2>/dev/null)
  ahead=$(printf '%s' "$ab" | cut -f1); behind=$(printf '%s' "$ab" | cut -f2)
  case "$ahead" in ''|*[!0-9]*) ahead=0;; esac
  case "$behind" in ''|*[!0-9]*) behind=0;; esac
  [ "$ahead" -gt 0 ] && gs="${gs}↑${ahead}"
  [ "$behind" -gt 0 ] && gs="${gs}↓${behind}"
  append "__OPEN____IC____LABEL__${branch}${gs}__CLOSE__"
fi
"##;

fn segment_snippet(segment: &Segment, style: &str, icons: bool, git_status: bool) -> String {
    let color = segment.color.as_str();
    let id = segment.id.as_str();
    // Emoji prefix, only when icons are on and this segment has one.
    let ic = if icons && !segment_icon(segment).is_empty() {
        format!("{} ", segment_icon(segment))
    } else {
        String::new()
    };
    match id {
        "folder" => {
            let o = open_seq(color, false);
            let label = segment_label_prefix(segment, "");
            format!(
                "cwd=$(basename \"$(jqr '.cwd // \".\"')\")\n[ -n \"$cwd\" ] && append \"{o}{ic}{label}$cwd{c}\"\n",
                c = close_seq(&o)
            )
        }
        "path" => {
            let o = open_seq(color, false);
            let label = segment_label_prefix(segment, "");
            format!(
                "cwd_full=$(jqr '.cwd // empty')\ncase \"$cwd_full\" in \"$HOME\"*) path=\"~${{cwd_full#$HOME}}\";; *) path=\"$cwd_full\";; esac\n[ -n \"$path\" ] && append \"{o}{ic}{label}$path{c}\"\n",
                c = close_seq(&o)
            )
        }
        "model" => {
            let o = open_seq(color, true);
            let label = segment_label_prefix(segment, "");
            format!(
                "model=$(jqr '.model.display_name // empty')\n[ -n \"$model\" ] && append \"{o}{ic}{label}$model{c}\"\n",
                c = close_seq(&o)
            )
        }
        "branch" => {
            let o = open_seq(color, true);
            let c = close_seq(&o);
            let label = segment_label_prefix(segment, "");
            if git_status {
                BRANCH_GIT_STATUS
                    .replace("__IC__", &ic)
                    .replace("__LABEL__", &label)
                    .replace("__OPEN__", &o)
                    .replace("__CLOSE__", c)
            } else {
                format!(
                    "branch=$(git -C \"$(jqr '.cwd // \".\"')\" branch --show-current 2>/dev/null)\n[ -n \"$branch\" ] && append \"{o}{ic}{label}$branch{c}\"\n"
                )
            }
        }
        "ctx" => {
            let label = segment_label_prefix(segment, "ctx");
            match color_open(color) {
                Some(cc) => format!(
                    "ctx=$(jqr '.context_window.remaining_percentage // empty | round')\n[ -n \"$ctx\" ] && append \"{cc}{ic}{label}${{ctx}}%${{RESET}}\"\n"
                ),
                None => format!(
                    "ctx=$(jqr '.context_window.remaining_percentage // empty | round')\n[ -n \"$ctx\" ] && append \"${{DIM}}{ic}{label}${{RESET}}${{ctx}}%\"\n"
                ),
            }
        }
        "cost" => {
            let o = open_seq(color, false);
            let label = segment_label_prefix(segment, "");
            format!(
                "cost_raw=$(jqr '.cost.total_cost_usd // empty')\n[ -n \"$cost_raw\" ] && cost=$(printf '%.2f' \"$cost_raw\" 2>/dev/null) || cost=\"\"\n[ -n \"$cost\" ] && append \"{o}{ic}{label}\\$${{cost}}{c}\"\n",
                c = close_seq(&o)
            )
        }
        "text" => {
            let o = open_seq(color, false);
            format!("append \"{o}{ic}{t}{c}\"\n", t = segment.text, c = close_seq(&o))
        }
        "five" => meter_append("five", segment_label(segment, "5h"), ".rate_limits.five_hour.used_percentage", style, color, &ic),
        "seven" => meter_append("seven", segment_label(segment, "7d"), ".rate_limits.seven_day.used_percentage", style, color, &ic),
        _ => String::new(),
    }
}

/// Generate the POSIX-sh status line script for `spec`, or an error describing an
/// invalid spec (empty/unknown/duplicate segment, bad separator, color, text, or
/// meter style). Multiple "text" segments are allowed; other ids are unique.
fn build_custom_statusline(spec: &CustomSpec) -> Result<String, String> {
    if spec.segments.is_empty() {
        return Err("Pick at least one thing to show.".into());
    }
    let mut seen = std::collections::HashSet::new();
    for s in &spec.segments {
        if !SEGMENT_IDS.contains(&s.id.as_str()) {
            return Err(format!("Unknown status line item: {}", s.id));
        }
        if s.id != "text" && !seen.insert(s.id.as_str()) {
            return Err(format!("Duplicate status line item: {}", s.id));
        }
        if !SEGMENT_COLORS.contains(&s.color.as_str()) {
            return Err(format!("Unknown color: {}", s.color));
        }
        if s.id == "text" {
            if s.text.trim().is_empty() {
                return Err("Text items need some text.".into());
            }
            if s.text.contains(['"', '$', '`', '\\']) {
                return Err("Text uses an unsupported character.".into());
            }
        }
        if let Some(label) = &s.label {
            if label.chars().count() > 32 {
                return Err("Labels must be 32 characters or fewer.".into());
            }
            if !label.is_empty() && label.trim().is_empty() {
                return Err("Labels must contain visible text or be empty.".into());
            }
            if label.trim() != label {
                return Err("Labels cannot start or end with spaces.".into());
            }
            if label.contains(['"', '$', '`', '\\']) || label.chars().any(char::is_control) {
                return Err("Label uses an unsupported character.".into());
            }
        }
        if let Some(icon) = &s.icon {
            if icon.chars().count() > 16 {
                return Err("Icons must be one emoji or a short symbol.".into());
            }
            if !icon.is_empty() && icon.trim().is_empty() {
                return Err("Icons must contain a visible symbol.".into());
            }
            if icon.trim() != icon {
                return Err("Icons cannot start or end with spaces.".into());
            }
            if icon.contains(['"', '$', '`', '\\']) || icon.chars().any(char::is_control) {
                return Err("Icon uses an unsupported character.".into());
            }
        }
    }
    let style = spec.meter_style.as_str();
    if !METER_STYLES.contains(&style) {
        return Err(format!("Unknown meter style: {}", spec.meter_style));
    }
    let sep = spec.separator.trim();
    let sep_len = sep.chars().count();
    if !(1..=3).contains(&sep_len) {
        return Err("Separator must be 1 to 3 characters.".into());
    }
    if sep.contains(['"', '$', '`', '\\']) {
        return Err("Separator uses an unsupported character.".into());
    }
    let width = spec.meter_width.clamp(3, 16);

    let has_rate = spec.segments.iter().any(|s| s.id == "five" || s.id == "seven");
    let needs_meter = has_rate && style != "percent";

    let mut out = String::new();
    out.push_str(STATUSLINE_HEADER);
    out.push_str("DIM='\\033[2m'; RESET='\\033[0m'; SEP=\" ${DIM}");
    out.push_str(sep);
    out.push_str("${RESET} \"\n");
    if needs_meter {
        out.push_str(&format!("MW={width}\n"));
    }
    if has_rate {
        out.push_str(STATUSLINE_TINT_FN);
    }
    if needs_meter {
        out.push_str(match style {
            "blocks" => STATUSLINE_METER_FN_BLOCKS,
            "shade" => STATUSLINE_METER_FN_SHADE,
            "segments" => STATUSLINE_METER_FN_SEGMENTS,
            "dots" => STATUSLINE_METER_FN_DOTS,
            "squares" => STATUSLINE_METER_FN_SQUARES,
            "braille" => STATUSLINE_METER_FN_BRAILLE,
            _ => STATUSLINE_METER_FN,
        });
    }
    out.push_str(STATUSLINE_APPEND_FN);
    for s in &spec.segments {
        out.push_str(&segment_snippet(s, style, spec.icons, spec.git_status));
    }
    out.push_str("printf '%b' \"$out\"\n");
    Ok(out)
}

/// Single-quote a path for embedding in a `sh <path>` command.
fn sh_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// The id of the built-in template a statusLine object points at, if any —
/// matched against the concrete script paths under `dir`.
fn detect_template_id(statusline: &Value, dir: &Path) -> Option<String> {
    let cmd = statusline.get("command").and_then(Value::as_str)?;
    for id in ["minimal", "context", "meters", "vibrant", "custom", "ai"] {
        let path = dir.join(format!("lpm-{id}.sh"));
        if cmd.contains(&*path.to_string_lossy()) {
            return Some(id.to_string());
        }
    }
    None
}

fn write_template_script(dir: &Path, id: &str, source: &str) -> Result<PathBuf, String> {
    std::fs::create_dir_all(dir).map_err(|e| format!("cannot create {}: {e}", dir.display()))?;
    let path = dir.join(format!("lpm-{id}.sh"));
    std::fs::write(&path, source).map_err(|e| format!("cannot write status line script: {e}"))?;
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755));
    Ok(path)
}

fn read_custom_spec(dir: &Path) -> CustomSpec {
    std::fs::read(dir.join("custom.json"))
        .ok()
        .and_then(|d| serde_json::from_slice::<CustomSpec>(&d).ok())
        .unwrap_or_else(default_custom_spec)
}

fn read_snapshot(dir: &Path) -> Option<Value> {
    let data = std::fs::read(dir.join("original.json")).ok()?;
    serde_json::from_slice(&data).ok()
}

/// Replace the underlying statusLine with `new_original` (an object, or Null to
/// remove it), preserving the usage-limit forwarder wrapper when present by
/// re-chaining it on top. Pure: bytes in, Some(bytes) on change else None.
fn set_original_statusline(data: &[u8], new_original: &Value) -> Option<Vec<u8>> {
    let before = serde_json::from_slice::<Value>(data).ok()?;
    let mut settings = before.clone();
    settings.as_object()?;
    let wrapped = settings
        .get("statusLine")
        .and_then(|v| v.get("command"))
        .and_then(Value::as_str)
        .map(|c| unwrap_statusline(c).is_some())
        .unwrap_or(false);
    {
        let obj = settings.as_object_mut().unwrap();
        match new_original {
            Value::Null => {
                obj.remove("statusLine");
            }
            other => {
                obj.insert("statusLine".into(), other.clone());
            }
        }
    }
    let out = if wrapped {
        let bytes = serde_json::to_vec(&settings).ok()?;
        match install_statusline(&bytes) {
            Some(rewrapped) => serde_json::from_slice::<Value>(&rewrapped).ok()?,
            None => settings,
        }
    } else {
        settings
    };
    if out == before {
        return None;
    }
    serde_json::to_string_pretty(&out)
        .ok()
        .map(String::into_bytes)
}

/// Save the current non-lpm original as the "My status line" snapshot. Taken the
/// first time a template replaces a non-lpm original; refreshed only when the
/// live original is a different non-null non-lpm statusline (user changed it by
/// hand); never taken when the original is already one of our templates.
fn maybe_snapshot(original: &Value, dir: &Path) -> Result<(), String> {
    if detect_template_id(original, dir).is_some() {
        return Ok(());
    }
    let should_write = match read_snapshot(dir) {
        None => true,
        Some(prev) => !original.is_null() && *original != prev,
    };
    if should_write {
        std::fs::create_dir_all(dir).map_err(|e| format!("cannot create {}: {e}", dir.display()))?;
        let bytes = serde_json::to_vec_pretty(original).map_err(|e| e.to_string())?;
        std::fs::write(dir.join("original.json"), bytes)
            .map_err(|e| format!("cannot write status line snapshot: {e}"))?;
    }
    Ok(())
}

/// Write a generated status line script for `id` and point the underlying
/// statusLine at it, snapshotting the prior non-lpm line and preserving the
/// usage-limit forwarder wrapper if present.
fn apply_statusline_script(settings_path: &Path, dir: &Path, id: &str, source: &str) -> Result<(), String> {
    // Explicit opt-in creates a minimal settings.json when absent, like the
    // usage-limit install does.
    let data = std::fs::read(settings_path).unwrap_or_else(|_| b"{}".to_vec());
    let settings = serde_json::from_slice::<Value>(&data)
        .map_err(|e| format!("invalid JSON in Claude settings: {e}"))?;
    maybe_snapshot(&prior_statusline(&settings), dir)?;

    let script = write_template_script(dir, id, source)?;
    let command = format!("sh {}", sh_quote(&script.to_string_lossy()));
    let template = json!({ "type": "command", "command": command });

    if let Some(out) = set_original_statusline(&data, &template) {
        if let Some(parent) = settings_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("cannot create {}: {e}", parent.display()))?;
        }
        std::fs::write(settings_path, out).map_err(|e| format!("cannot write Claude settings: {e}"))?;
    }
    Ok(())
}

fn apply_template_at(settings_path: &Path, dir: &Path, id: &str) -> Result<(), String> {
    let spec = preset_spec(id).ok_or_else(|| format!("unknown status line template: {id}"))?;
    let source = build_custom_statusline(&spec)?;
    apply_statusline_script(settings_path, dir, id, &source)
}

/// Apply the user's Custom status line, persisting the spec to custom.json so it
/// survives switching to a preset and back.
fn apply_custom_at(settings_path: &Path, dir: &Path, spec: &CustomSpec) -> Result<(), String> {
    let source = build_custom_statusline(spec)?; // validates before any write
    std::fs::create_dir_all(dir).map_err(|e| format!("cannot create {}: {e}", dir.display()))?;
    let bytes = serde_json::to_vec_pretty(spec).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("custom.json"), bytes)
        .map_err(|e| format!("cannot write status line spec: {e}"))?;
    apply_statusline_script(settings_path, dir, "custom", &source)
}

fn restore_statusline_at(settings_path: &Path, dir: &Path) -> Result<(), String> {
    let Ok(data) = std::fs::read(settings_path) else {
        return Ok(()); // no settings file -> nothing to restore
    };
    let settings = serde_json::from_slice::<Value>(&data)
        .map_err(|e| format!("invalid JSON in Claude settings: {e}"))?;
    let target = match read_snapshot(dir) {
        Some(snap) => snap,
        None => {
            // No snapshot: clear only our own template; leave a real user line alone.
            if detect_template_id(&prior_statusline(&settings), dir).is_some() {
                Value::Null
            } else {
                return Ok(());
            }
        }
    };
    if let Some(out) = set_original_statusline(&data, &target) {
        std::fs::write(settings_path, out).map_err(|e| format!("cannot write Claude settings: {e}"))?;
    }
    Ok(())
}

fn apply_claude_statusline_at(settings_path: &Path, dir: &Path, template: &str) -> Result<(), String> {
    match template {
        "current" => restore_statusline_at(settings_path, dir),
        "minimal" | "context" | "meters" | "vibrant" => {
            apply_template_at(settings_path, dir, template)
        }
        "custom" => apply_custom_at(settings_path, dir, &read_custom_spec(dir)),
        "ai" => apply_ai_at(settings_path, dir),
        other => Err(format!("unknown status line template: {other}")),
    }
}

/// Re-apply the previously generated AI status line (its script is stored under
/// lpm-ai.sh). No-op with a friendly error if nothing was generated yet.
fn apply_ai_at(settings_path: &Path, dir: &Path) -> Result<(), String> {
    let source = std::fs::read_to_string(dir.join("lpm-ai.sh"))
        .map_err(|_| "No AI status line yet. Describe one and generate it first.".to_string())?;
    apply_statusline_script(settings_path, dir, "ai", &source)
}

fn read_ai_description(dir: &Path) -> String {
    std::fs::read(dir.join("ai.json"))
        .ok()
        .and_then(|d| serde_json::from_slice::<Value>(&d).ok())
        .and_then(|v| v.get("description").and_then(Value::as_str).map(str::to_string))
        .unwrap_or_default()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeStatuslineState {
    pub selected: String,
    pub has_custom: bool,
    pub custom: CustomSpec,
    pub ai_description: String,
}

fn claude_statusline_state_at(settings_path: &Path, dir: &Path) -> ClaudeStatuslineState {
    let original = std::fs::read(settings_path)
        .ok()
        .and_then(|d| serde_json::from_slice::<Value>(&d).ok())
        .map(|s| prior_statusline(&s))
        .unwrap_or(Value::Null);
    let template = detect_template_id(&original, dir);
    let has_custom = dir.join("original.json").exists()
        || (template.is_none() && !original.is_null());
    ClaudeStatuslineState {
        selected: template.unwrap_or_else(|| "current".into()),
        has_custom,
        custom: read_custom_spec(dir),
        ai_description: read_ai_description(dir),
    }
}

fn refresh_active_template_at(settings_path: &Path, dir: &Path) -> Result<(), String> {
    let Ok(data) = std::fs::read(settings_path) else {
        return Ok(());
    };
    let Ok(settings) = serde_json::from_slice::<Value>(&data) else {
        return Ok(());
    };
    let Some(id) = detect_template_id(&prior_statusline(&settings), dir) else {
        return Ok(());
    };
    let Some(spec) = preset_spec(&id) else {
        return Ok(());
    };
    let source = build_custom_statusline(&spec)?;
    let path = dir.join(format!("lpm-{id}.sh"));
    if std::fs::read_to_string(&path).ok().as_deref() == Some(source.as_str()) {
        return Ok(());
    }
    write_template_script(dir, &id, &source)?;
    Ok(())
}

pub fn refresh_active_claude_statusline_template() {
    let _ = refresh_active_template_at(&claude_settings_path(), &statuslines_dir());
}

/// Which status line is effective on this Mac, whether there is a prior line to
/// restore, and the saved Custom spec (or the default when none). Read-only.
#[tauri::command(async)]
pub fn get_claude_statusline_state() -> ClaudeStatuslineState {
    claude_statusline_state_at(&claude_settings_path(), &statuslines_dir())
}

/// Apply a built-in status line template ("minimal"/"context"/"meters"), the
/// saved Custom line ("custom"), or restore the user's own line ("current").
#[tauri::command(async)]
pub fn apply_claude_statusline(template: String) -> Result<(), String> {
    apply_claude_statusline_at(&claude_settings_path(), &statuslines_dir(), &template)
}

/// Validate and apply a Custom status line composed in Settings.
#[tauri::command(async)]
pub fn apply_claude_statusline_custom(spec: Value) -> Result<(), String> {
    let spec: CustomSpec =
        serde_json::from_value(spec).map_err(|e| format!("invalid status line spec: {e}"))?;
    apply_custom_at(&claude_settings_path(), &statuslines_dir(), &spec)
}

/// The Custom spec behind a built-in preset, so the editor can open pre-filled
/// with that preset's segments when the user chooses to tweak it.
#[tauri::command(async)]
pub fn claude_statusline_preset_spec(id: String) -> Result<CustomSpec, String> {
    preset_spec(&id).ok_or_else(|| format!("unknown status line template: {id}"))
}

// ---- exact preview ----------------------------------------------------------
//
// Renders exactly what Claude Code would show: run the resolved script/command
// against a canonical sample payload and return raw stdout INCLUDING ANSI escapes
// so the frontend can paint it like a real terminal line.

/// A throwaway git repo used only so the branch + git-status segments render in
/// the preview (they need a real repo). Created once under the statuslines dir,
/// on branch `main` with a committed file and a dirty edit, so the preview shows
/// `main✳`. Returns its path, or None when git is unavailable.
fn ensure_preview_repo(dir: &Path) -> Option<String> {
    let repo = dir.join("my-project");
    if !repo.join(".git").exists() {
        std::fs::create_dir_all(&repo).ok()?;
        let script = format!(
            "cd {} || exit 1\n\
             git init -q . >/dev/null 2>&1 || exit 1\n\
             git symbolic-ref HEAD refs/heads/main >/dev/null 2>&1\n\
             git config user.email lpm@local >/dev/null 2>&1\n\
             git config user.name lpm >/dev/null 2>&1\n\
             git config commit.gpgsign false >/dev/null 2>&1\n\
             printf 'demo\\n' > README.md\n\
             git add README.md >/dev/null 2>&1\n\
             git commit -q -m init >/dev/null 2>&1\n\
             printf 'wip\\n' >> README.md\n",
            sh_quote(&repo.to_string_lossy())
        );
        let _ = run_shell_capture(&script, "");
    }
    repo.join(".git")
        .exists()
        .then(|| repo.to_string_lossy().into_owned())
}

/// The canonical preview payload. When a demo git repo can be prepared its path
/// becomes `.cwd`, so branch + git status render; otherwise a plain path is used.
fn preview_payload(dir: &Path) -> String {
    let cwd = ensure_preview_repo(dir).unwrap_or_else(|| "/Users/dev/my-project".to_string());
    let cwd = Value::String(cwd).to_string();
    format!(
        r#"{{"model":{{"display_name":"Opus 4.8"}},"cwd":{cwd},"workspace":{{"current_dir":{cwd}}},"context_window":{{"remaining_percentage":72}},"rate_limits":{{"five_hour":{{"used_percentage":34,"resets_at":"2026-07-20T22:00:00Z"}},"seven_day":{{"used_percentage":62,"resets_at":"2026-07-25T00:00:00Z"}}}},"cost":{{"total_cost_usd":4.2}}}}"#
    )
}

/// Run shell `code` with `payload` on stdin, killing it after ~2s.
/// Returns (exited_success, stdout, stderr). Output is capped.
fn run_shell_capture(code: &str, payload: &str) -> (bool, String, String) {
    use std::io::{Read, Write};
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};

    let child = Command::new("sh")
        .arg("-c")
        .arg(code)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();
    let Ok(mut child) = child else {
        return (false, String::new(), "could not start sh".into());
    };
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(payload.as_bytes()); // drops -> EOF for `cat`
    }
    let mut stdout = child.stdout.take();
    let mut stderr = child.stderr.take();

    let start = Instant::now();
    let mut timed_out = false;
    let success = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status.success(),
            Ok(None) => {
                if start.elapsed() > Duration::from_secs(2) {
                    let _ = child.kill();
                    let _ = child.wait();
                    timed_out = true;
                    break false;
                }
                std::thread::sleep(Duration::from_millis(15));
            }
            Err(_) => break false,
        }
    };

    let mut out = String::new();
    if let Some(so) = stdout.take() {
        let _ = so.take(64 * 1024).read_to_string(&mut out);
    }
    let mut err = String::new();
    if let Some(se) = stderr.take() {
        let _ = se.take(8 * 1024).read_to_string(&mut err);
    }
    if timed_out {
        err = "the status line took too long to render".into();
    }
    (success, out, err)
}

/// Resolve a preview selection to the shell code to run, or None when there is
/// nothing to show (e.g. "current" with no prior line).
fn resolve_preview_code(sel: &Value, dir: &Path, settings_path: &Path) -> Result<Option<String>, String> {
    let kind = sel.get("kind").and_then(Value::as_str).ok_or("missing preview kind")?;
    match kind {
        "template" => {
            let id = sel.get("id").and_then(Value::as_str).ok_or("missing template id")?;
            let spec = preset_spec(id).ok_or_else(|| format!("unknown template: {id}"))?;
            Ok(Some(build_custom_statusline(&spec)?))
        }
        "custom" => {
            let spec: CustomSpec = serde_json::from_value(sel.get("spec").cloned().unwrap_or(Value::Null))
                .map_err(|e| format!("invalid status line spec: {e}"))?;
            Ok(Some(build_custom_statusline(&spec)?))
        }
        "ai" => Ok(std::fs::read_to_string(dir.join("lpm-ai.sh")).ok()),
        "current" => {
            // The user's own prior line: the snapshot, else the live non-lpm original.
            let target = read_snapshot(dir).unwrap_or_else(|| {
                std::fs::read(settings_path)
                    .ok()
                    .and_then(|d| serde_json::from_slice::<Value>(&d).ok())
                    .map(|s| prior_statusline(&s))
                    .unwrap_or(Value::Null)
            });
            // Only the user's own command counts as "My status line".
            if detect_template_id(&target, dir).is_some() {
                return Ok(None);
            }
            Ok(target.get("command").and_then(Value::as_str).map(str::to_string))
        }
        other => Err(format!("unknown preview kind: {other}")),
    }
}

fn preview_claude_statusline_at(selection: &Value, dir: &Path, settings_path: &Path) -> Result<String, String> {
    match resolve_preview_code(selection, dir, settings_path)? {
        Some(c) if !c.trim().is_empty() => Ok(run_shell_capture(&c, &preview_payload(dir)).1),
        _ => Ok(String::new()),
    }
}

/// Render a status line selection exactly as Claude Code would, returning raw
/// stdout with ANSI escapes intact (empty string when there is nothing to show).
#[tauri::command(async)]
pub fn preview_claude_statusline(selection: Value) -> Result<String, String> {
    preview_claude_statusline_at(&selection, &statuslines_dir(), &claude_settings_path())
}

// ---- AI generation ----------------------------------------------------------

const AI_STATUSLINE_PROMPT: &str = r#"Write a POSIX sh script for a Claude Code status line.

Claude Code pipes a single JSON object to the script on stdin with these fields (any may be absent):
- .model.display_name        e.g. "Opus 4.8"
- .cwd                        absolute path of the current directory
- .workspace.current_dir     absolute path of the workspace root
- .context_window.remaining_percentage   0-100 number
- .rate_limits.five_hour.used_percentage  0-100 number
- .rate_limits.five_hour.resets_at        ISO 8601 timestamp
- .rate_limits.seven_day.used_percentage  0-100 number
- .rate_limits.seven_day.resets_at        ISO 8601 timestamp
- .cost.total_cost_usd        number, dollars spent this session

Hard rules:
- POSIX sh only (no bash-isms). Read stdin ONCE into a variable, then parse it (jq is available).
- Print exactly ONE line to stdout, no trailing newline.
- Only use jq, git, and standard POSIX tools.
- ANSI color escapes are allowed; emit them with printf '%b'. Gracefully skip any field that is absent or empty.
- A modern, readable look is encouraged: tasteful emoji glyphs, unicode meter bars (e.g. ▇▁ or ●○), and per-segment accent colors are all welcome — but keep it legible and never require a Nerd Font.
- Output ONLY the script. No markdown fences, no commentary, no explanation."#;

fn strip_code_fences(s: &str) -> String {
    let t = s.trim();
    if let Some(rest) = t.strip_prefix("```") {
        // Drop the opening fence's language tag line and the closing fence.
        let rest = rest.splitn(2, '\n').nth(1).unwrap_or("");
        let rest = rest.trim_end();
        let rest = rest.strip_suffix("```").unwrap_or(rest);
        return rest.trim().to_string();
    }
    t.to_string()
}

/// If `code` is just `sh`/`bash <path.sh>` (optionally quoted), the referenced
/// script path — so the AI base is the file's content, not the launcher command.
fn single_sh_file_ref(code: &str) -> Option<PathBuf> {
    let tokens: Vec<&str> = code.trim().split_whitespace().collect();
    if tokens.len() != 2 || !matches!(tokens[0], "sh" | "bash") {
        return None;
    }
    let path = tokens[1].trim_matches(|c| c == '\'' || c == '"');
    if path.ends_with(".sh") {
        Some(PathBuf::from(path))
    } else {
        None
    }
}

fn extract_base_script(code: &str) -> String {
    if let Some(path) = single_sh_file_ref(code) {
        if let Ok(content) = std::fs::read_to_string(&path) {
            return content;
        }
    }
    code.to_string()
}

/// The current status line to use as the base for an AI edit, resolved from the
/// same selection the preview uses. None when there is nothing to build on.
fn ai_base_for_selection_at(selection: &Value, dir: &Path, settings_path: &Path) -> Option<String> {
    match resolve_preview_code(selection, dir, settings_path).ok().flatten() {
        Some(code) if !code.trim().is_empty() => Some(extract_base_script(&code)),
        _ => None,
    }
}

pub fn ai_base_for_selection(selection: &Value) -> Option<String> {
    ai_base_for_selection_at(selection, &statuslines_dir(), &claude_settings_path())
}

/// The prompt for AI generation. When there is a current line (`base`), the model
/// is asked to modify it; otherwise it writes one from scratch.
pub fn ai_statusline_prompt(description: &str, base: Option<&str>) -> String {
    let mut p = String::from(AI_STATUSLINE_PROMPT);
    if let Some(cur) = base {
        if !cur.trim().is_empty() {
            p.push_str("\n\nThis is the current status line script. Modify it to satisfy the new instruction, keeping everything else the same:\n\n");
            p.push_str(cur.trim());
        }
    }
    p.push_str("\n\nInstruction:\n");
    p.push_str(description.trim());
    p
}

fn finalize_ai_statusline_at(
    raw: &str,
    description: &str,
    base_selection: &Value,
    settings_path: &Path,
    dir: &Path,
) -> Result<String, String> {
    let script = strip_code_fences(raw);
    if script.trim().is_empty() {
        return Err("The model returned an empty status line. Try describing it again.".into());
    }
    let (ok, out, err) = run_shell_capture(&script, &preview_payload(dir));
    if !ok || out.trim().is_empty() {
        let detail = if !err.trim().is_empty() {
            err.trim().to_string()
        } else {
            "it produced no output".to_string()
        };
        return Err(format!("The generated status line didn't run: {detail}"));
    }
    write_template_script(dir, "ai", &script)?;
    let meta = json!({ "description": description.trim(), "baseSelection": base_selection });
    let bytes = serde_json::to_vec_pretty(&meta).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("ai.json"), bytes)
        .map_err(|e| format!("cannot write status line description: {e}"))?;
    apply_statusline_script(settings_path, dir, "ai", &script)?;
    Ok(script)
}

/// Clean, validate, save, and apply an AI-generated status line script. Returns
/// the cleaned script on success; a useful error (including stderr) on failure.
pub fn finalize_ai_statusline(raw: &str, description: &str, base_selection: &Value) -> Result<String, String> {
    finalize_ai_statusline_at(raw, description, base_selection, &claude_settings_path(), &statuslines_dir())
}

fn has_marker(hooks: &Value) -> bool {
    serde_json::to_string(hooks)
        .map(|s| s.contains(MARKER))
        .unwrap_or(false)
}

/// Remove lpm-installed hook entries (command carries MARKER), keeping the user's own.
fn strip_lpm_hooks(hooks: &mut Map<String, Value>) {
    let events: Vec<String> = hooks.keys().cloned().collect();
    for ev in events {
        let Some(arr) = hooks.get_mut(&ev).and_then(Value::as_array_mut) else {
            continue;
        };
        arr.retain(|entry| !has_marker(entry));
        if arr.is_empty() {
            hooks.remove(&ev);
        }
    }
}

/// Append `entry` to hooks[event], creating/overwriting a non-array with [entry].
fn append_hook(hooks: &mut Map<String, Value>, event: &str, entry: Value) {
    match hooks.get_mut(event).and_then(Value::as_array_mut) {
        Some(arr) => arr.push(entry),
        None => {
            hooks.insert(event.to_string(), Value::Array(vec![entry]));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings_at(dir: &std::path::Path, body: &str) -> PathBuf {
        let p = dir.join("settings.json");
        std::fs::write(&p, body).unwrap();
        p
    }

    #[test]
    fn install_adds_six_hooks_and_preserves_siblings() {
        let dir = tempfile::tempdir().unwrap();
        let path = settings_at(dir.path(), r#"{"model":"opus","permissions":{"x":1}}"#);
        install_claude_hooks_at(&path).unwrap();

        let v: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        // siblings untouched
        assert_eq!(v["model"], "opus");
        assert_eq!(v["permissions"]["x"], 1);
        // all six events present, marker installed
        let hooks = v["hooks"].as_object().unwrap();
        for ev in [
            "UserPromptSubmit",
            "PreToolUse",
            "Notification",
            "Stop",
            "StopFailure",
            "SessionEnd",
        ] {
            assert!(hooks.contains_key(ev), "missing {ev}");
        }
        assert!(has_marker(&v["hooks"]));
        assert_eq!(claude_hooks_status_at(&path).hooks_installed, true);
    }

    #[test]
    fn install_uses_per_pane_status_key() {
        let dir = tempfile::tempdir().unwrap();
        let path = settings_at(dir.path(), "{}");
        install_claude_hooks_at(&path).unwrap();
        let v: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        for ev in [
            "UserPromptSubmit",
            "PreToolUse",
            "Notification",
            "Stop",
            "StopFailure",
            "SessionEnd",
        ] {
            for e in v["hooks"][ev].as_array().unwrap() {
                let cmd = e["hooks"][0]["command"].as_str().unwrap();
                assert!(
                    cmd.contains("claude_code_$LPM_PANE_ID"),
                    "{ev} not per-pane: {cmd}"
                );
            }
        }
    }

    #[test]
    fn reinstall_migrates_stale_shared_key_and_preserves_user_hooks() {
        let dir = tempfile::tempdir().unwrap();
        // Old install: a Stop hook on the shared `claude_code` key (carries MARKER),
        // next to the user's own Stop hook which must survive the migration.
        let body = r#"{
          "hooks": {
            "Stop": [
              { "matcher": "", "hooks": [ { "type": "command", "command": "old claude_code Done # lpm-hook" } ] },
              { "matcher": "", "hooks": [ { "type": "command", "command": "my-own-hook" } ] }
            ]
          }
        }"#;
        let path = settings_at(dir.path(), body);
        install_claude_hooks_at(&path).unwrap();

        let v: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        let stop = v["hooks"]["Stop"].as_array().unwrap();

        // user hook preserved
        assert!(stop
            .iter()
            .any(|e| e["hooks"][0]["command"] == "my-own-hook"));
        // exactly one lpm hook in Stop — old one replaced, not duplicated — and per-pane
        let lpm: Vec<&Value> = stop.iter().filter(|e| has_marker(e)).collect();
        assert_eq!(lpm.len(), 1, "stale lpm hook replaced, not duplicated");
        let cmd = lpm[0]["hooks"][0]["command"].as_str().unwrap();
        assert!(
            cmd.contains("claude_code_$LPM_PANE_ID"),
            "migrated to per-pane key: {cmd}"
        );
    }

    #[test]
    fn install_is_idempotent() {
        let dir = tempfile::tempdir().unwrap();
        let path = settings_at(dir.path(), "{}");
        install_claude_hooks_at(&path).unwrap();
        let first = std::fs::read_to_string(&path).unwrap();
        install_claude_hooks_at(&path).unwrap(); // second run: marker present -> no-op
        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            first,
            "no duplicate hooks"
        );
    }

    #[test]
    fn missing_settings_is_noop() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json"); // does not exist
        install_claude_hooks_at(&path).unwrap();
        assert!(!path.exists(), "must not create the file");
        let st = claude_hooks_status_at(&path);
        assert!(!st.settings_exists && !st.hooks_installed);
    }

    #[test]
    fn invalid_json_is_left_untouched() {
        let dir = tempfile::tempdir().unwrap();
        let path = settings_at(dir.path(), "{ not json");
        install_claude_hooks_at(&path).unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "{ not json");
        let st = claude_hooks_status_at(&path);
        assert!(st.settings_exists && !st.hooks_installed);
    }

    #[test]
    fn reset_removes_then_reinstalls_preserving_siblings() {
        let dir = tempfile::tempdir().unwrap();
        let path = settings_at(dir.path(), r#"{"model":"opus"}"#);
        install_claude_hooks_at(&path).unwrap();
        reset_claude_hooks_at(&path).unwrap();
        let v: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(v["model"], "opus");
        assert!(has_marker(&v["hooks"]), "reinstalled after reset");
        assert_eq!(
            v["hooks"]["Stop"].as_array().unwrap().len(),
            1,
            "no duplication"
        );
    }

    #[test]
    fn merge_returns_change_then_none_and_ignores_invalid() {
        // First merge changes the object; a second merge of the result is a no-op
        // (idempotent) — the same guarantee the remote install relies on.
        let first = merge_claude_hooks(br#"{"model":"opus"}"#).expect("first merge changes");
        let v: Value = serde_json::from_slice(&first).unwrap();
        assert_eq!(v["model"], "opus");
        assert!(has_marker(&v["hooks"]));
        assert!(
            merge_claude_hooks(&first).is_none(),
            "second merge is a no-op"
        );
        // Invalid JSON never rewritten.
        assert!(merge_claude_hooks(b"{ not json").is_none());
    }

    #[test]
    fn send_cmd_shape_matches_go() {
        let s = send_cmd("clear_status 'x' k");
        assert!(s.starts_with(r#"{ [ -n "$LPM_SOCKET_PATH" ] && [ -S "$LPM_SOCKET_PATH" ] && echo "clear_status 'x' k" | nc -w1 -U "$LPM_SOCKET_PATH" & } >/dev/null 2>&1; "#));
        assert!(s.ends_with(MARKER));
    }

    fn codex_dir_with(body: Option<&str>) -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        // install_codex_hooks_at is a no-op unless the .codex dir exists.
        let codex = dir.path().join(".codex");
        std::fs::create_dir(&codex).unwrap();
        std::fs::write(codex.join("config.toml"), "").unwrap();
        if let Some(b) = body {
            std::fs::write(codex.join("hooks.json"), b).unwrap();
        }
        dir
    }

    fn codex_hooks(dir: &std::path::Path) -> Value {
        let data = std::fs::read(dir.join(".codex").join("hooks.json")).unwrap();
        serde_json::from_slice(&data).unwrap()
    }

    #[test]
    fn codex_install_adds_resume_hook_on_session_start() {
        let dir = codex_dir_with(None);
        install_codex_hooks_at(&dir.path().join(".codex"));

        let v = codex_hooks(dir.path());
        let hooks = v["hooks"].as_object().unwrap();
        for ev in [
            "SessionStart",
            "UserPromptSubmit",
            "PreToolUse",
            "PermissionRequest",
            "Stop",
        ] {
            assert!(hooks.contains_key(ev), "missing {ev}");
        }
        let waiting = v["hooks"]["PermissionRequest"][0]["hooks"][0]["command"]
            .as_str()
            .unwrap();
        assert!(
            waiting.contains("codex_$LPM_PANE_ID Waiting"),
            "PermissionRequest must set Waiting: {waiting}"
        );
        // SessionStart holds the status ping AND the resume-capture hook.
        let start = v["hooks"]["SessionStart"].as_array().unwrap();
        assert_eq!(start.len(), 2, "SessionStart should carry two lpm hooks");
        let has_resume = start.iter().any(|e| {
            e["hooks"][0]["command"]
                .as_str()
                .map(|c| c.contains("set_resume") && c.contains("session_id"))
                .unwrap_or(false)
        });
        assert!(
            has_resume,
            "SessionStart missing set_resume hook: {start:?}"
        );
        assert!(has_marker(&v["hooks"]));
    }

    #[test]
    fn codex_install_is_idempotent() {
        let dir = codex_dir_with(None);
        let codex = dir.path().join(".codex");
        install_codex_hooks_at(&codex);
        let first = std::fs::read_to_string(codex.join("hooks.json")).unwrap();
        install_codex_hooks_at(&codex);
        assert_eq!(
            std::fs::read_to_string(codex.join("hooks.json")).unwrap(),
            first,
            "re-run must not duplicate codex hooks"
        );
        // Exactly one resume hook survives a re-run.
        let v = codex_hooks(dir.path());
        let resume_count = v["hooks"]["SessionStart"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|e| {
                e["hooks"][0]["command"]
                    .as_str()
                    .map(|c| c.contains("set_resume"))
                    .unwrap_or(false)
            })
            .count();
        assert_eq!(resume_count, 1, "resume hook not duplicated");
    }

    #[test]
    fn codex_install_preserves_user_hooks() {
        let body = r#"{
          "hooks": {
            "SessionStart": [
              { "hooks": [ { "type": "command", "command": "my-own-codex-hook" } ] }
            ]
          }
        }"#;
        let dir = codex_dir_with(Some(body));
        install_codex_hooks_at(&dir.path().join(".codex"));

        let v = codex_hooks(dir.path());
        let start = v["hooks"]["SessionStart"].as_array().unwrap();
        assert!(
            start
                .iter()
                .any(|e| e["hooks"][0]["command"] == "my-own-codex-hook"),
            "user hook must survive install"
        );
        assert!(
            start.iter().any(|e| e["hooks"][0]["command"]
                .as_str()
                .map(|c| c.contains("set_resume"))
                .unwrap_or(false)),
            "resume hook must be added alongside the user hook"
        );
    }

    #[test]
    fn capture_resume_cmd_shape() {
        let s = capture_resume_cmd();
        assert!(s.contains("session_id"), "extracts session_id from stdin");
        assert!(s.contains("set_resume '$LPM_PROJECT_NAME' $LPM_PANE_ID $sid"));
        assert!(s.contains("[ -S \"$LPM_SOCKET_PATH\" ]") && s.contains("[ -n \"$sid\" ]"));
        assert!(s.ends_with(MARKER));
    }

    #[test]
    fn statusline_wrap_forwards_and_derives_account() {
        let cmd = statusline_command(&Value::Null);
        assert!(cmd.contains("agent_limits"), "forwards to the socket verb");
        assert!(cmd.contains("--payload-b64="));
        assert!(cmd.contains("CLAUDE_CONFIG_DIR"), "derives account at runtime");
        assert!(cmd.contains(STATUSLINE_MARKER));
        // No prior statusline -> nothing chained.
        assert!(!cmd.contains("printf %s \"$i\" | ( "));
    }

    #[test]
    fn statusline_install_preserves_and_chains_user_command() {
        let body = br#"{"model":"opus","statusLine":{"type":"command","command":"my-line.sh","padding":2}}"#;
        let out = install_statusline(body).expect("install changes settings");
        let v: Value = serde_json::from_slice(&out).unwrap();
        assert_eq!(v["model"], "opus", "siblings preserved");
        assert_eq!(v["statusLine"]["padding"], 2, "padding preserved");
        let cmd = v["statusLine"]["command"].as_str().unwrap();
        assert!(cmd.contains("printf %s \"$i\" | ( my-line.sh )"), "chains original");
        assert_eq!(v["statusLine"]["refreshInterval"], 30);
        // Restore returns the exact original statusLine.
        let restored = remove_statusline(&out).expect("restore changes settings");
        let r: Value = serde_json::from_slice(&restored).unwrap();
        assert_eq!(r["statusLine"]["command"], "my-line.sh");
        assert_eq!(r["statusLine"]["padding"], 2);
        assert!(r["statusLine"].get("refreshInterval").is_none());
    }

    #[test]
    fn statusline_install_is_idempotent() {
        let body = br#"{"statusLine":{"type":"command","command":"orig"}}"#;
        let first = install_statusline(body).unwrap();
        assert!(
            install_statusline(&first).is_none(),
            "second install is a no-op (no nesting)"
        );
        // And the embedded original still restores to exactly "orig".
        let restored = remove_statusline(&first).unwrap();
        let r: Value = serde_json::from_slice(&restored).unwrap();
        assert_eq!(r["statusLine"]["command"], "orig");
    }

    #[test]
    fn statusline_install_without_prior_removes_on_restore() {
        let out = install_statusline(b"{}").expect("install changes empty settings");
        let v: Value = serde_json::from_slice(&out).unwrap();
        assert_eq!(v["statusLine"]["type"], "command");
        let restored = remove_statusline(&out).expect("restore changes settings");
        let r: Value = serde_json::from_slice(&restored).unwrap();
        assert!(r.get("statusLine").is_none(), "no prior statusline -> removed");
    }

    #[test]
    fn statusline_keeps_users_faster_refresh_interval() {
        let body = br#"{"statusLine":{"type":"command","command":"x","refreshInterval":5}}"#;
        let out = install_statusline(body).unwrap();
        let v: Value = serde_json::from_slice(&out).unwrap();
        assert_eq!(v["statusLine"]["refreshInterval"], 5, "5s beats the 30s default");
    }

    #[test]
    fn remove_leaves_foreign_statusline_untouched() {
        let body = br#"{"statusLine":{"type":"command","command":"not-ours.sh"}}"#;
        assert!(
            remove_statusline(body).is_none(),
            "a statusline we didn't install is never modified"
        );
    }

    #[test]
    fn install_and_remove_roundtrip_on_disk() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        std::fs::write(&path, r#"{"model":"opus"}"#).unwrap();
        install_claude_statusline_at(&path).unwrap();
        let v: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert!(v["statusLine"]["command"].as_str().unwrap().contains("agent_limits"));
        remove_claude_statusline_at(&path).unwrap();
        let v2: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(v2["model"], "opus");
        assert!(v2.get("statusLine").is_none());
    }

    #[test]
    fn install_creates_settings_when_absent() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json"); // does not exist
        install_claude_statusline_at(&path).unwrap();
        assert!(path.exists(), "explicit opt-in creates the file");
        let v: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(v["statusLine"]["type"], "command");
    }

    // ---- status line templates ----

    fn slt_dirs() -> (tempfile::TempDir, PathBuf, PathBuf) {
        let td = tempfile::tempdir().unwrap();
        let settings = td.path().join("settings.json");
        let sldir = td.path().join("statuslines");
        (td, settings, sldir)
    }

    fn read_json(path: &Path) -> Value {
        serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap()
    }

    const SAMPLE_PAYLOAD: &str = r#"{"model":{"display_name":"Opus 4.8"},"cwd":"/tmp/proj","context_window":{"remaining_percentage":72},"rate_limits":{"five_hour":{"used_percentage":34},"seven_day":{"used_percentage":62}},"cost":{"total_cost_usd":4.2}}"#;

    fn run_script(source: &str, payload: &str) -> String {
        let td = tempfile::tempdir().unwrap();
        let script = write_template_script(td.path(), "probe", source).unwrap();
        let out = std::process::Command::new("sh")
            .arg(&script)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .spawn()
            .and_then(|mut c| {
                use std::io::Write;
                c.stdin.take().unwrap().write_all(payload.as_bytes())?;
                c.wait_with_output()
            })
            .unwrap();
        String::from_utf8_lossy(&out.stdout).into_owned()
    }

    #[test]
    fn template_scripts_render_sensibly() {
        let cases: &[(&str, &[&str], bool, &str)] = &[
            ("minimal", &["folder", "model", "ctx", "five", "seven", "cost"], true, "default"),
            ("context", &["folder", "model", "ctx", "cost"], false, "claude"),
            ("meters", &["folder", "model", "ctx", "five", "seven", "cost"], true, "claude"),
        ];
        for (id, expected_ids, has_usage, model_color) in cases {
            let spec = preset_spec(id).unwrap();
            assert_eq!(
                spec.segments.iter().map(|segment| segment.id.as_str()).collect::<Vec<_>>(),
                *expected_ids
            );
            assert_eq!(spec.segments[0].color, "default");
            assert_eq!(spec.segments[1].color, *model_color);
            assert_eq!(spec.separator, "·");
            assert_eq!(spec.meter_style, "bar");
            assert_eq!(spec.meter_width, 7);
            assert!(!spec.icons);
            assert!(!spec.git_status);
            let source = build_custom_statusline(&spec).unwrap();
            let text = run_script(&source, SAMPLE_PAYLOAD);
            assert!(text.contains("proj"), "{id} shows the folder: {text:?}");
            assert!(text.contains("Opus 4.8"), "{id} shows the model: {text:?}");
            assert!(text.contains("72%"), "{id} shows context: {text:?}");
            assert!(!text.contains("📁"), "{id} has no icons: {text:?}");
            if *has_usage {
                assert!(text.contains("34%") && text.contains("62%"), "{id} shows usage: {text:?}");
            }
            assert!(text.contains("$4.20"), "{id} shows session cost: {text:?}");
            if *id == "meters" {
                assert_eq!(spec.segments.last().unwrap().color, "yellow");
                assert!(text.contains("\u{1b}[33m$4.20"), "meters show session cost in yellow: {text:?}");
            }
        }
    }

    fn cspec(ids: &[&str], sep: &str, style: &str) -> CustomSpec {
        CustomSpec {
            segments: ids.iter().map(|s| seg(s)).collect(),
            separator: sep.into(),
            meter_style: style.into(),
            meter_width: 7,
            icons: false,
            git_status: false,
        }
    }

    #[test]
    fn custom_script_renders_segments_in_order_with_separator() {
        let text = run_script(
            &build_custom_statusline(&cspec(&["model", "five", "folder"], "|", "bar")).unwrap(),
            SAMPLE_PAYLOAD,
        );
        let model = text.find("Opus 4.8").unwrap();
        let five = text.find("34%").unwrap();
        let folder = text.find("proj").unwrap();
        assert!(model < five && five < folder, "spec order preserved: {text:?}");
        assert!(text.contains('|'), "uses the chosen separator: {text:?}");
    }

    #[test]
    fn custom_percent_style_has_no_bar() {
        let text = run_script(
            &build_custom_statusline(&cspec(&["five", "seven"], "·", "percent")).unwrap(),
            SAMPLE_PAYLOAD,
        );
        assert!(text.contains("34%") && text.contains("62%"), "shows plain percentages: {text:?}");
        assert!(!text.contains('━'), "percent style draws no meter bar: {text:?}");
    }

    #[test]
    fn custom_branch_and_cost_degrade_when_absent() {
        // No cost and a cwd that is not a git repo -> both segments drop out.
        let payload = r#"{"cwd":"/tmp","model":{"display_name":"X"}}"#;
        let text = run_script(
            &build_custom_statusline(&cspec(&["folder", "branch", "cost"], "·", "bar")).unwrap(),
            payload,
        );
        assert!(!text.contains('$'), "cost absent: {text:?}");
        assert!(!text.contains('·'), "no dangling separators: {text:?}");
    }

    #[test]
    fn custom_cost_renders_when_present() {
        let text = run_script(
            &build_custom_statusline(&cspec(&["cost"], "·", "bar")).unwrap(),
            SAMPLE_PAYLOAD,
        );
        assert!(text.contains("$4.20"), "formats cost as $X.XX: {text:?}");
    }

    #[test]
    fn custom_value_labels_override_and_hide_defaults() {
        let mut spec = cspec(&["folder", "model", "ctx", "five", "seven", "cost"], "·", "percent");
        for (segment, label) in spec.segments.iter_mut().zip(["repo", "model", "context", "limit", "week", "spent"]) {
            segment.label = Some(label.into());
        }
        let text = run_script(&build_custom_statusline(&spec).unwrap(), SAMPLE_PAYLOAD);
        assert!(text.contains("repo proj"), "folder label prefixes its value: {text:?}");
        assert!(text.contains("model Opus 4.8"), "model label prefixes its value: {text:?}");
        assert!(text.contains("context ") && text.contains("72%"), "context label is replaced: {text:?}");
        assert!(text.contains("limit ") && text.contains("34%"), "5-hour label is replaced: {text:?}");
        assert!(text.contains("week ") && text.contains("62%"), "weekly label is replaced: {text:?}");
        assert!(text.contains("spent $4.20"), "cost label prefixes its value: {text:?}");

        let mut hidden = cspec(&["ctx", "five", "seven"], "·", "percent");
        for segment in &mut hidden.segments {
            segment.label = Some(String::new());
        }
        let text = run_script(&build_custom_statusline(&hidden).unwrap(), SAMPLE_PAYLOAD);
        assert!(!text.contains("ctx") && !text.contains("5h") && !text.contains("7d"), "empty overrides hide labels: {text:?}");
        assert!(text.contains("72%") && text.contains("34%") && text.contains("62%"), "values remain visible: {text:?}");
    }

    #[test]
    fn custom_text_segment_renders_verbatim_including_emoji() {
        let mut spec = cspec(&["folder"], "·", "bar");
        spec.segments.push(Segment { id: "text".into(), color: "default".into(), text: "🚀 dev".into(), label: None, icon: None });
        spec.segments.push(Segment { id: "text".into(), color: "default".into(), text: "★".into(), label: None, icon: None });
        let text = run_script(&build_custom_statusline(&spec).unwrap(), SAMPLE_PAYLOAD);
        assert!(text.contains("🚀 dev"), "emoji text verbatim: {text:?}");
        assert!(text.contains('★'), "second text segment present: {text:?}");
    }

    #[test]
    fn custom_color_wraps_segment_with_sgr() {
        let mut spec = cspec(&["folder"], "·", "bar");
        spec.segments[0].color = "red".into();
        let src = build_custom_statusline(&spec).unwrap();
        // The generated script carries the red SGR open (31) around the folder.
        assert!(src.contains("\\033[31m$cwd${RESET}"), "folder wrapped in red: {src}");
        let text = run_script(&src, SAMPLE_PAYLOAD);
        assert!(text.contains("\u{1b}[31m"), "rendered output has the red escape: {text:?}");
    }

    #[test]
    fn claude_color_emits_brand_orange_truecolor() {
        // Claude's orange isn't in the ANSI 16, so it ships as a truecolor escape.
        let mut spec = cspec(&["model"], "·", "bar");
        spec.segments[0].color = "claude".into();
        let src = build_custom_statusline(&spec).unwrap();
        assert!(src.contains("\\033[38;2;217;119;87m"), "script carries claude truecolor: {src}");
        let text = run_script(&src, SAMPLE_PAYLOAD);
        assert!(text.contains("\u{1b}[38;2;217;119;87m"), "rendered has the claude escape: {text:?}");
        assert!(text.contains("Opus 4.8"), "model still shown: {text:?}");
    }

    #[test]
    fn blue_color_matches_terminal_link_blue() {
        let mut spec = cspec(&["folder"], "·", "bar");
        spec.segments[0].color = "blue".into();
        let text = run_script(&build_custom_statusline(&spec).unwrap(), SAMPLE_PAYLOAD);
        assert!(text.contains("\u{1b}[94mproj"), "bright blue emitted: {text:?}");
    }

    #[test]
    fn custom_meter_width_is_respected() {
        let mut wide = cspec(&["five"], "·", "bar");
        wide.meter_width = 14;
        let mut narrow = cspec(&["five"], "·", "bar");
        narrow.meter_width = 3;
        let count = |t: &str| t.chars().filter(|&c| c == '━' || c == '╸').count();
        let wide_bar = count(&run_script(&build_custom_statusline(&wide).unwrap(), SAMPLE_PAYLOAD));
        let narrow_bar = count(&run_script(&build_custom_statusline(&narrow).unwrap(), SAMPLE_PAYLOAD));
        assert!(wide_bar > narrow_bar, "wider meter draws more cells: {wide_bar} vs {narrow_bar}");
    }

    #[test]
    fn usage_meter_color_tracks_percentage() {
        let source = build_custom_statusline(&cspec(&["five"], "·", "bar")).unwrap();
        for (percentage, color) in [(49, "32"), (50, "33"), (79, "33"), (80, "31")] {
            let payload = format!(
                r#"{{"rate_limits":{{"five_hour":{{"used_percentage":{percentage}}}}}}}"#
            );
            let text = run_script(&source, &payload);
            assert!(
                text.contains(&format!("\u{1b}[{color}m")),
                "{percentage}% uses ANSI color {color}: {text:?}"
            );
        }
    }

    #[test]
    fn blocks_meter_renders_block_glyphs() {
        let text = run_script(
            &build_custom_statusline(&cspec(&["five"], "·", "blocks")).unwrap(),
            SAMPLE_PAYLOAD,
        );
        assert!(text.contains('▇') || text.contains('▁'), "block glyphs present: {text:?}");
        assert!(text.contains("34%"), "still shows the percentage: {text:?}");
        assert!(!text.contains('━'), "blocks style draws no heavy-line bar: {text:?}");
    }

    #[test]
    fn added_meter_styles_render_their_glyphs() {
        // Sample payload: five_hour 34% at width 7 -> 2 full cells, partial cell
        // for the fractional styles, and a visible track.
        for (style, fill, track) in [
            ("segments", '▰', '▱'),
            ("squares", '■', '□'),
            ("shade", '▓', '░'),
            ("braille", '⣿', '⣀'),
        ] {
            let text = run_script(
                &build_custom_statusline(&cspec(&["five"], "·", style)).unwrap(),
                SAMPLE_PAYLOAD,
            );
            assert!(text.contains(fill), "{style} fill glyph present: {text:?}");
            assert!(text.contains(track), "{style} track glyph present: {text:?}");
            assert!(text.contains("34%"), "{style} keeps the percentage: {text:?}");
            assert!(!text.contains('━'), "{style} draws no heavy-line bar: {text:?}");
        }
    }

    #[test]
    fn shade_and_braille_meters_render_partial_cells() {
        // 34% of 7 leaves rem=38: shade shows its ▒ half-cell, braille its ⡆ step.
        let shade = run_script(
            &build_custom_statusline(&cspec(&["five"], "·", "shade")).unwrap(),
            SAMPLE_PAYLOAD,
        );
        assert!(shade.contains('▒'), "shade partial cell present: {shade:?}");
        let braille = run_script(
            &build_custom_statusline(&cspec(&["five"], "·", "braille")).unwrap(),
            SAMPLE_PAYLOAD,
        );
        assert!(braille.contains('⡆'), "braille partial cell present: {braille:?}");
    }

    #[test]
    fn dots_meter_renders_dot_glyphs() {
        let text = run_script(
            &build_custom_statusline(&cspec(&["five"], "·", "dots")).unwrap(),
            SAMPLE_PAYLOAD,
        );
        assert!(text.contains('●'), "filled dots present: {text:?}");
        assert!(text.contains('○'), "empty dots present: {text:?}");
        assert!(text.contains("34%"), "still shows the percentage: {text:?}");
    }

    #[test]
    fn icons_prefix_segments_when_enabled() {
        let mut spec = cspec(&["folder", "model", "five"], "·", "blocks");
        spec.icons = true;
        let text = run_script(&build_custom_statusline(&spec).unwrap(), SAMPLE_PAYLOAD);
        assert!(text.contains("📁"), "folder icon: {text:?}");
        assert!(text.contains("✳"), "model icon: {text:?}");
        assert!(text.contains("⚡"), "5h icon: {text:?}");
        // Off by default, no glyphs leak in.
        let plain = run_script(
            &build_custom_statusline(&cspec(&["folder", "model"], "·", "bar")).unwrap(),
            SAMPLE_PAYLOAD,
        );
        assert!(!plain.contains("📁"), "no icon when disabled: {plain:?}");
    }

    #[test]
    fn icons_use_their_own_segment_color() {
        let mut spec = cspec(&["folder", "model", "ctx", "five"], "·", "blocks");
        spec.icons = true;
        spec.segments[0].color = "blue".into();
        spec.segments[1].color = "claude".into();
        spec.segments[2].color = "magenta".into();
        let text = run_script(&build_custom_statusline(&spec).unwrap(), SAMPLE_PAYLOAD);
        assert!(text.contains("\u{1b}[38;2;217;119;87m✳ Opus 4.8"), "model icon uses model color: {text:?}");
        assert!(text.contains("\u{1b}[0m\u{1b}[2m⚡ 5h"), "5h icon resets before its own default style: {text:?}");
        assert!(!text.contains("\u{1b}[94m✳"), "model icon does not inherit folder blue: {text:?}");
        assert!(!text.contains("\u{1b}[35m⚡"), "5h icon does not inherit context magenta: {text:?}");
    }

    #[test]
    fn custom_icons_override_hide_and_respect_global_toggle() {
        let mut spec = cspec(&["folder", "text"], "·", "bar");
        spec.icons = true;
        spec.segments[0].icon = Some("⌂".into());
        spec.segments[1].text = "deploy".into();
        spec.segments[1].icon = Some("🚀".into());
        let text = run_script(&build_custom_statusline(&spec).unwrap(), SAMPLE_PAYLOAD);
        assert!(text.contains("⌂ proj"), "folder override rendered: {text:?}");
        assert!(text.contains("🚀 deploy"), "text icon rendered: {text:?}");
        assert!(!text.contains("📁"), "default icon replaced: {text:?}");

        spec.segments[0].icon = Some(String::new());
        let hidden = run_script(&build_custom_statusline(&spec).unwrap(), SAMPLE_PAYLOAD);
        assert!(!hidden.contains('⌂') && !hidden.contains("📁"), "empty override hides icon: {hidden:?}");

        spec.icons = false;
        let disabled = run_script(&build_custom_statusline(&spec).unwrap(), SAMPLE_PAYLOAD);
        assert!(!disabled.contains("🚀"), "global toggle suppresses overrides: {disabled:?}");
    }

    #[test]
    fn vibrant_preset_matches_modern_variant() {
        let spec = preset_spec("vibrant").unwrap();
        assert_eq!(
            spec.segments.iter().map(|segment| segment.id.as_str()).collect::<Vec<_>>(),
            ["folder", "model", "ctx", "five", "seven", "cost"]
        );
        assert_eq!(
            spec.segments.iter().map(|segment| segment.color.as_str()).collect::<Vec<_>>(),
            ["blue", "claude", "default", "default", "default", "yellow"]
        );
        assert_eq!(spec.separator, "·");
        assert_eq!(spec.meter_style, "bar");
        assert_eq!(spec.meter_width, 7);
        assert!(spec.icons);
        assert!(!spec.git_status);
        let text = run_script(&build_custom_statusline(&spec).unwrap(), SAMPLE_PAYLOAD);
        assert!(text.contains("📁") && text.contains("✳") && text.contains("🧠"), "glyphs: {text:?}");
        assert!(text.contains("⚡") && text.contains("📆") && text.contains("💰"), "usage glyphs: {text:?}");
        assert!(text.contains("Opus 4.8"), "model shown: {text:?}");
        assert!(
            text.contains("\u{1b}[94m"),
            "folder carries the blue accent: {text:?}"
        );
        assert!(
            text.contains("\u{1b}[38;2;217;119;87m"),
            "model carries the Claude accent: {text:?}"
        );
        assert!(text.contains('━') || text.contains('╸'), "bar meter: {text:?}");
        assert!(text.contains("34%") && text.contains("62%"), "both 5h and weekly render: {text:?}");
        assert!(text.contains("\u{1b}[33m💰 $4.20"), "cost has its yellow accent: {text:?}");
        assert!(!text.contains("🌿"), "modern has no branch: {text:?}");
    }

    fn make_dirty_repo() -> tempfile::TempDir {
        let td = tempfile::tempdir().unwrap();
        let p = td.path().to_str().unwrap().to_string();
        let git = |args: &[&str]| {
            std::process::Command::new("git")
                .args(["-C", &p])
                .args(args)
                .output()
                .unwrap();
        };
        git(&["init", "-q", "."]);
        git(&["symbolic-ref", "HEAD", "refs/heads/main"]);
        git(&["config", "user.email", "t@t"]);
        git(&["config", "user.name", "t"]);
        git(&["config", "commit.gpgsign", "false"]);
        std::fs::write(td.path().join("README.md"), "demo\n").unwrap();
        git(&["add", "README.md"]);
        git(&["commit", "-q", "-m", "init"]);
        std::fs::write(td.path().join("README.md"), "demo\nwip\n").unwrap();
        td
    }

    #[test]
    fn git_status_marks_a_dirty_branch() {
        let repo = make_dirty_repo();
        let payload = serde_json::json!({
            "cwd": repo.path().to_str().unwrap(),
            "model": { "display_name": "X" }
        })
        .to_string();
        // Branch + git status is a builder capability (icons on to check the glyph).
        let mut spec = cspec(&["folder", "branch"], "·", "bar");
        spec.icons = true;
        spec.git_status = true;
        let text = run_script(&build_custom_statusline(&spec).unwrap(), &payload);
        assert!(text.contains("main"), "branch name shown: {text:?}");
        assert!(text.contains('✳'), "dirty marker shown: {text:?}");
        assert!(text.contains("🌿"), "branch icon shown: {text:?}");

        // A clean checkout drops the marker.
        std::process::Command::new("git")
            .args(["-C", repo.path().to_str().unwrap(), "checkout", "--", "README.md"])
            .output()
            .unwrap();
        let clean = run_script(&build_custom_statusline(&spec).unwrap(), &payload);
        assert!(clean.contains("main"), "branch still shown: {clean:?}");
        assert!(!clean.contains('✳'), "clean tree has no marker: {clean:?}");
    }

    #[test]
    fn custom_spec_accepts_legacy_string_form() {
        // Old custom.json stored segments as a plain array of ids.
        let legacy = r#"{"segments":["folder","model"],"separator":"·","meterStyle":"bar"}"#;
        let spec: CustomSpec = serde_json::from_str(legacy).unwrap();
        assert_eq!(spec.segments.len(), 2);
        assert_eq!(spec.segments[0].id, "folder");
        assert_eq!(spec.segments[0].color, "default");
        assert_eq!(spec.segments[0].label, None);
        assert_eq!(spec.segments[0].icon, None);
        assert_eq!(spec.meter_width, 7, "missing width defaults to 7");
        // And it builds a runnable script.
        assert!(build_custom_statusline(&spec).is_ok());
    }

    #[test]
    fn custom_spec_validation_rejects_bad_specs() {
        let base = default_custom_spec();
        let empty = CustomSpec { segments: vec![], ..base.clone() };
        assert!(build_custom_statusline(&empty).is_err(), "empty rejected");
        let unknown = CustomSpec { segments: vec![seg("bogus")], ..base.clone() };
        assert!(build_custom_statusline(&unknown).is_err(), "unknown segment rejected");
        let dup = CustomSpec { segments: vec![seg("folder"), seg("folder")], ..base.clone() };
        assert!(build_custom_statusline(&dup).is_err(), "duplicate rejected");
        let badcolor = CustomSpec {
            segments: vec![Segment { id: "folder".into(), color: "chartreuse".into(), text: String::new(), label: None, icon: None }],
            ..base.clone()
        };
        assert!(build_custom_statusline(&badcolor).is_err(), "unknown color rejected");
        let emptytext = CustomSpec {
            segments: vec![Segment { id: "text".into(), color: "default".into(), text: "  ".into(), label: None, icon: None }],
            ..base.clone()
        };
        assert!(build_custom_statusline(&emptytext).is_err(), "empty text rejected");
        let unsafetext = CustomSpec {
            segments: vec![Segment { id: "text".into(), color: "default".into(), text: "a$b".into(), label: None, icon: None }],
            ..base.clone()
        };
        assert!(build_custom_statusline(&unsafetext).is_err(), "unsafe text char rejected");
        let unsafelabel = CustomSpec {
            segments: vec![Segment { label: Some("cost $".into()), ..seg("ctx") }],
            ..base.clone()
        };
        assert!(build_custom_statusline(&unsafelabel).is_err(), "unsafe label rejected");
        let unsafeicon = CustomSpec {
            segments: vec![Segment { icon: Some("$HOME".into()), ..seg("folder") }],
            ..base.clone()
        };
        assert!(build_custom_statusline(&unsafeicon).is_err(), "unsafe icon rejected");
        let longicon = CustomSpec {
            segments: vec![Segment { icon: Some("12345678901234567".into()), ..seg("folder") }],
            ..base.clone()
        };
        assert!(build_custom_statusline(&longicon).is_err(), "over-long icon rejected");
        let badsep = CustomSpec { separator: "".into(), ..base.clone() };
        assert!(build_custom_statusline(&badsep).is_err(), "empty separator rejected");
        let longsep = CustomSpec { separator: "abcd".into(), ..base.clone() };
        assert!(build_custom_statusline(&longsep).is_err(), "over-long separator rejected");
        let badstyle = CustomSpec { meter_style: "wild".into(), ..base };
        assert!(build_custom_statusline(&badstyle).is_err(), "unknown meter style rejected");
    }

    #[test]
    fn custom_allows_multiple_text_segments() {
        let mut spec = cspec(&["folder"], "·", "bar");
        spec.segments.push(Segment { id: "text".into(), color: "default".into(), text: "a".into(), label: None, icon: None });
        spec.segments.push(Segment { id: "text".into(), color: "default".into(), text: "b".into(), label: None, icon: None });
        assert!(build_custom_statusline(&spec).is_ok(), "duplicate text ids are allowed");
    }

    #[test]
    fn custom_spec_persists_and_round_trips_through_state() {
        let (_td, settings, sldir) = slt_dirs();
        std::fs::write(&settings, "{}").unwrap();
        let mut spec = cspec(&["folder", "model", "seven"], "›", "percent");
        spec.segments[0].color = "blue".into();
        spec.segments[1].color = "cyan".into();
        spec.segments[1].icon = Some("🤖".into());
        spec.segments[2].label = Some("week".into());
        spec.meter_width = 10;
        apply_custom_at(&settings, &sldir, &spec).unwrap();

        let state = claude_statusline_state_at(&settings, &sldir);
        assert_eq!(state.selected, "custom");
        assert_eq!(state.custom, spec, "state echoes the saved spec");
        assert!(sldir.join("custom.json").exists());
    }

    #[test]
    fn custom_defaults_to_full_emoji_bar_with_neutral_folder() {
        let spec = default_custom_spec();
        assert_eq!(
            spec.segments.iter().map(|segment| segment.id.as_str()).collect::<Vec<_>>(),
            ["folder", "model", "ctx", "five", "seven", "cost"]
        );
        assert_eq!(spec.segments[0].color, "default");
        assert_eq!(spec.segments[1].color, "claude");
        assert_eq!(spec.segments.last().unwrap().color, "yellow");
        assert_eq!(spec.separator, "·");
        assert_eq!(spec.meter_style, "bar");
        assert_eq!(spec.meter_width, 7);
        assert!(spec.icons);
        assert!(!spec.git_status);
    }

    #[test]
    fn switching_custom_preset_custom_keeps_spec_and_wrapper() {
        let (_td, settings, sldir) = slt_dirs();
        // Forwarder enabled over a user line.
        std::fs::write(&settings, r#"{"statusLine":{"type":"command","command":"my-line.sh"}}"#).unwrap();
        install_claude_statusline_at(&settings).unwrap();

        let spec = cspec(&["folder", "cost"], "/", "bar");
        apply_custom_at(&settings, &sldir, &spec).unwrap();
        apply_claude_statusline_at(&settings, &sldir, "minimal").unwrap();
        // Preset apply must not touch the saved custom spec.
        assert_eq!(read_custom_spec(&sldir), spec, "custom spec survives a preset");

        // Re-select Custom via the generic dispatcher -> restores the saved spec.
        apply_claude_statusline_at(&settings, &sldir, "custom").unwrap();
        let v = read_json(&settings);
        let cmd = v["statusLine"]["command"].as_str().unwrap();
        assert!(cmd.contains("agent_limits"), "forwarder preserved: {cmd}");
        assert!(cmd.contains("lpm-custom.sh"), "custom chained underneath: {cmd}");
        let embedded = unwrap_statusline(cmd).unwrap();
        assert_eq!(detect_template_id(&embedded, &sldir).as_deref(), Some("custom"));
    }

    #[test]
    fn preview_current_renders_prior_line_and_empty_when_none() {
        let (_td, settings, sldir) = slt_dirs();
        std::fs::write(&settings, "{}").unwrap();
        // No prior line -> empty preview.
        let empty = preview_claude_statusline_at(&json!({"kind":"current"}), &sldir, &settings).unwrap();
        assert!(empty.is_empty(), "no prior line -> empty: {empty:?}");
        // Snapshot a user's own command; "current" previews it.
        std::fs::create_dir_all(&sldir).unwrap();
        std::fs::write(
            sldir.join("original.json"),
            r#"{"type":"command","command":"printf 'hi %s' \"$(cat | jq -r .model.display_name)\""}"#,
        )
        .unwrap();
        let out = preview_claude_statusline_at(&json!({"kind":"current"}), &sldir, &settings).unwrap();
        assert!(out.contains("Opus 4.8"), "previews the user's own line: {out:?}");
    }

    #[test]
    fn preview_meters_returns_ansi() {
        let (_td, settings, sldir) = slt_dirs();
        let out = preview_claude_statusline_at(
            &json!({"kind":"template","id":"meters"}),
            &sldir,
            &settings,
        )
        .unwrap();
        assert!(out.contains("Opus 4.8") && out.contains("34%"), "renders fields: {out:?}");
        assert!(out.contains('\u{1b}'), "includes ANSI escapes: {out:?}");
    }

    #[test]
    fn preview_unknown_kind_errors() {
        let (_td, settings, sldir) = slt_dirs();
        assert!(preview_claude_statusline_at(&json!({"kind":"bogus"}), &sldir, &settings).is_err());
    }

    #[test]
    fn finalize_ai_saves_validates_and_applies() {
        let (_td, settings, sldir) = slt_dirs();
        std::fs::write(&settings, "{}").unwrap();
        let good = "#!/bin/sh\ni=$(cat); printf 'model %s' \"$(printf '%s' \"$i\" | jq -r .model.display_name)\"\n";
        let sel = json!({"kind":"current"});
        let script = finalize_ai_statusline_at(good, "show the model", &sel, &settings, &sldir).unwrap();
        assert!(script.contains("jq -r .model.display_name"));
        assert!(sldir.join("lpm-ai.sh").exists() && sldir.join("ai.json").exists());
        // ai.json records both the description and the base selection.
        let meta: Value = serde_json::from_slice(&std::fs::read(sldir.join("ai.json")).unwrap()).unwrap();
        assert_eq!(meta["description"], "show the model");
        assert_eq!(meta["baseSelection"]["kind"], "current");
        let state = claude_statusline_state_at(&settings, &sldir);
        assert_eq!(state.selected, "ai");
        assert_eq!(state.ai_description, "show the model");
        // A script that prints nothing is rejected with a useful error.
        let bad = "#!/bin/sh\ncat >/dev/null\n";
        assert!(finalize_ai_statusline_at(bad, "x", &sel, &settings, &sldir).is_err());
    }

    #[test]
    fn ai_base_from_template_and_referenced_file_and_none() {
        let (_td, settings, sldir) = slt_dirs();
        std::fs::write(&settings, "{}").unwrap();

        // Base from a template spec: the generated script body.
        let base = ai_base_for_selection_at(&json!({"kind":"template","id":"meters"}), &sldir, &settings);
        let base = base.expect("template has a base");
        assert!(base.contains("5h") && base.contains("meter"), "template base is the script: {base:?}");

        // Base from a "current" line that is just `sh '<file>'`: the file's content.
        std::fs::create_dir_all(&sldir).unwrap();
        let userscript = sldir.join("mine.sh");
        std::fs::write(&userscript, "#!/bin/sh\necho MINE\n").unwrap();
        std::fs::write(
            sldir.join("original.json"),
            format!(r#"{{"type":"command","command":"sh '{}'"}}"#, userscript.display()),
        )
        .unwrap();
        let base = ai_base_for_selection_at(&json!({"kind":"current"}), &sldir, &settings);
        assert_eq!(base.as_deref(), Some("#!/bin/sh\necho MINE\n"), "reads the referenced file");

        // No base: "current" with nothing configured (fresh dir).
        let (_td2, settings2, sldir2) = slt_dirs();
        std::fs::write(&settings2, "{}").unwrap();
        assert!(
            ai_base_for_selection_at(&json!({"kind":"current"}), &sldir2, &settings2).is_none(),
            "no prior line -> generate from scratch"
        );
    }

    #[test]
    fn ai_prompt_includes_base_only_when_present() {
        let with = ai_statusline_prompt("make it red", Some("#!/bin/sh\necho x"));
        assert!(with.contains("current status line script") && with.contains("echo x"));
        let without = ai_statusline_prompt("from scratch", None);
        assert!(!without.contains("current status line script"));
        assert!(without.contains("from scratch"));
    }

    #[test]
    fn strip_code_fences_unwraps_markdown() {
        let raw = "```sh\n#!/bin/sh\necho hi\n```";
        assert_eq!(strip_code_fences(raw), "#!/bin/sh\necho hi");
        assert_eq!(strip_code_fences("plain\nline"), "plain\nline");
    }

    #[test]
    fn apply_template_without_wrapper_writes_template_object() {
        let (_td, settings, sldir) = slt_dirs();
        std::fs::write(&settings, r#"{"model":"opus"}"#).unwrap();
        apply_claude_statusline_at(&settings, &sldir, "minimal").unwrap();

        let v = read_json(&settings);
        assert_eq!(v["model"], "opus", "siblings preserved");
        let cmd = v["statusLine"]["command"].as_str().unwrap();
        assert!(cmd.contains("lpm-minimal.sh"), "points at the template script: {cmd}");
        assert!(!cmd.contains("agent_limits"), "no forwarder when limits are off");
        assert!(sldir.join("lpm-minimal.sh").exists(), "script written");
    }

    #[test]
    fn apply_template_with_wrapper_preserves_forwarder_and_chains_template() {
        let (_td, settings, sldir) = slt_dirs();
        // Start with the usage-limit forwarder installed over a user line.
        std::fs::write(&settings, r#"{"statusLine":{"type":"command","command":"my-line.sh"}}"#).unwrap();
        install_claude_statusline_at(&settings).unwrap();

        apply_claude_statusline_at(&settings, &sldir, "meters").unwrap();
        let v = read_json(&settings);
        let cmd = v["statusLine"]["command"].as_str().unwrap();
        assert!(cmd.contains("agent_limits"), "forwarder stays chained: {cmd}");
        assert!(cmd.contains("lpm-meters.sh"), "template chained underneath: {cmd}");
        // The embedded original is the template, not the forwarder itself.
        let embedded = unwrap_statusline(cmd).unwrap();
        assert!(detect_template_id(&embedded, &sldir).as_deref() == Some("meters"));
    }

    #[test]
    fn switching_templates_does_not_nest() {
        let (_td, settings, sldir) = slt_dirs();
        std::fs::write(&settings, r#"{"statusLine":{"type":"command","command":"my-line.sh"}}"#).unwrap();
        install_claude_statusline_at(&settings).unwrap();

        apply_claude_statusline_at(&settings, &sldir, "minimal").unwrap();
        apply_claude_statusline_at(&settings, &sldir, "context").unwrap();
        let v = read_json(&settings);
        let cmd = v["statusLine"]["command"].as_str().unwrap();
        assert!(!cmd.contains("lpm-minimal.sh"), "old template gone, no nesting: {cmd}");
        assert!(cmd.contains("lpm-context.sh"), "new template present: {cmd}");
        assert!(cmd.contains("agent_limits"), "forwarder still on top");
        // Exactly one status-line marker -> the wrapper is not doubly nested.
        assert_eq!(cmd.matches(STATUSLINE_MARKER).count(), 1, "single wrapper: {cmd}");
    }

    #[test]
    fn restore_returns_exact_snapshot_and_snapshots_once() {
        let (_td, settings, sldir) = slt_dirs();
        std::fs::write(
            &settings,
            r#"{"statusLine":{"type":"command","command":"my-line.sh","padding":2}}"#,
        )
        .unwrap();

        apply_claude_statusline_at(&settings, &sldir, "minimal").unwrap();
        let snap_after_first = std::fs::read(sldir.join("original.json")).unwrap();
        // Switching to another template must NOT re-snapshot our own template.
        apply_claude_statusline_at(&settings, &sldir, "context").unwrap();
        assert_eq!(
            std::fs::read(sldir.join("original.json")).unwrap(),
            snap_after_first,
            "snapshot taken only once"
        );

        apply_claude_statusline_at(&settings, &sldir, "current").unwrap();
        let v = read_json(&settings);
        assert_eq!(v["statusLine"]["command"], "my-line.sh", "restores the exact original");
        assert_eq!(v["statusLine"]["padding"], 2);
    }

    #[test]
    fn restore_null_snapshot_removes_line_but_keeps_forwarder() {
        let (_td, settings, sldir) = slt_dirs();
        // No prior status line, but usage-limit forwarder is enabled.
        std::fs::write(&settings, "{}").unwrap();
        install_claude_statusline_at(&settings).unwrap();

        apply_claude_statusline_at(&settings, &sldir, "meters").unwrap();
        apply_claude_statusline_at(&settings, &sldir, "current").unwrap();
        let v = read_json(&settings);
        let cmd = v["statusLine"]["command"].as_str().unwrap();
        assert!(cmd.contains("agent_limits"), "forwarder kept: {cmd}");
        let embedded = unwrap_statusline(cmd).unwrap();
        assert!(embedded.is_null(), "underlying line cleared back to none: {embedded}");
    }

    #[test]
    fn state_reports_selected_template_and_custom() {
        let (_td, settings, sldir) = slt_dirs();
        std::fs::write(&settings, r#"{"statusLine":{"type":"command","command":"my-line.sh"}}"#).unwrap();

        let s0 = claude_statusline_state_at(&settings, &sldir);
        assert_eq!(s0.selected, "current");
        assert!(s0.has_custom, "a live non-lpm line counts as custom");

        apply_claude_statusline_at(&settings, &sldir, "context").unwrap();
        let s1 = claude_statusline_state_at(&settings, &sldir);
        assert_eq!(s1.selected, "context");
        assert!(s1.has_custom, "snapshot exists -> My status line has something to restore");
    }

    #[test]
    fn startup_refresh_rewrites_only_the_active_builtin_script() {
        let (_td, settings, sldir) = slt_dirs();
        std::fs::write(&settings, r#"{"statusLine":{"type":"command","command":"my-line.sh"}}"#).unwrap();
        install_claude_statusline_at(&settings).unwrap();
        apply_claude_statusline_at(&settings, &sldir, "meters").unwrap();
        let meters_path = sldir.join("lpm-meters.sh");
        std::fs::write(&meters_path, "#!/bin/sh\necho legacy\n").unwrap();
        let settings_before = std::fs::read(&settings).unwrap();

        refresh_active_template_at(&settings, &sldir).unwrap();

        let expected = build_custom_statusline(&preset_spec("meters").unwrap()).unwrap();
        assert_eq!(std::fs::read_to_string(&meters_path).unwrap(), expected);
        assert_eq!(std::fs::read(&settings).unwrap(), settings_before);

        let mut custom = default_custom_spec();
        custom.segments[0].color = "blue".into();
        apply_custom_at(&settings, &sldir, &custom).unwrap();
        let custom_script = std::fs::read(sldir.join("lpm-custom.sh")).unwrap();
        let custom_spec = std::fs::read(sldir.join("custom.json")).unwrap();

        refresh_active_template_at(&settings, &sldir).unwrap();

        assert_eq!(std::fs::read(sldir.join("lpm-custom.sh")).unwrap(), custom_script);
        assert_eq!(std::fs::read(sldir.join("custom.json")).unwrap(), custom_spec);
    }

    #[test]
    fn state_no_line_no_snapshot_is_not_custom() {
        let (_td, settings, sldir) = slt_dirs();
        std::fs::write(&settings, "{}").unwrap();
        let s = claude_statusline_state_at(&settings, &sldir);
        assert_eq!(s.selected, "current");
        assert!(!s.has_custom, "nothing configured -> nothing to restore");
    }
}
