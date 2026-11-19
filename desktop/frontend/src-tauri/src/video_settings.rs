// The Video settings window: the choices that reach explaincast, which the agent runs
// rather than lpm. The narrator goes through the environment of terminals lpm
// starts; the OpenAI key through the Keychain item explaincast reads.
use serde::Serialize;
#[cfg(any(target_os = "macos", test))]
use serde_json::Value;

/// What explaincast reads for the narrator when a video names none.
#[cfg(target_os = "macos")]
pub(crate) const VOICE_ENV: &str = "EXPLAINCAST_VOICE";

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VideoSettingsInfo {
    /// explaincast's own OpenAI key is in the Keychain.
    pub key_saved: bool,
    /// Where finished videos are, once there is one.
    pub videos_dir: Option<String>,
}

/// `EXPLAINCAST_VOICE` for a new terminal from the saved settings, or None to
/// leave explaincast's own default.
#[cfg(target_os = "macos")]
pub(crate) fn narrator_env() -> Option<String> {
    narrator_from(&crate::config::load_settings())
}

#[cfg(any(target_os = "macos", test))]
fn narrator_from(settings: &Value) -> Option<String> {
    let text = |key: &str| settings.get(key).and_then(Value::as_str);
    let (engine, voice) = match text("videoNarrator")? {
        "local" => (
            "local",
            text("videoLocalVoice").filter(|v| is_local_voice(v)),
        ),
        "openai" => (
            "openai",
            text("videoCloudVoice").filter(|v| crate::openaitts::VOICES.contains(v)),
        ),
        _ => return None,
    };
    Some(match voice {
        Some(v) => format!("{engine}/{v}"),
        None => engine.to_string(),
    })
}

// Kokoro names a voice by accent and sex, then a name: af_heart, bm_george.
#[cfg(any(target_os = "macos", test))]
pub(crate) fn is_local_voice(v: &str) -> bool {
    let b = v.as_bytes();
    b.len() > 3
        && b[0].is_ascii_lowercase()
        && matches!(b[1], b'f' | b'm')
        && b[2] == b'_'
        && b[3..].iter().all(u8::is_ascii_lowercase)
}

// OpenAI keys are letters, digits, `-` and `_`. Anything else would also break
// the line handed to `security`.
fn is_key_shaped(key: &str) -> bool {
    (20..=512).contains(&key.len())
        && key
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

#[cfg(not(target_os = "macos"))]
use crate::video_setup::NOT_MAC;

#[tauri::command(async)]
pub fn video_settings_info() -> Result<VideoSettingsInfo, String> {
    #[cfg(target_os = "macos")]
    {
        Ok(VideoSettingsInfo {
            key_saved: keychain::has(),
            videos_dir: videos_dir(),
        })
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err(NOT_MAC.into())
    }
}

#[tauri::command(async)]
pub fn video_set_openai_key(key: String) -> Result<(), String> {
    let key = key.trim();
    if !is_key_shaped(key) {
        return Err("That doesn't look like an OpenAI API key".into());
    }
    #[cfg(target_os = "macos")]
    {
        keychain::set(key)
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err(NOT_MAC.into())
    }
}

#[tauri::command(async)]
pub fn video_clear_openai_key() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        keychain::delete()
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err(NOT_MAC.into())
    }
}

// explaincast's videos folder, once it exists: EXPLAINCAST_DIR, else
// ~/Movies/explaincast.
#[cfg(target_os = "macos")]
fn videos_dir() -> Option<String> {
    let dir = std::env::var_os("EXPLAINCAST_DIR")
        .map(std::path::PathBuf::from)
        .or_else(|| dirs::home_dir().map(|h| h.join("Movies").join("explaincast")))?;
    dir.is_dir().then(|| dir.to_string_lossy().into_owned())
}

// The item explaincast's scripts read with `security find-generic-password`.
// It is written by `security` too: an item lpm wrote itself would make macOS
// ask before explaincast could read it.
#[cfg(target_os = "macos")]
mod keychain {
    use std::io::Write;
    use std::process::Stdio;

    const SERVICE: &str = "explaincast";
    const ACCOUNT: &str = "openai";
    const SECURITY: &str = "/usr/bin/security";

    pub fn has() -> bool {
        crate::osproc::command(SECURITY)
            .args(["find-generic-password", "-s", SERVICE, "-a", ACCOUNT])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok_and(|s| s.success())
    }

    // The key goes to `security -i` on its stdin, never in an argument a
    // process list would show.
    pub fn set(key: &str) -> Result<(), String> {
        let mut child = crate::osproc::command(SECURITY)
            .arg("-i")
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("couldn't run security: {e}"))?;
        let line = format!("add-generic-password -s {SERVICE} -a {ACCOUNT} -U -w \"{key}\"\n");
        child
            .stdin
            .take()
            .ok_or("couldn't talk to security")?
            .write_all(line.as_bytes())
            .map_err(|e| e.to_string())?;
        let out = child.wait_with_output().map_err(|e| e.to_string())?;
        if has() {
            return Ok(());
        }
        let said = String::from_utf8_lossy(&out.stderr).trim().to_string();
        Err(if said.is_empty() {
            "The Keychain didn't save the key".into()
        } else {
            said
        })
    }

    // `security` exits 44 when there's no such item: already gone.
    pub fn delete() -> Result<(), String> {
        let out = crate::osproc::command(SECURITY)
            .args(["delete-generic-password", "-s", SERVICE, "-a", ACCOUNT])
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .output()
            .map_err(|e| e.to_string())?;
        if out.status.success() || out.status.code() == Some(44) {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn no_narrator_leaves_explaincast_its_default() {
        assert_eq!(narrator_from(&json!({})), None);
        assert_eq!(narrator_from(&json!({ "videoNarrator": "radio" })), None);
    }

    #[test]
    fn the_narrator_carries_its_engines_voice() {
        let s = json!({ "videoNarrator": "openai", "videoCloudVoice": "cedar", "videoLocalVoice": "bm_george" });
        assert_eq!(narrator_from(&s).as_deref(), Some("openai/cedar"));
        let s = json!({ "videoNarrator": "local", "videoCloudVoice": "cedar", "videoLocalVoice": "bm_george" });
        assert_eq!(narrator_from(&s).as_deref(), Some("local/bm_george"));
    }

    #[test]
    fn an_unknown_voice_falls_back_to_the_engine_alone() {
        let s = json!({ "videoNarrator": "openai", "videoCloudVoice": "nobody" });
        assert_eq!(narrator_from(&s).as_deref(), Some("openai"));
        let s = json!({ "videoNarrator": "local", "videoLocalVoice": "af_heart; rm -rf" });
        assert_eq!(narrator_from(&s).as_deref(), Some("local"));
    }

    #[test]
    fn only_key_shaped_text_is_saved() {
        assert!(is_key_shaped("sk-proj-abcdefghijklmnopqrstuvwxyz_0123-XYZ"));
        assert!(!is_key_shaped("sk-short"));
        assert!(!is_key_shaped("sk-abcdefghijklmnopqrstu\" -T /bin/sh"));
    }
}
