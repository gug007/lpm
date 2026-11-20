// `lpm generate`: an agent asks lpm for an image or a clip, lpm asks the person
// when Settings says so, makes it with the key saved here and writes the file.
// The key never reaches the agent; the agent gets the path back.
pub(crate) mod approval;
pub(crate) mod commands;
pub(crate) mod ledger;
pub(crate) mod models;
mod plan;
pub(crate) mod providers;

use serde_json::{json, Value};
use std::io::Write;
use std::path::Path;
use std::time::Instant;
use tauri::AppHandle;

use approval::{Decision, Request};
use models::{Kind, Provider};
use plan::{details, plan, settle_extension, shown, Ask, Plan};

pub(crate) const DEFAULT_LIMIT_DOLLARS: f64 = 2.0;

/// Settings › Images & speech, as `lpm generate` reads them.
pub(crate) struct Prefs {
    pub approval: String,
    pub limit_cents: Option<f64>,
    pub image_model: String,
    pub voice: String,
    pub keep_out_of_git: bool,
}

pub(crate) fn prefs(settings: &Value) -> Prefs {
    let text = |k: &str| settings[k].as_str().unwrap_or("").to_string();
    let approval = match text("generateApproval").as_str() {
        "each" => "each",
        "always" => "always",
        _ => "project",
    };
    let dollars = settings["generateDailyLimit"]
        .as_f64()
        .unwrap_or(DEFAULT_LIMIT_DOLLARS);
    Prefs {
        approval: approval.into(),
        limit_cents: (dollars > 0.0).then_some(dollars * 100.0),
        image_model: text("generateImageModel"),
        voice: text("generateVoice"),
        keep_out_of_git: settings["generateKeepOutOfGit"].as_bool() != Some(false),
    }
}

/// `agent_generate --request-hex=<JSON>`: `PROGRESS key` or `PROGRESS waiting`
/// while lpm asks, `PROGRESS working` while the file is made, then one JSON line.
pub fn cmd_agent_generate(
    args: &[String],
    app: &AppHandle,
    peer: Option<u32>,
    w: &mut impl Write,
) -> std::io::Result<()> {
    let reply = run(args, app, peer, w).unwrap_or_else(|e| json!({ "ok": false, "error": e }));
    writeln!(w, "{reply}")
}

fn run(
    args: &[String],
    app: &AppHandle,
    peer: Option<u32>,
    w: &mut impl Write,
) -> Result<Value, String> {
    let (_, options) = crate::socketsrv::parse_options(args);
    let ask: Ask = options
        .get("request")
        .and_then(|r| serde_json::from_str(r).ok())
        .ok_or("usage: agent_generate --request-hex=<JSON>")?;
    let prefs = prefs(&crate::config::load_settings());
    let mut plan = plan(&ask, &prefs)?;
    let provider = plan.model.provider;
    let who = crate::agentapprove::caller(app, peer, &ask.pane);
    let project = ask.project.trim().to_string();

    let missing_key = !crate::secrets::has(provider.secret());
    let today = ledger::usage(ledger::today_start(), ledger::today_start());
    let over = prefs
        .limit_cents
        .is_some_and(|limit| today.today_cents + plan.cents > limit);
    let allowed = ledger::is_allowed(&project);
    if must_ask(&prefs.approval, allowed, missing_key, over) {
        if crate::sys::headless() {
            return Err(unattended_error(missing_key, provider));
        }
        let req = Request {
            id: uuid::Uuid::new_v4().to_string(),
            kind: plan.kind.word(),
            agent: who.agent.clone(),
            project: project.clone(),
            prompt: plan.prompt.clone(),
            model: plan.model.label.into(),
            provider: provider.name(),
            details: details(&plan),
            cost: models::cost_words(plan.cents),
            out: shown(&plan.out, &plan.root),
            needs_key: missing_key.then_some(provider.key_id()),
            key_label: provider.key_label(),
            project_grant: prefs.approval == "project" && !project.is_empty(),
            over_limit: over,
            today: today_words(
                today.images,
                today.clips,
                today.today_cents,
                prefs.limit_cents,
            ),
        };
        let _ = writeln!(
            w,
            "PROGRESS {}",
            if missing_key { "key" } else { "waiting" }
        );
        let _ = w.flush();
        let answer = approval::ask(app, req, provider)?;
        match answer.decision {
            Decision::Deny if missing_key => {
                return Err(format!(
                    "no {} key was added in lpm, so nothing was made",
                    provider.key_label()
                ))
            }
            Decision::Deny => return Err("it was denied in lpm, so nothing was made".into()),
            Decision::Project => ledger::allow(&project),
            Decision::Once => {}
        }
        if let Some(prompt) = answer.prompt {
            plan.prompt = prompt;
        }
    }
    let key = crate::secrets::get(provider.secret())?
        .ok_or_else(|| format!("no {} key is saved in lpm", provider.key_label()))?;

    let _ = writeln!(w, "PROGRESS working");
    let _ = w.flush();
    let started = Instant::now();
    let (mime, bytes) = make(&plan, &key)?;
    let path = settle_extension(&plan.out, &mime, plan.kind);
    save(&path, &bytes, &plan, &prefs)?;

    let dims = models::png_size(&bytes);
    let record = ledger::Record {
        at: ledger::now(),
        kind: plan.kind.word().into(),
        model: plan.model.id.into(),
        label: plan.model.label.into(),
        prompt: plan.prompt.clone(),
        path: path.to_string_lossy().into_owned(),
        project,
        agent: who.agent,
        cents: plan.cents,
        bytes: bytes.len() as u64,
        width: dims.map(|d| d.0),
        height: dims.map(|d| d.1),
        voice: (plan.kind == Kind::Speech).then(|| plan.voice.clone()),
    };
    ledger::append(&record);
    Ok(json!({
        "ok": true,
        "path": record.path,
        "shown": shown(&path, &plan.root),
        "model": plan.model.label,
        "bytes": record.bytes,
        "width": record.width,
        "height": record.height,
        "voice": record.voice,
        "cost": models::cost_words(plan.cents),
        "seconds": (started.elapsed().as_secs_f64() * 10.0).round() / 10.0,
    }))
}

pub(crate) fn must_ask(approval: &str, allowed: bool, missing_key: bool, over_limit: bool) -> bool {
    missing_key
        || over_limit
        || match approval {
            "always" => false,
            "each" => true,
            _ => !allowed,
        }
}

fn unattended_error(missing_key: bool, provider: Provider) -> String {
    if missing_key {
        format!(
            "there's no {} key on this computer yet. Add one in Settings › Images & speech \
             for this computer",
            provider.key_label()
        )
    } else {
        "nobody is at this computer to allow it. In Settings › Images & speech for this \
         computer, set Approval to Always allow, or run it on a computer with lpm open"
            .into()
    }
}

fn make(plan: &Plan, key: &str) -> Result<(String, Vec<u8>), String> {
    match plan.kind {
        Kind::Image => providers::image(
            plan.model,
            key,
            &providers::ImageAsk {
                prompt: &plan.prompt,
                aspect: plan.aspect,
                size: plan.size,
                edit: plan.edit.clone(),
            },
        ),
        Kind::Speech => {
            let bytes = providers::speech(key, &plan.prompt, &plan.voice, plan.format)?;
            Ok((format!("audio/{}", plan.format), bytes))
        }
    }
}

fn save(path: &Path, bytes: &[u8], plan: &Plan, prefs: &Prefs) -> Result<(), String> {
    let dir = path.parent().ok_or("that isn't a place a file can go")?;
    std::fs::create_dir_all(dir).map_err(|e| format!("couldn't make {}: {e}", dir.display()))?;
    if !plan.named && prefs.keep_out_of_git {
        let ignore = dir.join(".gitignore");
        if !ignore.exists() {
            let _ = std::fs::write(&ignore, "*\n");
        }
    }
    std::fs::write(path, bytes).map_err(|e| format!("couldn't save {}: {e}", path.display()))
}

/// "Today: 2 images and 1 clip, 8¢ of your $2 limit".
pub(crate) fn today_words(images: u32, clips: u32, cents: f64, limit_cents: Option<f64>) -> String {
    let count = |n: u32, one: &str, many: &str| match n {
        0 => None,
        1 => Some(format!("1 {one}")),
        n => Some(format!("{n} {many}")),
    };
    let made: Vec<String> = [
        count(images, "image", "images"),
        count(clips, "clip", "clips"),
    ]
    .into_iter()
    .flatten()
    .collect();
    let spend = match limit_cents {
        Some(limit) => format!("{} of your {} limit", money(cents), money(limit)),
        None => money(cents),
    };
    if made.is_empty() {
        match limit_cents {
            Some(limit) => format!("Nothing made today. Daily limit {}", money(limit)),
            None => "Nothing made today".into(),
        }
    } else {
        format!("Today: {}, {spend}", made.join(" and "))
    }
}

fn money(cents: f64) -> String {
    if cents < 100.0 {
        format!("{}¢", cents.round() as i64)
    } else if (cents / 100.0).fract() == 0.0 {
        format!("${}", (cents / 100.0) as i64)
    } else {
        format!("${:.2}", cents / 100.0)
    }
}

/// `generate_models`: what each model makes, whose key it needs and whether one
/// is saved, and the voices.
pub(crate) fn cmd_generate_models() -> String {
    let prefs = prefs(&crate::config::load_settings());
    let image_default =
        models::find(&prefs.image_model, Kind::Image).map_or(models::DEFAULT_IMAGE, |m| m.id);
    let list: Vec<Value> = models::MODELS
        .iter()
        .map(|m| {
            json!({
                "id": m.id,
                "label": m.label,
                "provider": m.provider.name(),
                "makes": m.kind.word(),
                "key": crate::secrets::has(m.provider.secret()),
                "default": m.id == image_default || m.id == models::DEFAULT_SPEECH,
            })
        })
        .collect();
    let voice = if prefs.voice.is_empty() {
        models::DEFAULT_VOICE.to_string()
    } else {
        prefs.voice
    };
    json!({ "models": list, "voices": crate::openaitts::VOICES, "voice": voice, "approval": prefs.approval })
        .to_string()
}

#[cfg(test)]
mod tests;
