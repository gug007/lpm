// What Settings › Images & speech and the file viewer ask of `lpm generate`:
// which keys are saved (never the keys themselves), the models and voices to
// pick from, what was spent, and how a file was made.
use serde::Serialize;
use serde_json::{json, Value};

use super::ledger::{self, Record, Usage};
use super::models::{self, Kind, Provider};

fn provider(id: &str) -> Result<Provider, String> {
    Provider::from_key_id(id).ok_or_else(|| format!("no provider called {id}"))
}

/// Whether each provider's key is saved: `{ gemini, openai }`.
#[tauri::command(async)]
pub fn generate_key_status() -> Value {
    json!({
        "gemini": crate::secrets::has(Provider::Google.secret()),
        "openai": crate::secrets::has(Provider::OpenAI.secret()),
    })
}

#[tauri::command(async)]
pub fn set_generate_key(provider: String, key: String) -> Result<(), String> {
    let key = key.trim();
    if key.is_empty() {
        return Err("the key is empty".into());
    }
    crate::secrets::set(self::provider(&provider)?.secret(), key)
}

#[tauri::command(async)]
pub fn clear_generate_key(provider: String) -> Result<(), String> {
    crate::secrets::delete(self::provider(&provider)?.secret())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Choice {
    id: &'static str,
    label: &'static str,
    provider: &'static str,
    /// About what one image costs at the default size: "about 3¢".
    cost: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Options {
    image_models: Vec<Choice>,
    voices: Vec<&'static str>,
    default_image_model: &'static str,
    default_voice: &'static str,
    default_limit: f64,
}

/// The image models and voices Settings offers, and the defaults it shows.
#[tauri::command]
pub fn generate_options() -> Options {
    Options {
        image_models: models::models_of(Kind::Image)
            .map(|m| Choice {
                id: m.id,
                label: m.label,
                provider: m.provider.name(),
                cost: models::cost_words(models::image_cents(m, None)),
            })
            .collect(),
        voices: crate::openaitts::VOICES.to_vec(),
        default_image_model: models::DEFAULT_IMAGE,
        default_voice: models::DEFAULT_VOICE,
        default_limit: super::DEFAULT_LIMIT_DOLLARS,
    }
}

/// This month's images, clips and spend, and today's spend.
#[tauri::command(async)]
pub fn generate_usage() -> Usage {
    ledger::usage(ledger::month_start(), ledger::today_start())
}

/// How the file at `path` was made, when lpm made it.
#[tauri::command(async)]
pub fn generated_file_record(path: String) -> Option<Record> {
    ledger::for_path(&path)
}

/// Projects that generate without asking, under "Ask once per project".
#[tauri::command(async)]
pub fn generate_allowed_projects() -> Vec<String> {
    ledger::allowed_projects()
}

#[tauri::command(async)]
pub fn generate_forget_projects() {
    ledger::forget_allowed();
}
