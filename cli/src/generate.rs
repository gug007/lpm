//! `lpm generate image|speech|models` — make an image or an audio file with the
//! keys saved in lpm. lpm asks the person first when its Settings say so, makes
//! the file and says where it went; the key never leaves lpm.

use crate::config::Ctx;
use crate::control;
use crate::error::RunError;
use crate::util::print_json;
use clap::Subcommand;
use serde_json::{json, Value};
use std::io::Read;
use std::path::Path;

#[derive(Subcommand)]
pub enum Command {
    /// Make an image from a prompt.
    #[command(
        long_about = "Make an image from a prompt with the key saved in lpm (Settings › Images & \
speech). lpm may ask you to allow it first, showing the prompt, the model and the cost, and waits \
for your answer. Without --out the image goes into generated/ at the top of the project under a \
name from the prompt, kept out of Git."
    )]
    Image {
        /// What the image shows.
        prompt: String,
        /// Where to save it: a file, or a folder ending in /.
        #[arg(short, long, value_name = "FILE")]
        out: Option<String>,
        /// nano-banana, nano-banana-pro or gpt-image (default: the one picked in Settings).
        #[arg(long)]
        model: Option<String>,
        /// 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9 or 21:9.
        #[arg(long)]
        aspect: Option<String>,
        /// 1K, 2K or 4K, for Google's models (default 1K).
        #[arg(long)]
        size: Option<String>,
        /// Change this image instead of starting fresh (Google's models).
        #[arg(long, value_name = "FILE")]
        edit: Option<String>,
        /// Print one JSON object with the path and details.
        #[arg(long)]
        json: bool,
    },
    /// Speak text into an audio file.
    #[command(
        long_about = "Speak text into an audio file with the OpenAI key saved in lpm. lpm may ask \
you to allow it first. Pass - to read the text from stdin. Without --out the file goes into \
generated/ at the top of the project, kept out of Git."
    )]
    Speech {
        /// The text to speak, or - to read it from stdin.
        text: String,
        /// Where to save it: a file, or a folder ending in /.
        #[arg(short, long, value_name = "FILE")]
        out: Option<String>,
        /// The voice, such as marin, cedar or alloy (default: the one picked in Settings).
        #[arg(long)]
        voice: Option<String>,
        /// mp3 (default), wav, aac, opus or flac.
        #[arg(long)]
        format: Option<String>,
        /// Print one JSON object with the path and details.
        #[arg(long)]
        json: bool,
    },
    /// List the models, whose key each needs and whether one is saved.
    Models {
        #[arg(long)]
        json: bool,
    },
}

pub fn run(ctx: &Ctx, command: Command) -> Result<(), RunError> {
    match command {
        Command::Image {
            prompt,
            out,
            model,
            aspect,
            size,
            edit,
            json,
        } => make(
            ctx,
            json!({
                "kind": "image", "prompt": prompt, "out": out.unwrap_or_default(),
                "model": model.unwrap_or_default(), "aspect": aspect.unwrap_or_default(),
                "size": size.unwrap_or_default(), "edit": edit.unwrap_or_default(),
            }),
            json,
        ),
        Command::Speech {
            text,
            out,
            voice,
            format,
            json,
        } => {
            let text = if text == "-" { read_stdin()? } else { text };
            make(
                ctx,
                json!({
                    "kind": "speech", "prompt": text, "out": out.unwrap_or_default(),
                    "voice": voice.unwrap_or_default(), "format": format.unwrap_or_default(),
                }),
                json,
            )
        }
        Command::Models { json } => models(ctx, json),
    }
}

fn read_stdin() -> Result<String, RunError> {
    let mut text = String::new();
    std::io::stdin()
        .read_to_string(&mut text)
        .map_err(|e| RunError::Internal(format!("couldn't read the text from stdin: {e}")))?;
    Ok(text)
}

fn make(ctx: &Ctx, mut request: Value, as_json: bool) -> Result<(), RunError> {
    let cwd = std::env::current_dir()
        .map_err(|e| RunError::Internal(format!("can't tell which folder this is: {e}")))?;
    request["cwd"] = cwd.to_string_lossy().into_owned().into();
    let reply = control::agent_request(ctx, "agent_generate", request, |p| {
        if as_json {
            return;
        }
        match p {
            "key" => eprintln!("Waiting for you to add the key in lpm…"),
            "waiting" => eprintln!("Waiting for you to allow it in lpm…"),
            "working" => eprintln!("Making it…"),
            _ => {}
        }
    })?;
    control::agent_ok(&reply, "nothing was made")?;
    if as_json {
        print_json(&reply);
    } else {
        println!("{}", saved_line(&reply, &cwd));
    }
    Ok(())
}

/// "Saved generated/fox.png (1344×768, Nano Banana 2.1, about 3¢, 7.8 s)".
fn saved_line(reply: &Value, cwd: &Path) -> String {
    let full = reply["path"].as_str().unwrap_or_default();
    let path = Path::new(full)
        .strip_prefix(cwd)
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| full.to_string());
    let mut facts = Vec::new();
    if let (Some(w), Some(h)) = (reply["width"].as_u64(), reply["height"].as_u64()) {
        facts.push(format!("{w}×{h}"));
    }
    if let Some(model) = reply["model"].as_str() {
        facts.push(model.to_string());
    }
    if let Some(voice) = reply["voice"].as_str() {
        facts.push(format!("{voice} voice"));
    }
    if let Some(cost) = reply["cost"].as_str() {
        facts.push(cost.to_string());
    }
    if let Some(seconds) = reply["seconds"].as_f64() {
        facts.push(format!("{seconds} s"));
    }
    format!("Saved {path} ({})", facts.join(", "))
}

fn models(ctx: &Ctx, as_json: bool) -> Result<(), RunError> {
    control::require_app(ctx)?;
    let reply = control::send_command(ctx, "generate_models")?;
    let value = control::parse_json(&reply)?;
    if as_json {
        print_json(&value);
        return Ok(());
    }
    println!("{}", models_table(&value));
    Ok(())
}

fn models_table(value: &Value) -> String {
    let rows = value["models"].as_array().cloned().unwrap_or_default();
    let mut lines = vec![format!(
        "{:<17} {:<8} {:<7} {}",
        "MODEL", "BY", "MAKES", "KEY"
    )];
    for m in rows {
        let key = if m["key"].as_bool() == Some(true) {
            "saved"
        } else {
            "missing"
        };
        let default = if m["default"].as_bool() == Some(true) {
            "   default"
        } else {
            ""
        };
        lines.push(format!(
            "{:<17} {:<8} {:<7} {key}{default}",
            m["id"].as_str().unwrap_or_default(),
            m["provider"].as_str().unwrap_or_default(),
            m["makes"].as_str().unwrap_or_default(),
        ));
    }
    let voices: Vec<&str> = value["voices"]
        .as_array()
        .map(|v| v.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default();
    lines.push(String::new());
    lines.push(format!(
        "Voices: {} (default {})",
        voices.join(", "),
        value["voice"].as_str().unwrap_or("marin")
    ));
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_saved_line_is_relative_to_where_it_ran() {
        let reply = json!({
            "path": "/p/app/generated/fox.png", "width": 1344, "height": 768,
            "model": "Nano Banana 2.1", "cost": "about 3¢", "seconds": 7.8,
        });
        assert_eq!(
            saved_line(&reply, Path::new("/p/app")),
            "Saved generated/fox.png (1344×768, Nano Banana 2.1, about 3¢, 7.8 s)"
        );
        assert!(saved_line(&reply, Path::new("/elsewhere"))
            .starts_with("Saved /p/app/generated/fox.png"));
        let speech = json!({ "path": "/p/a.mp3", "model": "OpenAI speech", "voice": "marin", "cost": "under 1¢" });
        assert_eq!(
            saved_line(&speech, Path::new("/p")),
            "Saved a.mp3 (OpenAI speech, marin voice, under 1¢)"
        );
    }

    #[test]
    fn the_models_table_marks_missing_keys_and_defaults() {
        let value = json!({
            "models": [
                { "id": "nano-banana", "provider": "Google", "makes": "image", "key": false, "default": true },
                { "id": "gpt-image", "provider": "OpenAI", "makes": "image", "key": true, "default": false },
            ],
            "voices": ["marin", "cedar"], "voice": "cedar",
        });
        let table = models_table(&value);
        assert!(
            table.contains("nano-banana       Google   image   missing   default"),
            "{table}"
        );
        assert!(
            table.contains("gpt-image         OpenAI   image   saved\n"),
            "{table}"
        );
        assert!(
            table.ends_with("Voices: marin, cedar (default cedar)"),
            "{table}"
        );
    }
}
