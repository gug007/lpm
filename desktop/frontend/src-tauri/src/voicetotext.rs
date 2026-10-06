// VoiceToText is a macOS app; elsewhere dictation reports itself unavailable.
#[cfg(target_os = "macos")]
use std::process::Command;

#[tauri::command]
pub fn voice_to_text_available() -> bool {
    #[cfg(target_os = "macos")]
    {
        crate::openin::detect_by_paths(&[
            "/Applications/VoiceToText.app",
            "/Applications/VoiceToText-Dev.app",
        ])
        .is_some()
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

#[tauri::command(async)]
pub fn voice_to_text_toggle() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
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
    #[cfg(not(target_os = "macos"))]
    {
        Err("Voice dictation is not available on this platform".into())
    }
}
