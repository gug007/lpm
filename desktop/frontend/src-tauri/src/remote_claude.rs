// Phone-side Claude accounts: what the project menu's "Claude Account" submenu
// needs, and setting a project's choice from it.
//
// `claudeAccounts` sends what the desktop's own submenu reads: every account
// with its sign-in, plan and confirmation, the earlier account it shares a
// login with (`sameAs`), and where switching stands. `readUsage` asks an
// account for a fresh usage reading, as a Usage card's "Read it now" does; the
// reading itself arrives as `limits-changed`.
// `setClaudeAccount` writes the choice through the desktop's command, after
// recording any account the person just confirmed as theirs alone. Reading the
// pool opens every project file and each account's login, so both answer
// through the out-queue.
use crate::claude_account_pin::{set_claude_account_choice, AccountChoiceArg};
use crate::claude_pool::{claude_pool_state, set_claude_pool, PoolPatch};
use crate::config;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::mpsc::SyncSender;
use tauri::AppHandle;

/// In `features` when this Mac answers `readUsage`.
pub(crate) const READ_USAGE_FEATURE: &str = "readUsage";

pub fn handle(app: &AppHandle, out: &SyncSender<String>, t: &str, v: &Value) {
    let app = app.clone();
    let out = out.clone();
    let verb = t.to_string();
    let v = v.clone();
    std::thread::spawn(move || {
        let reply = match verb.as_str() {
            "claudeAccounts" => accounts_reply(),
            "readUsage" => read_reply(app, &v),
            _ => set_reply(app, &v),
        };
        let _ = out.try_send(reply.to_string());
    });
}

pub(crate) fn labels() -> HashMap<String, String> {
    config::load_claude_accounts()
        .get("accounts")
        .and_then(Value::as_array)
        .map(|list| {
            list.iter()
                .filter_map(|a| {
                    let id = a.get("id")?.as_str()?;
                    let label = a.get("label")?.as_str()?;
                    Some((id.to_string(), label.to_string()))
                })
                .collect()
        })
        .unwrap_or_default()
}

fn read_reply(app: AppHandle, v: &Value) -> Value {
    let account = v.get("account").and_then(Value::as_str).unwrap_or("default").to_string();
    match crate::claude_usage_read::claude_read_usage(app, account.clone()) {
        Ok(()) => json!({ "t": "readUsage", "ok": true, "account": account }),
        Err(error) => json!({ "t": "readUsage", "ok": false, "account": account, "error": error }),
    }
}

fn accounts_reply() -> Value {
    let state = claude_pool_state();
    let labels = labels();
    let same = crate::agent_limits_login::same_logins();
    let accounts: Vec<Value> = state
        .accounts
        .iter()
        .map(|a| {
            let mut o = serde_json::to_value(a).unwrap_or_else(|_| json!({ "id": a.id }));
            if let Some(label) = labels.get(&a.id) {
                o["label"] = json!(label);
            }
            if let Some(earlier) = same.get(&a.id) {
                o["sameAs"] = json!(earlier);
            }
            o
        })
        .collect();
    let pools: Vec<Value> = state
        .pools
        .iter()
        .map(|p| json!({ "project": p.project, "members": p.members, "current": p.current }))
        .collect();
    json!({
        "t": "claudeAccounts",
        "ok": true,
        "accounts": accounts,
        "switching": {
            "enabled": state.enabled,
            "active": state.active,
            "paused": state.paused,
            "allowed": state.allowed,
            "maxMembers": state.max_members,
            "pools": pools,
        },
    })
}

fn set_reply(app: AppHandle, v: &Value) -> Value {
    let project = v
        .get("project")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let confirm: Vec<String> = v
        .get("confirm")
        .and_then(Value::as_array)
        .map(|ids| {
            ids.iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    let r = serde_json::from_value::<AccountChoiceArg>(v.get("choice").cloned().unwrap_or_default())
        .map_err(|e| e.to_string())
        .and_then(|choice| {
            if !confirm.is_empty() {
                set_claude_pool(PoolPatch {
                    consent: Some(true),
                    confirm: Some(confirm),
                    ..Default::default()
                })?;
            }
            set_claude_account_choice(app, project.clone(), choice)
        });
    match r {
        Ok(()) => json!({ "t": "setClaudeAccount", "project": project, "ok": true }),
        Err(e) => json!({ "t": "setClaudeAccount", "project": project, "ok": false, "error": e }),
    }
}
