// The calls that make the files: Gemini and GPT Image for pictures, OpenAI's
// speech endpoint (openaitts.rs) for audio. Blocking; the socket thread that
// runs `lpm generate` is a plain thread, never a Tauri worker.
use base64::Engine as _;
use serde_json::{json, Value};
use std::time::Duration;

use super::models::{self, Model, Provider};

const GEMINI_ENDPOINT: &str = "https://generativelanguage.googleapis.com/v1beta/models";
const OPENAI_IMAGES: &str = "https://api.openai.com/v1/images/generations";

pub(crate) struct ImageAsk<'a> {
    pub prompt: &'a str,
    pub aspect: Option<&'a str>,
    pub size: Option<&'a str>,
    /// An image to change instead of starting fresh: (mime, bytes).
    pub edit: Option<(&'static str, Vec<u8>)>,
}

/// (mime, bytes) of the image `model` made.
pub(crate) fn image(model: &Model, key: &str, ask: &ImageAsk) -> Result<(String, Vec<u8>), String> {
    match model.provider {
        Provider::Google => gemini_image(model.api, key, ask),
        Provider::OpenAI => {
            if ask.edit.is_some() {
                return Err(
                    "changing an existing image needs a Google model; add --model nano-banana"
                        .into(),
                );
            }
            openai_image(model.api, key, ask)
        }
    }
}

fn client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(240))
        .user_agent("lpm")
        .build()
        .map_err(|e| e.to_string())
}

fn post(url: &str, headers: &[(&str, &str)], body: &Value, who: &str) -> Result<Value, String> {
    let mut req = client()?
        .post(url)
        .header("content-type", "application/json")
        .body(serde_json::to_string(body).map_err(|e| e.to_string())?);
    for (name, value) in headers {
        req = req.header(*name, *value);
    }
    let resp = req
        .send()
        .map_err(|e| format!("{who} request failed: {e}"))?;
    let status = resp.status();
    let text = resp
        .text()
        .map_err(|e| format!("read {who}'s answer: {e}"))?;
    if !status.is_success() {
        return Err(format!(
            "{who} returned {}: {}",
            status.as_u16(),
            crate::openaitts::summarize_error(&text)
        ));
    }
    serde_json::from_str(&text).map_err(|_| format!("{who} sent an answer lpm can't read"))
}

fn decode(data: &str) -> Result<Vec<u8>, String> {
    base64::engine::general_purpose::STANDARD
        .decode(data.trim())
        .map_err(|_| "the image came back damaged".to_string())
}

fn gemini_body(ask: &ImageAsk) -> Value {
    let mut parts = vec![json!({ "text": ask.prompt })];
    if let Some((mime, bytes)) = &ask.edit {
        parts.push(json!({
            "inlineData": {
                "mimeType": mime,
                "data": base64::engine::general_purpose::STANDARD.encode(bytes),
            }
        }));
    }
    let mut image_config = serde_json::Map::new();
    if let Some(aspect) = ask.aspect {
        image_config.insert("aspectRatio".into(), json!(aspect));
    }
    if let Some(size) = ask.size {
        image_config.insert("imageSize".into(), json!(size));
    }
    let mut config = json!({ "responseModalities": ["TEXT", "IMAGE"] });
    if !image_config.is_empty() {
        config["imageConfig"] = Value::Object(image_config);
    }
    json!({
        "contents": [{ "role": "user", "parts": parts }],
        "generationConfig": config,
    })
}

fn gemini_image(api: &str, key: &str, ask: &ImageAsk) -> Result<(String, Vec<u8>), String> {
    let url = format!("{GEMINI_ENDPOINT}/{api}:generateContent");
    let reply = post(
        &url,
        &[("x-goog-api-key", key)],
        &gemini_body(ask),
        "Google",
    )?;
    gemini_picture(&reply)
}

/// The last finished picture in Gemini's answer. Thinking models send draft
/// pictures first, marked `thought`; those are not the answer.
fn gemini_picture(reply: &Value) -> Result<(String, Vec<u8>), String> {
    if let Some(reason) = reply["promptFeedback"]["blockReason"].as_str() {
        return Err(format!("Google refused the prompt ({reason})"));
    }
    let parts = reply["candidates"][0]["content"]["parts"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let picture = parts
        .iter()
        .rev()
        .find(|p| p["thought"].as_bool() != Some(true) && p["inlineData"]["data"].is_string());
    if let Some(p) = picture {
        let mime = p["inlineData"]["mimeType"]
            .as_str()
            .unwrap_or("image/png")
            .to_string();
        return Ok((
            mime,
            decode(p["inlineData"]["data"].as_str().unwrap_or(""))?,
        ));
    }
    let said: Vec<&str> = parts
        .iter()
        .filter(|p| p["thought"].as_bool() != Some(true))
        .filter_map(|p| p["text"].as_str())
        .collect();
    let said = said.join(" ");
    if !said.trim().is_empty() {
        return Err(format!("Google sent no image. It said: {}", said.trim()));
    }
    let reason = reply["candidates"][0]["finishReason"]
        .as_str()
        .unwrap_or("no reason given");
    Err(format!("Google sent no image ({reason})"))
}

fn openai_image(api: &str, key: &str, ask: &ImageAsk) -> Result<(String, Vec<u8>), String> {
    let body = json!({
        "model": api,
        "prompt": ask.prompt,
        "size": models::openai_size(ask.aspect),
        "quality": "medium",
        "n": 1,
        "output_format": "png",
    });
    let auth = format!("Bearer {key}");
    let reply = post(OPENAI_IMAGES, &[("authorization", &auth)], &body, "OpenAI")?;
    let data = reply["data"][0]["b64_json"]
        .as_str()
        .ok_or("OpenAI sent no image")?;
    Ok(("image/png".into(), decode(data)?))
}

/// Speech for `text` in `format`. Long text is spoken in pieces and joined,
/// which only formats made of self-contained frames survive.
pub(crate) fn speech(key: &str, text: &str, voice: &str, format: &str) -> Result<Vec<u8>, String> {
    let pieces = crate::openaitts::chunk(text);
    if pieces.len() > 1 && !matches!(format, "mp3" | "aac") {
        return Err(format!(
            "that text is too long for one {format} file; use mp3 or aac, or split the text"
        ));
    }
    crate::openaitts::speak(key, &pieces, voice, 1.0, format)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_gemini_body_carries_the_picture_settings_only_when_asked() {
        let plain = gemini_body(&ImageAsk {
            prompt: "a fox",
            aspect: None,
            size: None,
            edit: None,
        });
        assert!(plain["generationConfig"].get("imageConfig").is_none());
        assert_eq!(plain["contents"][0]["parts"][0]["text"], "a fox");
        let set = gemini_body(&ImageAsk {
            prompt: "a fox",
            aspect: Some("16:9"),
            size: Some("2K"),
            edit: Some(("image/png", vec![1, 2, 3])),
        });
        assert_eq!(
            set["generationConfig"]["imageConfig"]["aspectRatio"],
            "16:9"
        );
        assert_eq!(set["generationConfig"]["imageConfig"]["imageSize"], "2K");
        assert_eq!(set["contents"][0]["parts"][1]["inlineData"]["data"], "AQID");
    }

    #[test]
    fn the_finished_picture_wins_over_drafts() {
        let reply = json!({ "candidates": [{ "content": { "parts": [
            { "inlineData": { "mimeType": "image/png", "data": "AQ==" }, "thought": true },
            { "text": "Here it is" },
            { "inlineData": { "mimeType": "image/jpeg", "data": "Ag==" } },
        ] } }] });
        assert_eq!(
            gemini_picture(&reply).unwrap(),
            ("image/jpeg".into(), vec![2])
        );
    }

    #[test]
    fn no_picture_says_why() {
        let refused = json!({ "promptFeedback": { "blockReason": "SAFETY" } });
        assert_eq!(
            gemini_picture(&refused).unwrap_err(),
            "Google refused the prompt (SAFETY)"
        );
        let talked = json!({ "candidates": [{ "content": { "parts": [{ "text": "I can't draw that." }] } }] });
        assert!(gemini_picture(&talked)
            .unwrap_err()
            .contains("I can't draw that."));
        let stopped = json!({ "candidates": [{ "finishReason": "IMAGE_SAFETY" }] });
        assert!(gemini_picture(&stopped)
            .unwrap_err()
            .contains("IMAGE_SAFETY"));
    }
}
