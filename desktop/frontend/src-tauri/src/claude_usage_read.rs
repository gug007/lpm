// "Read it now" on a Usage card. Claude Code reports an account's plan usage
// only inside a reply, so a profile nobody has used for a day keeps showing the
// day-old reading, through resets and top-ups. This asks the account for the
// smallest reply there is (Haiku, no tools, no settings, nothing saved) and
// takes the plan windows its stream reports (`rate_limit_event`), as a fresh
// reading of that account.
use crate::agent_limits::{AgentLimitsStore, LimitWindow, ProviderLimits};
use serde_json::Value;
use std::collections::HashSet;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Manager};

const TIMEOUT: Duration = Duration::from_secs(90);

fn reading_now() -> &'static Mutex<HashSet<String>> {
    static IN_FLIGHT: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    IN_FLIGHT.get_or_init(Default::default)
}

/// Reads `account`'s plan usage now ("default" is the main login). Err says
/// why nothing was read, in words for the card.
#[tauri::command(async)]
pub fn claude_read_usage(app: AppHandle, account: String) -> Result<(), String> {
    if account != crate::claude_dirs::MAIN_LOGIN && crate::config::claude_config_dir_for_account(&account).is_none() {
        return Err("That account is no longer set up here.".into());
    }
    if !crate::claude_pool_members::ident_of(&account).signed_in {
        return Err("This account isn't signed in.".into());
    }
    if !reading_now().lock().unwrap().insert(account.clone()) {
        return Err("Already reading this account.".into());
    }
    let out = run_probe(&account);
    reading_now().lock().unwrap().remove(&account);
    let out = out?;
    let windows = match windows_from_stream(&out) {
        Some(windows) => windows,
        None => return Err(failure_of(&out).unwrap_or_else(|| {
            "Claude answered without plan usage. Logins billed by API key have no 5-hour or weekly limits.".into()
        })),
    };
    let store = app.state::<Arc<AgentLimitsStore>>();
    let limits = ProviderLimits {
        provider: "claude".into(),
        account_id: Some(account.clone()),
        no_five_hour: windows.0.is_none(),
        five_hour: windows.0,
        weekly: windows.1,
        updated_at: crate::agent_limits::now_millis(),
        ..Default::default()
    };
    crate::agent_limits::record_claude(&app, &store, &account, limits, crate::agent_limits::now_secs(), true);
    Ok(())
}

/// The probe's stdout, or why it failed.
fn run_probe(account: &str) -> Result<String, String> {
    let args: Vec<String> = [
        "-p", ".", "--model", "haiku", "--output-format", "stream-json", "--verbose", "--max-turns", "1",
        "--no-session-persistence", "--tools", "", "--strict-mcp-config", "--setting-sources", "",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    let mut cmd = crate::shellpath::cli_command("claude", &args);
    for (key, _) in std::env::vars_os() {
        let name = key.to_string_lossy();
        if name.starts_with("LPM_") || name.starts_with("CLAUDECODE") || name == "CLAUDE_CODE_ENTRYPOINT" {
            cmd.env_remove(&key);
        }
    }
    crate::config::claude_env_for_account(Some(account)).apply(&mut cmd);
    cmd.current_dir(std::env::temp_dir());
    let out = crate::statusfwd::run_with_timeout(cmd, TIMEOUT).ok_or("Claude didn't answer in time.")?;
    Ok(String::from_utf8_lossy(&out).into_owned())
}

/// The last `rate_limit_event`'s windows in a stream-json run, as
/// (5-hour, weekly); None when the run reported none.
fn windows_from_stream(stdout: &str) -> Option<(Option<LimitWindow>, Option<LimitWindow>)> {
    stdout
        .lines()
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
        .filter(|v| v.get("type").and_then(Value::as_str) == Some("rate_limit_event"))
        .filter_map(|v| windows_of(v.get("rate_limit_info")?))
        .last()
}

/// The run's own error, when it ended in one ("Not logged in", an API error).
fn failure_of(stdout: &str) -> Option<String> {
    let result = stdout
        .lines()
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
        .find(|v| v.get("type").and_then(Value::as_str) == Some("result"))?;
    if result.get("is_error").and_then(Value::as_bool) != Some(true) {
        return None;
    }
    let text = result.get("result").and_then(Value::as_str).unwrap_or("").trim();
    let text: String = text.chars().take(160).collect();
    Some(if text.is_empty() { "Claude couldn't answer.".into() } else { format!("Claude couldn't answer: {text}") })
}

fn windows_of(info: &Value) -> Option<(Option<LimitWindow>, Option<LimitWindow>)> {
    let window = |w: &Value| -> Option<LimitWindow> {
        let utilization = w.get("utilization").and_then(Value::as_f64)?;
        Some(LimitWindow {
            used_percent: (utilization * 100.0).clamp(0.0, 100.0),
            resets_at: w.get("resetsAt").and_then(Value::as_i64).unwrap_or(0),
            ..Default::default()
        })
    };
    let (five, weekly) = match info.get("unifiedWindows") {
        Some(windows) => (
            windows.get("five_hour").and_then(window),
            windows.get("seven_day").and_then(window),
        ),
        None => match info.get("rateLimitType").and_then(Value::as_str) {
            Some("five_hour") => (window(info), None),
            Some("seven_day") => (None, window(info)),
            _ => (None, None),
        },
    };
    (five.is_some() || weekly.is_some()).then_some((five, weekly))
}

#[cfg(test)]
#[path = "claude_usage_read_tests.rs"]
mod tests;
