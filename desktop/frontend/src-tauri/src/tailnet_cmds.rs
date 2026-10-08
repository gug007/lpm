// Settings → Mobile devices → Built-in Tailscale: the saved switch and the
// commands the pane calls. The node itself is run by tailnet.rs.
use crate::tailnet::{lock, send, spawn_node, state_value_of, stop_node, State, STATE_RUNNING};
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::{Duration, Instant};

const SIGN_IN_WAIT: Duration = Duration::from_secs(20);
const SIGN_OUT_WAIT: Duration = Duration::from_secs(20);
const SIGN_OUT_SETTLE: Duration = Duration::from_secs(3);
const STATE_NEEDS_LOGIN: &str = "needsLogin";
const STATE_NEEDS_APPROVAL: &str = "needsApproval";

#[derive(Default, Deserialize, serde::Serialize)]
struct Config {
    #[serde(default)]
    enabled: bool,
}

fn config_path() -> PathBuf {
    crate::config::lpm_dir().join("tailnet.json")
}

fn load_config() -> Config {
    std::fs::read(config_path())
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

fn save_config(cfg: &Config) -> Result<(), String> {
    let path = config_path();
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let bytes = serde_json::to_vec_pretty(cfg).map_err(|e| e.to_string())?;
    crate::fsatomic::write(&path, &bytes, crate::fsatomic::Mode::Preserve(0o644))
        .map_err(|e| format!("Couldn't save the setting: {e}"))
}

pub(crate) fn load_enabled() -> bool {
    load_config().enabled
}

const TIMED_OUT: &str =
    "Tailscale didn't answer in time — check your internet connection and try again.";

/// Wait until `done` holds, the node fails, or `wait` runs out.
fn wait_until(wait: Duration, done: impl Fn(&State) -> bool) -> Result<(), String> {
    let deadline = Instant::now() + wait;
    let mut st = lock();
    loop {
        if done(&st) {
            return Ok(());
        }
        if st.stdin.is_none() {
            return Err(st
                .failure
                .clone()
                .unwrap_or_else(|| "Built-in Tailscale isn't running.".into()));
        }
        let left = deadline.saturating_duration_since(Instant::now());
        if left.is_zero() {
            return Err(TIMED_OUT.into());
        }
        st = crate::tailnet::wait_changed(st, left);
    }
}

/// Send `cmd` and wait for the node to finish it.
fn run_command(cmd: &str, wait: Duration) -> Result<(), String> {
    let id = {
        let mut st = lock();
        st.next_id += 1;
        let id = st.next_id;
        send(&mut st, json!({ "cmd": cmd, "id": id }))?;
        id
    };
    wait_until(wait, |st| st.done.contains_key(&id))?;
    match lock().done.remove(&id) {
        Some(error) if !error.is_empty() => Err(error),
        _ => Ok(()),
    }
}

fn has_answer(st: &State) -> bool {
    let s = &st.status;
    !s.auth_url.is_empty()
        || s.state == STATE_RUNNING
        || s.state == STATE_NEEDS_APPROVAL
        || s.state == "stopped"
        || s.state == "error"
}

fn set_enabled(enabled: bool) -> Result<(), String> {
    save_config(&Config { enabled })?;
    let mut st = lock();
    st.enabled = enabled;
    if !enabled {
        stop_node(&mut st);
    } else if st.stdin.is_none() || st.status.state == "error" {
        // A node stuck in an error state is started over: that is what the
        // pane's Try again asks for.
        if st.stdin.is_some() {
            stop_node(&mut st);
        }
        st.respawns = 0;
        spawn_node(&mut st);
    }
    Ok(())
}

fn state_value() -> Value {
    state_value_of(&lock())
}

// --- frontend commands (Settings → Mobile → Away from home) -----------------

#[tauri::command(async)]
pub fn tailnet_state() -> Value {
    state_value()
}

#[tauri::command(async)]
pub fn tailnet_set_enabled(enabled: bool) -> Result<Value, String> {
    set_enabled(enabled)?;
    Ok(state_value())
}

/// Turn the node on if needed and return its state with a sign-in URL in
/// `authUrl` for the pane to open, unless it is already signed in. A node that
/// needs signing in asks for the URL itself as it starts, so a fresh one is only
/// waited for; one that was signed out is asked for a new URL.
#[tauri::command(async)]
pub fn tailnet_sign_in() -> Result<Value, String> {
    if !lock().enabled {
        set_enabled(true)?;
    }
    wait_until(SIGN_IN_WAIT, |st| {
        has_answer(st) || st.status.state == STATE_NEEDS_LOGIN
    })?;
    if !has_answer(&lock()) {
        run_command("login", SIGN_IN_WAIT)?;
        wait_until(SIGN_IN_WAIT, has_answer)?;
    }
    Ok(state_value())
}

/// Sign this machine out of the tailnet, which also removes it from the
/// tailnet's device list. The switch stays on, ready for the next sign-in.
#[tauri::command(async)]
pub fn tailnet_sign_out() -> Result<Value, String> {
    run_command("logout", SIGN_OUT_WAIT)?;
    let _ = wait_until(SIGN_OUT_SETTLE, |st| st.status.state == STATE_NEEDS_LOGIN);
    Ok(state_value())
}
