// Reading an `lpm generate` request into what will be made and where it goes.
use serde::Deserialize;
use std::path::{Path, PathBuf};

use super::models::{self, Kind, Model, Provider};
use super::Prefs;

const MAX_EDIT_BYTES: u64 = 15 * 1024 * 1024;

#[derive(Deserialize, Default)]
#[serde(default)]
pub(crate) struct Ask {
    pub kind: String,
    pub prompt: String,
    pub out: String,
    pub model: String,
    pub aspect: String,
    pub size: String,
    pub voice: String,
    pub format: String,
    pub edit: String,
    pub cwd: String,
    pub pane: String,
    pub project: String,
}

/// What will be made, and where it goes.
pub(crate) struct Plan {
    pub kind: Kind,
    pub model: &'static Model,
    pub prompt: String,
    pub aspect: Option<&'static str>,
    pub size: Option<&'static str>,
    pub voice: String,
    pub format: &'static str,
    pub out: PathBuf,
    pub named: bool,
    pub root: PathBuf,
    pub cents: f64,
    pub edit: Option<(&'static str, Vec<u8>)>,
}

pub(crate) fn plan(ask: &Ask, prefs: &Prefs) -> Result<Plan, String> {
    let kind = match ask.kind.as_str() {
        "image" => Kind::Image,
        "speech" => Kind::Speech,
        _ => return Err("say what to make: lpm generate image or lpm generate speech".into()),
    };
    let prompt = ask.prompt.trim().to_string();
    if prompt.is_empty() {
        return Err(match kind {
            Kind::Image => "say what the image shows".into(),
            Kind::Speech => "give the text to speak".into(),
        });
    }
    let cwd = PathBuf::from(&ask.cwd);
    if !cwd.is_absolute() || !cwd.is_dir() {
        return Err("run lpm generate from a folder that exists".into());
    }
    let wanted = match (ask.model.trim(), kind) {
        ("", Kind::Image) if !prefs.image_model.is_empty() => prefs.image_model.as_str(),
        ("", Kind::Image) => models::DEFAULT_IMAGE,
        ("", Kind::Speech) => models::DEFAULT_SPEECH,
        (named, _) => named,
    };
    let model = models::find(wanted, kind).ok_or_else(|| {
        let names: Vec<&str> = models::models_of(kind).map(|m| m.id).collect();
        format!(
            "no {} model called {wanted}; try {}",
            kind.word(),
            names.join(", ")
        )
    })?;
    let root = models::project_folder(&cwd);
    let default_dir = root.join("generated");
    let named = !ask.out.trim().is_empty();
    let fallback = kind.word();
    let name = models::slug(&prompt, fallback);
    let exists = |p: &Path| p.exists();

    match kind {
        Kind::Image => {
            let aspect = optional(&ask.aspect, |a| {
                models::ASPECTS.iter().copied().find(|x| *x == a)
            })
            .map_err(|a| {
                format!(
                    "{a} isn't an aspect lpm knows; use one of {}",
                    models::ASPECTS.join(", ")
                )
            })?;
            let size = optional(&ask.size, models::image_size)
                .map_err(|s| format!("{s} isn't a size; use 1K, 2K or 4K"))?;
            if size.is_some() && model.provider == Provider::OpenAI {
                return Err("--size is for Google's models; GPT Image picks its own".into());
            }
            let edit = match ask.edit.trim() {
                "" => None,
                file => Some(read_edit(&cwd, file)?),
            };
            Ok(Plan {
                kind,
                model,
                prompt,
                aspect,
                size,
                voice: String::new(),
                format: "png",
                out: models::out_path(&cwd, &ask.out, &default_dir, &name, "png", exists),
                named,
                root,
                cents: models::image_cents(model, size),
                edit,
            })
        }
        Kind::Speech => {
            let format = optional(&ask.format, |f| {
                models::SPEECH_FORMATS.iter().copied().find(|x| *x == f)
            })
            .map_err(|f| {
                format!(
                    "{f} isn't a format; use {}",
                    models::SPEECH_FORMATS.join(", ")
                )
            })?
            .unwrap_or("mp3");
            let voice = match (ask.voice.trim(), prefs.voice.as_str()) {
                ("", "") => models::DEFAULT_VOICE.to_string(),
                ("", saved) => saved.to_string(),
                (named, _) => named.to_lowercase(),
            };
            if !crate::openaitts::VOICES.contains(&voice.as_str()) {
                return Err(format!(
                    "no voice called {voice}; try {}",
                    crate::openaitts::VOICES.join(", ")
                ));
            }
            Ok(Plan {
                kind,
                model,
                cents: models::speech_cents(prompt.chars().count()),
                prompt,
                aspect: None,
                size: None,
                voice,
                format,
                out: models::out_path(&cwd, &ask.out, &default_dir, &name, format, exists),
                named,
                root,
                edit: None,
            })
        }
    }
}

/// `value` checked by `pick`, None when blank; the bad value as the error.
fn optional(
    value: &str,
    pick: impl Fn(&str) -> Option<&'static str>,
) -> Result<Option<&'static str>, String> {
    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }
    pick(value).map(Some).ok_or_else(|| value.to_string())
}

fn read_edit(cwd: &Path, file: &str) -> Result<(&'static str, Vec<u8>), String> {
    let expanded = crate::config::expand_home(file);
    let path = cwd.join(expanded);
    let mime = models::image_mime(&path).ok_or("lpm can change PNG, JPEG, WebP or HEIC images")?;
    let size = std::fs::metadata(&path)
        .map_err(|_| format!("there's no image at {file}"))?
        .len();
    if size > MAX_EDIT_BYTES {
        return Err("that image is over 15 MB; use a smaller one".into());
    }
    let bytes = std::fs::read(&path).map_err(|e| format!("couldn't read {file}: {e}"))?;
    Ok((mime, bytes))
}

pub(crate) fn details(plan: &Plan) -> Vec<String> {
    match plan.kind {
        Kind::Image => [
            plan.aspect.map(str::to_string),
            plan.size.map(str::to_string),
            plan.edit.as_ref().map(|_| "changes an image".to_string()),
        ]
        .into_iter()
        .flatten()
        .collect(),
        Kind::Speech => {
            let mut voice = plan.voice.clone();
            if let Some(first) = voice.get_mut(0..1) {
                first.make_ascii_uppercase();
            }
            vec![format!("{voice} voice"), plan.format.to_string()]
        }
    }
}

/// An image saved under the extension of what came back: a PNG named `.jpg`
/// opens nowhere that trusts the name.
pub(crate) fn settle_extension(out: &Path, mime: &str, kind: Kind) -> PathBuf {
    if kind == Kind::Speech {
        return out.to_path_buf();
    }
    let want = models::extension_for(mime);
    let has = out
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_lowercase)
        .unwrap_or_default();
    let same = has == want || (want == "jpg" && has == "jpeg");
    if same {
        out.to_path_buf()
    } else {
        out.with_extension(want)
    }
}

/// The path as the project sees it: relative inside it, whole outside.
pub(crate) fn shown(path: &Path, root: &Path) -> String {
    path.strip_prefix(root)
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| path.to_string_lossy().into_owned())
}
