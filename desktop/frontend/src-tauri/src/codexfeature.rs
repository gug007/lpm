// Which config.toml key turns Codex's hooks on.
//
// Codex 0.124 renamed the `codex_hooks` feature to `hooks`. Releases up to 0.123
// ignore `hooks` (and default `codex_hooks` to off, so no hook ever runs), while
// later ones warn about the old name. So the key follows the Codex installed;
// when its version can't be read, the current name.
use std::sync::OnceLock;

pub const KEY: &str = "hooks";
pub const LEGACY_KEY: &str = "codex_hooks";

/// The key for the Codex whose `codex --version` printed `version_output`.
pub fn key_for(version_output: &str) -> &'static str {
    match version_output.split_whitespace().find_map(parse_version) {
        Some(version) if version < (0, 124) => LEGACY_KEY,
        _ => KEY,
    }
}

/// `0.123.0`, `0.123.0-alpha.2` -> (0, 123).
fn parse_version(word: &str) -> Option<(u32, u32)> {
    let mut parts = word.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    parts.next()?;
    Some((major, minor))
}

/// The key for the Codex on this machine, asked once per run.
pub fn local_key() -> &'static str {
    static KEY_IN_USE: OnceLock<&'static str> = OnceLock::new();
    KEY_IN_USE.get_or_init(|| {
        crate::sys::find_on_path("codex")
            .and_then(|codex| crate::osproc::command(codex).arg("--version").output().ok())
            .map(|out| key_for(&String::from_utf8_lossy(&out.stdout)))
            .unwrap_or(KEY)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hooks_are_switched_on_under_the_name_the_installed_codex_reads() {
        assert_eq!(key_for("codex-cli 0.160.0"), KEY);
        assert_eq!(key_for("codex-cli 0.124.0"), KEY);
        assert_eq!(key_for("codex-cli 0.123.0"), LEGACY_KEY);
        assert_eq!(key_for("codex-cli 0.123.0-alpha.4"), LEGACY_KEY);
        assert_eq!(key_for(""), KEY, "no codex, or no version printed");
        assert_eq!(key_for("codex-cli dev"), KEY);
    }
}
