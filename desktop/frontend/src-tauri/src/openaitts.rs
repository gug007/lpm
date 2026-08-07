// OpenAI text-to-speech: POST /v1/audio/speech, returning one encoded audio
// buffer for a whole document.
//
// AAC rather than WAV because this audio crosses the wire to the phone — the
// same speech is ~8x smaller, and AVFoundation decodes it natively (Opus would
// be smaller still but needs a container iOS won't reliably open).
//
// The model caps input per request, so long results are synthesized in pieces
// and concatenated. AAC's self-framing ADTS stream makes naive concatenation
// play as one file; that would not hold for WAV, which carries a header.
use crate::secrets;
use std::time::Duration;

const ENDPOINT: &str = "https://api.openai.com/v1/audio/speech";
const MODEL: &str = "gpt-4o-mini-tts";
const FORMAT: &str = "aac";
pub const DEFAULT_VOICE: &str = "alloy";

/// Well under the model's per-request input cap, leaving headroom for the
/// multi-byte characters an automation result is full of.
const MAX_CHUNK_CHARS: usize = 4000;

pub const VOICES: &[&str] = &[
    "alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse",
    "marin", "cedar",
];

/// Split on paragraph, then sentence, then hard-cut — so a chunk boundary lands
/// where a speaker would pause rather than mid-word.
fn chunk(text: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut current = String::new();

    for para in text.split("\n\n") {
        for piece in split_sentences(para) {
            if current.chars().count() + piece.chars().count() > MAX_CHUNK_CHARS
                && !current.is_empty()
            {
                out.push(std::mem::take(&mut current));
            }
            if piece.chars().count() > MAX_CHUNK_CHARS {
                for hard in hard_split(&piece) {
                    out.push(hard);
                }
                continue;
            }
            if !current.is_empty() {
                current.push(' ');
            }
            current.push_str(piece.trim());
        }
    }
    if !current.trim().is_empty() {
        out.push(current);
    }
    out
}

fn split_sentences(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut current = String::new();
    for ch in text.chars() {
        current.push(ch);
        if matches!(ch, '.' | '!' | '?' | '\n') && current.trim().len() > 1 {
            out.push(std::mem::take(&mut current));
        }
    }
    if !current.trim().is_empty() {
        out.push(current);
    }
    out
}

fn hard_split(text: &str) -> Vec<String> {
    let chars: Vec<char> = text.chars().collect();
    chars
        .chunks(MAX_CHUNK_CHARS)
        .map(|c| c.iter().collect())
        .collect()
}

/// Synthesize `text` and return the encoded audio. Blocking; call off the Tauri
/// worker (see `run_off_worker` below).
pub fn synthesize(text: &str, voice: &str, speed: f64) -> Result<Vec<u8>, String> {
    let key = secrets::get(secrets::OPENAI_API_KEY)?
        .ok_or("No OpenAI API key saved. Add one in Settings → Text to Speech.")?;
    let voice = if VOICES.contains(&voice) {
        voice
    } else {
        DEFAULT_VOICE
    };
    let speed = speed.clamp(0.25, 4.0);

    let chunks = chunk(text);
    if chunks.is_empty() {
        return Err("text is empty".into());
    }

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(120))
        .user_agent("lpm")
        .build()
        .map_err(|e| e.to_string())?;

    let mut audio = Vec::new();
    for piece in chunks {
        let body = serde_json::json!({
            "model": MODEL,
            "input": piece,
            "voice": voice,
            "speed": speed,
            "response_format": FORMAT,
        });
        // Serialized by hand rather than via .json(): reqwest is built here
        // without its `json` feature, and adding one for a single call would
        // widen the dependency for both the macOS and Linux targets.
        let resp = client
            .post(ENDPOINT)
            .bearer_auth(&key)
            .header("content-type", "application/json")
            .body(serde_json::to_string(&body).map_err(|e| e.to_string())?)
            .send()
            .map_err(|e| format!("OpenAI request failed: {e}"))?;
        let status = resp.status();
        if !status.is_success() {
            // The error body carries the actionable part (bad key, quota, model
            // name); the bare status does not.
            let detail = resp.text().unwrap_or_default();
            return Err(format!(
                "OpenAI returned {}: {}",
                status.as_u16(),
                summarize_error(&detail)
            ));
        }
        let bytes = resp
            .bytes()
            .map_err(|e| format!("read OpenAI audio: {e}"))?;
        audio.extend_from_slice(&bytes);
    }
    Ok(audio)
}

fn summarize_error(body: &str) -> String {
    serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|v| {
            v.get("error")
                .and_then(|e| e.get("message"))
                .and_then(|m| m.as_str())
                .map(str::to_string)
        })
        .unwrap_or_else(|| body.chars().take(200).collect())
}

/// reqwest::blocking owns a tokio runtime that panics when dropped inside a
/// #[command(async)] worker, so the request runs on a plain thread.
pub fn synthesize_off_worker(text: String, voice: String, speed: f64) -> Result<Vec<u8>, String> {
    std::thread::spawn(move || synthesize(&text, &voice, speed))
        .join()
        .map_err(|_| "tts thread panicked".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chunks_stay_under_the_cap() {
        let text = "Sentence one. ".repeat(2000);
        for c in chunk(&text) {
            assert!(c.chars().count() <= MAX_CHUNK_CHARS, "chunk too long");
        }
    }

    #[test]
    fn short_text_is_one_chunk() {
        assert_eq!(chunk("Two sentences. Right here.").len(), 1);
    }

    #[test]
    fn a_single_oversized_sentence_is_hard_split() {
        let text = "x".repeat(MAX_CHUNK_CHARS * 2 + 10);
        let chunks = chunk(&text);
        assert!(chunks.len() >= 3);
        assert!(chunks.iter().all(|c| c.chars().count() <= MAX_CHUNK_CHARS));
    }
}
