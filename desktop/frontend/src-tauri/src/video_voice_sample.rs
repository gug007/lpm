// A few seconds of a narrator's voice for the Video settings window, spoken by
// explaincast itself so it sounds the way a video will. Each voice is spoken
// once and kept, so hearing it again is instant and, for the cloud voice, free.

#[cfg(target_os = "macos")]
const SAMPLE: &str = "Here's how sign-in works, step by step.";

// Bumped when SAMPLE changes, so a kept clip of the old line isn't played.
#[cfg(any(target_os = "macos", test))]
const SAMPLE_VERSION: u32 = 1;

// Returns the clip as base64 WAV. `voice` is "local/af_heart" or
// "openai/marin", as EXPLAINCAST_VOICE spells it.
#[tauri::command]
pub async fn video_voice_sample(voice: String) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        tauri::async_runtime::spawn_blocking(move || mac::sample(&voice))
            .await
            .map_err(|e| e.to_string())?
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = voice;
        Err(crate::video_setup::NOT_MAC.into())
    }
}

// The kept clip's file name, for a voice explaincast has.
#[cfg(any(target_os = "macos", test))]
fn sample_file(voice: &str) -> Option<String> {
    let (engine, name) = voice.split_once('/')?;
    let known = match engine {
        "local" => crate::video_settings::is_local_voice(name),
        "openai" => crate::openaitts::VOICES.contains(&name),
        _ => false,
    };
    known.then(|| format!("{engine}-{name}-{SAMPLE_VERSION}.wav"))
}

#[cfg(target_os = "macos")]
mod mac {
    use super::{sample_file, SAMPLE};
    use base64::Engine as _;

    // Node ends on its own once the WAV is written: process.exit() with the
    // local voice's model loaded aborts in ONNX Runtime, so it lets go first.
    const SPEAK: &str = "const [lib, setting, text] = process.argv.slice(1);\
        const { engine, voice } = require(lib).narratorOf({ voice: setting });\
        engine.speak(text, { voice, label: 'sample' }).then(\
          async (wav) => { await engine.release?.(); process.stdout.write(wav); },\
          (e) => { console.error(e.message); process.exitCode = 1; });";

    pub fn sample(voice: &str) -> Result<String, String> {
        let name = sample_file(voice).ok_or("explaincast has no such voice")?;
        let dir = dirs::cache_dir()
            .ok_or("No cache folder")?
            .join("lpm")
            .join("video-voice-samples");
        let file = dir.join(name);
        let wav = match std::fs::read(&file) {
            Ok(wav) => wav,
            Err(_) => {
                let wav = speak(voice)?;
                std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
                std::fs::write(&file, &wav).map_err(|e| e.to_string())?;
                wav
            }
        };
        Ok(base64::engine::general_purpose::STANDARD.encode(wav))
    }

    fn speak(voice: &str) -> Result<Vec<u8>, String> {
        let lib = crate::video_setup::skill_lib()?.join("voice.js");
        let out = crate::osproc::command("node")
            .args(["-e", SPEAK])
            .arg(&lib)
            .arg(voice)
            .arg(SAMPLE)
            .output()
            .map_err(|e| format!("Couldn't run Node.js: {e}"))?;
        if out.status.success() && !out.stdout.is_empty() {
            return Ok(out.stdout);
        }
        let said = String::from_utf8_lossy(&out.stderr);
        Err(said
            .lines()
            .map(str::trim)
            .find(|l| !l.is_empty())
            .unwrap_or("explaincast couldn't voice the sample")
            .to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_explaincasts_voices_get_a_clip() {
        assert_eq!(
            sample_file("local/af_heart").as_deref(),
            Some("local-af_heart-1.wav")
        );
        assert_eq!(
            sample_file("openai/marin").as_deref(),
            Some("openai-marin-1.wav")
        );
        assert_eq!(sample_file("openai/af_heart"), None);
        assert_eq!(sample_file("local/../../x"), None);
        assert_eq!(sample_file("radio/marin"), None);
        assert_eq!(sample_file("af_heart"), None);
    }
}
