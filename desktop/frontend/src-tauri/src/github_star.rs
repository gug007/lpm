use std::process::Stdio;

const STARRED_ENDPOINT: &str = "user/starred/gug007/lpm";

/// Whether the account signed in to the `gh` CLI has starred lpm on GitHub.
/// False both when it hasn't and when that can't be told: no `gh`, signed
/// out, or offline.
#[tauri::command(async)]
pub fn github_starred() -> bool {
    crate::git::check_ghcli()
        && crate::osproc::command("gh")
            .args(["api", STARRED_ENDPOINT])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok_and(|status| status.success())
}
