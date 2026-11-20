// What `lpm generate` can make and what each costs, plus the pure helpers that
// name and place the files. Prices are estimates from the providers' price
// pages; the providers bill the real amount.
use std::path::{Path, PathBuf};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Provider {
    Google,
    OpenAI,
}

impl Provider {
    pub(crate) fn name(self) -> &'static str {
        match self {
            Provider::Google => "Google",
            Provider::OpenAI => "OpenAI",
        }
    }

    /// The key's id in Settings, the CLI and the approval card.
    pub(crate) fn key_id(self) -> &'static str {
        match self {
            Provider::Google => "gemini",
            Provider::OpenAI => "openai",
        }
    }

    pub(crate) fn key_label(self) -> &'static str {
        match self {
            Provider::Google => "Google Gemini",
            Provider::OpenAI => "OpenAI",
        }
    }

    pub(crate) fn secret(self) -> &'static str {
        match self {
            Provider::Google => crate::secrets::GEMINI_API_KEY,
            Provider::OpenAI => crate::secrets::OPENAI_API_KEY,
        }
    }

    pub(crate) fn from_key_id(id: &str) -> Option<Provider> {
        match id {
            "gemini" | "google" => Some(Provider::Google),
            "openai" => Some(Provider::OpenAI),
            _ => None,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Kind {
    Image,
    Speech,
}

impl Kind {
    pub(crate) fn word(self) -> &'static str {
        match self {
            Kind::Image => "image",
            Kind::Speech => "speech",
        }
    }
}

pub(crate) struct Model {
    pub id: &'static str,
    pub label: &'static str,
    pub provider: Provider,
    pub api: &'static str,
    pub kind: Kind,
    /// Other names a request may use for it.
    pub aliases: &'static [&'static str],
}

pub(crate) const MODELS: &[Model] = &[
    Model {
        id: "nano-banana",
        label: "Nano Banana 2.1",
        provider: Provider::Google,
        api: "gemini-nano-banana-2.1",
        kind: Kind::Image,
        aliases: &["nano-banana-2", "nano-banana-2.1", "nanobanana", "gemini"],
    },
    Model {
        id: "nano-banana-pro",
        label: "Nano Banana Pro",
        provider: Provider::Google,
        api: "gemini-3-pro-image",
        kind: Kind::Image,
        aliases: &["pro", "nanobanana-pro"],
    },
    Model {
        id: "gpt-image",
        label: "GPT Image 2",
        provider: Provider::OpenAI,
        api: "gpt-image-2",
        kind: Kind::Image,
        aliases: &["gpt-image-2", "openai"],
    },
    Model {
        id: "openai-speech",
        label: "OpenAI speech",
        provider: Provider::OpenAI,
        api: "gpt-4o-mini-tts",
        kind: Kind::Speech,
        aliases: &["gpt-4o-mini-tts", "tts"],
    },
];

pub(crate) const DEFAULT_IMAGE: &str = "nano-banana";
pub(crate) const DEFAULT_SPEECH: &str = "openai-speech";
pub(crate) const DEFAULT_VOICE: &str = "marin";

pub(crate) const ASPECTS: &[&str] = &[
    "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9",
];
pub(crate) const SIZES: &[&str] = &["1K", "2K", "4K"];
pub(crate) const SPEECH_FORMATS: &[&str] = &["mp3", "wav", "aac", "opus", "flac"];

pub(crate) fn find(name: &str, kind: Kind) -> Option<&'static Model> {
    let name = name.trim().to_lowercase().replace([' ', '_'], "-");
    MODELS.iter().find(|m| {
        m.kind == kind && (m.id == name || m.api == name || m.aliases.contains(&name.as_str()))
    })
}

pub(crate) fn models_of(kind: Kind) -> impl Iterator<Item = &'static Model> {
    MODELS.iter().filter(move |m| m.kind == kind)
}

/// `size` in uppercase K, as Gemini wants it, if it is one it takes.
pub(crate) fn image_size(size: &str) -> Option<&'static str> {
    let up = size.trim().to_uppercase();
    SIZES.iter().copied().find(|s| *s == up)
}

/// About what one image costs, in US cents.
pub(crate) fn image_cents(model: &Model, size: Option<&str>) -> f64 {
    match (model.id, size.unwrap_or("1K")) {
        ("nano-banana", "2K") => 5.0,
        ("nano-banana", "4K") => 11.3,
        ("nano-banana", _) => 3.4,
        ("nano-banana-pro", "4K") => 24.0,
        ("nano-banana-pro", _) => 13.4,
        _ => 5.0,
    }
}

/// About what speaking `chars` characters costs, in US cents: roughly 900
/// characters a minute at 1.5¢ a minute.
pub(crate) fn speech_cents(chars: usize) -> f64 {
    (chars as f64 / 900.0 * 1.5).max(0.1)
}

/// "about 3¢", "under 1¢", "about $1.34".
pub(crate) fn cost_words(cents: f64) -> String {
    if cents < 1.0 {
        "under 1¢".into()
    } else if cents < 100.0 {
        format!("about {}¢", cents.round() as i64)
    } else {
        format!("about ${:.2}", cents / 100.0)
    }
}

/// The pixel size GPT Image is asked for: 1536 on the long side, both sides a
/// multiple of 16.
pub(crate) fn openai_size(aspect: Option<&str>) -> String {
    let Some((w, h)) = aspect.and_then(ratio) else {
        return "1024x1024".into();
    };
    let round16 = |v: f64| ((v / 16.0).round() as u32).max(1) * 16;
    if w >= h {
        format!("1536x{}", round16(1536.0 * h / w))
    } else {
        format!("{}x1536", round16(1536.0 * w / h))
    }
}

fn ratio(aspect: &str) -> Option<(f64, f64)> {
    let (a, b) = aspect.split_once(':')?;
    let (a, b) = (a.trim().parse::<f64>().ok()?, b.trim().parse::<f64>().ok()?);
    (a > 0.0 && b > 0.0).then_some((a, b))
}

/// A file name from the first words of a prompt: "a-giraffe-flying-a-one".
pub(crate) fn slug(prompt: &str, fallback: &str) -> String {
    let words: Vec<String> = prompt
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|w| !w.is_empty())
        .map(str::to_lowercase)
        .take(6)
        .collect();
    let mut out = String::new();
    for w in words {
        if out.len() + w.len() + 1 > 40 {
            break;
        }
        if !out.is_empty() {
            out.push('-');
        }
        out.push_str(&w);
    }
    if out.is_empty() {
        fallback.to_string()
    } else {
        out
    }
}

pub(crate) fn extension_for(mime: &str) -> &'static str {
    match mime {
        "image/jpeg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        "audio/mpeg" => "mp3",
        _ => "png",
    }
}

pub(crate) fn image_mime(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_str()?.to_lowercase();
    match ext.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        "heic" => Some("image/heic"),
        "heif" => Some("image/heif"),
        _ => None,
    }
}

/// Width and height from a PNG's header.
pub(crate) fn png_size(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 24 || &bytes[..8] != b"\x89PNG\r\n\x1a\n" {
        return None;
    }
    let w = u32::from_be_bytes(bytes[16..20].try_into().ok()?);
    let h = u32::from_be_bytes(bytes[20..24].try_into().ok()?);
    Some((w, h))
}

/// The folder a repository starts at, or `cwd` outside one.
pub(crate) fn project_folder(cwd: &Path) -> PathBuf {
    cwd.ancestors()
        .find(|dir| dir.join(".git").exists())
        .unwrap_or(cwd)
        .to_path_buf()
}

/// Where the file goes. A named file is used as written (relative to `cwd`), a
/// named folder gets a name of its own, and with neither the file goes into
/// `default_dir` under a name nothing there has yet. The extension is `ext`
/// when the name has none.
pub(crate) fn out_path(
    cwd: &Path,
    out: &str,
    default_dir: &Path,
    name: &str,
    ext: &str,
    exists: impl Fn(&Path) -> bool,
) -> PathBuf {
    let out = out.trim();
    if out.is_empty() {
        return unique(default_dir, name, ext, exists);
    }
    let expanded = crate::config::expand_home(out);
    let path = Path::new(&expanded);
    let path = if path.is_absolute() {
        path.to_path_buf()
    } else {
        cwd.join(path)
    };
    if out.ends_with('/') || out.ends_with('\\') || path.is_dir() {
        return unique(&path, name, ext, exists);
    }
    if path.extension().is_none() {
        return path.with_extension(ext);
    }
    path
}

fn unique(dir: &Path, name: &str, ext: &str, exists: impl Fn(&Path) -> bool) -> PathBuf {
    let first = dir.join(format!("{name}.{ext}"));
    if !exists(&first) {
        return first;
    }
    (2..)
        .map(|n| dir.join(format!("{name}-{n}.{ext}")))
        .find(|p| !exists(p))
        .unwrap_or(first)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_request_may_name_a_model_by_alias_or_api_name() {
        assert_eq!(find("Nano Banana", Kind::Image).unwrap().id, "nano-banana");
        assert_eq!(
            find("gemini-3-pro-image", Kind::Image).unwrap().id,
            "nano-banana-pro"
        );
        assert_eq!(find("gpt-image-2", Kind::Image).unwrap().id, "gpt-image");
        assert!(find("gpt-image", Kind::Speech).is_none());
        assert!(find("dall-e-3", Kind::Image).is_none());
    }

    #[test]
    fn costs_read_as_words() {
        assert_eq!(cost_words(3.4), "about 3¢");
        assert_eq!(cost_words(0.4), "under 1¢");
        assert_eq!(cost_words(134.0), "about $1.34");
        let banana = find("nano-banana", Kind::Image).unwrap();
        assert_eq!(image_cents(banana, Some("4K")), 11.3);
        assert_eq!(image_cents(banana, None), 3.4);
    }

    #[test]
    fn gpt_image_sizes_keep_the_aspect_in_multiples_of_16() {
        assert_eq!(openai_size(None), "1024x1024");
        assert_eq!(openai_size(Some("1:1")), "1536x1536");
        assert_eq!(openai_size(Some("16:9")), "1536x864");
        assert_eq!(openai_size(Some("9:16")), "864x1536");
        assert_eq!(openai_size(Some("21:9")), "1536x656");
        assert_eq!(openai_size(Some("wide")), "1024x1024");
    }

    #[test]
    fn a_slug_takes_the_first_words() {
        assert_eq!(
            slug("A giraffe flying a one-seat propeller plane!", "image"),
            "a-giraffe-flying-a-one-seat"
        );
        assert_eq!(slug("¡¿", "image"), "image");
    }

    #[test]
    fn png_dimensions_come_from_the_header() {
        let mut png = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR".to_vec();
        png.extend_from_slice(&1344u32.to_be_bytes());
        png.extend_from_slice(&768u32.to_be_bytes());
        assert_eq!(png_size(&png), Some((1344, 768)));
        assert_eq!(png_size(b"GIF89a"), None);
    }

    #[cfg(unix)]
    #[test]
    fn files_go_where_they_are_named_or_get_a_free_name() {
        let cwd = Path::new("/p/app/src");
        let gen = Path::new("/p/app/generated");
        let taken = |p: &Path| p == Path::new("/p/app/generated/fox.png");
        assert_eq!(
            out_path(cwd, "", gen, "fox", "png", taken),
            PathBuf::from("/p/app/generated/fox-2.png")
        );
        assert_eq!(
            out_path(cwd, "art/logo", gen, "fox", "png", taken),
            PathBuf::from("/p/app/src/art/logo.png")
        );
        assert_eq!(
            out_path(cwd, "/tmp/x.jpg", gen, "fox", "png", taken),
            PathBuf::from("/tmp/x.jpg")
        );
        assert_eq!(
            out_path(cwd, "shots/", gen, "fox", "png", taken),
            PathBuf::from("/p/app/src/shots/fox.png")
        );
    }
}
