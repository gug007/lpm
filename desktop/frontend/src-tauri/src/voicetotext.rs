use std::process::Command;

#[tauri::command]
pub fn voice_to_text_available() -> bool {
    crate::openin::detect_by_paths(&[
        "/Applications/VoiceToText.app",
        "/Applications/VoiceToText-Dev.app",
    ])
    .is_some()
}

#[tauri::command(async)]
pub fn voice_to_text_toggle() -> Result<(), String> {
    // `-g` launches the handler in the background so VoiceToText never steals
    // focus — the dictated text then pastes into the composer, which stays
    // frontmost.
    let status = Command::new("open")
        .args(["-g", "voicetotext://toggle"])
        .status()
        .map_err(|e| e.to_string())?;
    if !status.success() {
        return Err("could not reach VoiceToText".into());
    }
    Ok(())
}
