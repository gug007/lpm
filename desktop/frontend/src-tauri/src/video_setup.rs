// What the composer's Video button needs on a Mac before its first video: the
// explaincast skill and the tools that skill records with. Checked as a whole,
// installed one part at a time so the setup window can show each part's turn.
use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VideoSetupPart {
    pub id: &'static str,
    pub ready: bool,
    /// Missing, and lpm can't install it until Homebrew is there.
    pub needs_homebrew: bool,
    /// The agent CLI still without a part another agent CLI already has.
    pub share_with: Option<&'static str>,
}

#[cfg(not(target_os = "macos"))]
pub(crate) const NOT_MAC: &str = "Videos record on a Mac";

#[tauri::command]
pub async fn video_setup_check() -> Result<Vec<VideoSetupPart>, String> {
    #[cfg(target_os = "macos")]
    {
        tauri::async_runtime::spawn_blocking(mac::check)
            .await
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err(NOT_MAC.into())
    }
}

// An install can wait minutes on a download or on Apple's installer, so it
// holds a blocking thread rather than one of the async runtime's workers.
#[tauri::command]
pub async fn video_setup_install(part: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        tauri::async_runtime::spawn_blocking(move || mac::install(&part))
            .await
            .map_err(|e| e.to_string())?
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = part;
        Err(NOT_MAC.into())
    }
}

/// Whether a Playwright browsers folder holds a downloaded Chromium (not just
/// its headless shell).
#[cfg(any(target_os = "macos", test))]
fn chromium_in(browsers: &std::path::Path) -> bool {
    std::fs::read_dir(browsers)
        .map(|entries| {
            entries.flatten().any(|e| {
                e.file_name().to_string_lossy().starts_with("chromium-") && e.path().is_dir()
            })
        })
        .unwrap_or(false)
}

// The files explaincast's local voice (scripts/lib/local.js) looks for: its
// runtime, and the speech and word-timing models.
#[cfg(any(target_os = "macos", test))]
const VOICE_FILES: [&str; 4] = [
    "node_modules/kokoro-js/package.json",
    "models/onnx-community/Kokoro-82M-v1.0-ONNX/onnx/model.onnx",
    "models/onnx-community/whisper-small.en_timestamped/onnx/encoder_model_quantized.onnx",
    "models/onnx-community/whisper-small.en_timestamped/onnx/decoder_model_merged_quantized.onnx",
];

#[cfg(any(target_os = "macos", test))]
fn voice_in(home: &std::path::Path) -> bool {
    VOICE_FILES.iter().all(|f| home.join(f).is_file())
}

#[cfg(target_os = "macos")]
mod mac {
    use super::{chromium_in, voice_in, VideoSetupPart};
    use crate::lpm_commands::{agents_skills_dir, claude_skills_dir, global_store, CommandFs};
    use crate::{osproc, sys};
    use std::path::{Path, PathBuf};
    use std::process::Command;
    use std::time::{Duration, Instant};

    const SKILL: &str = "explaincast";
    const SKILL_TARBALL: &str = "https://codeload.github.com/gug007/explaincast/tar.gz/HEAD";
    const NEEDS_HOMEBREW: &str = "Needs Homebrew first, from brew.sh";
    const APPLE_WAIT: Duration = Duration::from_secs(45 * 60);
    // Where explaincast finds Playwright under a global npm root.
    const CORE_PATHS: [&str; 4] = [
        "playwright-core",
        "@playwright/cli/node_modules/playwright-core",
        "playwright/node_modules/playwright-core",
        "@playwright/test/node_modules/playwright-core",
    ];
    const VOICE_SETUP: &str =
        "require(process.argv[1]).setup().then(()=>process.exit(0),e=>{console.error(e.message);process.exit(1)})";

    fn caches() -> PathBuf {
        dirs::home_dir()
            .unwrap_or_default()
            .join("Library")
            .join("Caches")
    }

    fn agents_skill() -> PathBuf {
        agents_skills_dir().join(SKILL)
    }

    fn claude_skill() -> PathBuf {
        claude_skills_dir().join(SKILL)
    }

    fn has_skill(dir: &Path) -> bool {
        dir.join("SKILL.md").is_file()
    }

    // Codex also reads the skills under its own home.
    fn codex_home_skill() -> Option<PathBuf> {
        crate::agentdirs::codex_home()
            .map(|home| home.join("skills").join(SKILL))
            .filter(|dir| has_skill(dir))
    }

    fn codex_has_skill() -> bool {
        has_skill(&agents_skill()) || codex_home_skill().is_some()
    }

    fn has_node() -> bool {
        sys::which("node") && sys::which("npm")
    }

    fn require_node() -> Result<(), String> {
        if has_node() {
            Ok(())
        } else {
            Err("Needs Node.js first".into())
        }
    }

    fn xcode_tools() -> bool {
        osproc::command("/usr/bin/xcode-select")
            .arg("-p")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    // The root beside the `node` binary first, and `npm root -g` (a slow npm
    // start) only when Playwright isn't there.
    fn playwright_core() -> Option<PathBuf> {
        let core_in = |root: PathBuf| {
            CORE_PATHS
                .iter()
                .map(|rel| root.join(rel))
                .find(|dir| dir.join("package.json").is_file())
        };
        let beside_node = sys::find_on_path("node").and_then(|node| {
            node.parent()
                .map(|bin| bin.join("..").join("lib").join("node_modules"))
        });
        beside_node.and_then(core_in).or_else(|| {
            let out = osproc::command("npm").args(["root", "-g"]).output().ok()?;
            let root = String::from_utf8_lossy(&out.stdout).trim().to_string();
            (out.status.success() && !root.is_empty())
                .then(|| PathBuf::from(root))
                .and_then(core_in)
        })
    }

    fn browsers_dir() -> PathBuf {
        std::env::var_os("PLAYWRIGHT_BROWSERS_PATH")
            .map(PathBuf::from)
            .unwrap_or_else(|| caches().join("ms-playwright"))
    }

    pub fn check() -> Vec<VideoSetupPart> {
        let homebrew = sys::which("brew");
        let node = has_node();
        let ffmpeg = sys::which("ffmpeg") && sys::which("ffprobe");
        let from_brew = |ready: bool| !ready && !homebrew;
        // Chromium and the voice need Node, which comes from Homebrew.
        let after_node = |ready: bool| !ready && from_brew(node);
        let chromium = node && chromium_in(&browsers_dir()) && playwright_core().is_some();
        let voice = voice_in(&caches().join("explaincast").join("voice"));
        vec![
            skill_part(),
            part("node", node, from_brew(node)),
            part("ffmpeg", ffmpeg, from_brew(ffmpeg)),
            part("chromium", chromium, after_node(chromium)),
            part("voice", voice, after_node(voice)),
            part("xcodeTools", xcode_tools(), false),
        ]
    }

    fn part(id: &'static str, ready: bool, needs_homebrew: bool) -> VideoSetupPart {
        VideoSetupPart {
            id,
            ready,
            needs_homebrew,
            share_with: None,
        }
    }

    fn skill_part() -> VideoSetupPart {
        let codex = codex_has_skill();
        let claude = has_skill(&claude_skill());
        VideoSetupPart {
            share_with: match (codex, claude) {
                (false, true) => Some("Codex"),
                (true, false) => Some("Claude Code"),
                _ => None,
            },
            ..part("skill", codex && claude, false)
        }
    }

    pub fn install(part: &str) -> Result<(), String> {
        match part {
            "skill" => install_skill(),
            "node" => brew_install("node"),
            "ffmpeg" => brew_install("ffmpeg"),
            "xcodeTools" => install_xcode_tools(),
            "chromium" => install_chromium(),
            "voice" => install_voice(),
            other => Err(format!("Unknown part: {other}")),
        }
    }

    fn run(cmd: &mut Command) -> Result<(), String> {
        let out = cmd.output().map_err(|e| e.to_string())?;
        if out.status.success() {
            return Ok(());
        }
        let text = if out.stderr.is_empty() {
            &out.stdout
        } else {
            &out.stderr
        };
        Err(crate::config::trim_tail(text, 300))
    }

    // Codex reads ~/.agents/skills and Claude Code its own skills folder. A copy
    // Claude already has is shared with Codex by a link, so a skill someone keeps
    // in their own clone stays theirs; lpm links its own copy into Claude's
    // folder the way it links every skill it keeps.
    fn install_skill() -> Result<(), String> {
        let claude = claude_skill();
        if !codex_has_skill() {
            match std::fs::canonicalize(&claude) {
                Ok(real) if has_skill(&real) => link(&real, &agents_skill())?,
                _ => download_skill(&agents_skill())?,
            }
        }
        if has_skill(&claude) {
            return Ok(());
        }
        // lpm leaves a skill in Codex's own folder out of Claude's, so that
        // one is linked here.
        match codex_home_skill().filter(|_| !has_skill(&agents_skill())) {
            Some(codex) => link(&codex, &claude)?,
            None => global_store().link_claude(SKILL)?,
        }
        if has_skill(&claude) {
            Ok(())
        } else {
            Err(in_the_way(&claude))
        }
    }

    fn in_the_way(at: &Path) -> String {
        format!("{} is in the way: it holds no SKILL.md", at.display())
    }

    fn create_parent(path: &Path) -> Result<(), String> {
        match path.parent() {
            Some(parent) => std::fs::create_dir_all(parent).map_err(|e| e.to_string()),
            None => Ok(()),
        }
    }

    fn link(target: &Path, at: &Path) -> Result<(), String> {
        if at.symlink_metadata().is_ok() {
            return Err(in_the_way(at));
        }
        create_parent(at)?;
        crate::lpm_commands_local::link_dir(target, at).map_err(|e| e.to_string())
    }

    fn download_skill(dest: &Path) -> Result<(), String> {
        let tmp = tempfile::Builder::new()
            .prefix("lpm-explaincast-")
            .tempdir()
            .map_err(|e| e.to_string())?;
        let tgz = tmp.path().join("explaincast.tgz");
        run(osproc::command("/usr/bin/curl")
            .args(["-fsSL", "--retry", "2", "-o"])
            .arg(&tgz)
            .arg(SKILL_TARBALL))?;
        run(osproc::command("/usr/bin/tar")
            .arg("-xzf")
            .arg(&tgz)
            .arg("-C")
            .arg(tmp.path()))?;
        let src = std::fs::read_dir(tmp.path())
            .map_err(|e| e.to_string())?
            .flatten()
            .map(|e| e.path().join("skills").join(SKILL))
            .find(|p| has_skill(p))
            .ok_or("The download holds no explaincast skill")?;
        create_parent(dest)?;
        run(osproc::command("/usr/bin/ditto").arg(&src).arg(dest))
    }

    fn brew_install(formula: &str) -> Result<(), String> {
        let brew = sys::find_on_path("brew").ok_or(NEEDS_HOMEBREW)?;
        run(osproc::command(brew)
            .args(["install", formula])
            .env("HOMEBREW_NO_AUTO_UPDATE", "1")
            .env("NONINTERACTIVE", "1"))
    }

    // Apple's installer is its own window: ask for it, then wait for the
    // person to finish it there.
    fn install_xcode_tools() -> Result<(), String> {
        if xcode_tools() {
            return Ok(());
        }
        let _ = osproc::command("/usr/bin/xcode-select")
            .arg("--install")
            .output();
        let started = Instant::now();
        while started.elapsed() < APPLE_WAIT {
            if xcode_tools() {
                return Ok(());
            }
            std::thread::sleep(Duration::from_secs(5));
        }
        Err("Apple's installer didn't finish. Run it again from here when it's done.".into())
    }

    fn install_chromium() -> Result<(), String> {
        require_node()?;
        let core = match playwright_core() {
            Some(core) => core,
            None => {
                run(osproc::command("npm").args(["install", "-g", "@playwright/cli"]))?;
                playwright_core().ok_or("Playwright installed, but lpm can't find it")?
            }
        };
        run(osproc::command("node")
            .arg(core.join("cli.js"))
            .args(["install", "chromium"]))
    }

    // The skill sets its own voice up, the same way its first video would.
    fn install_voice() -> Result<(), String> {
        require_node()?;
        let skill = [agents_skill(), claude_skill()]
            .into_iter()
            .find(|dir| has_skill(dir))
            .ok_or("Needs the explaincast skill first")?;
        let local = std::fs::canonicalize(&skill)
            .map_err(|e| e.to_string())?
            .join("scripts")
            .join("lib")
            .join("local.js");
        if !local.is_file() {
            return Err("This explaincast has no local voice: update the skill".into());
        }
        run(osproc::command("node")
            .args(["-e", VOICE_SETUP])
            .arg(&local))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chromium_needs_the_browser_not_just_the_headless_shell() {
        let dir = tempfile::tempdir().unwrap();
        assert!(!chromium_in(dir.path()));
        std::fs::create_dir(dir.path().join("chromium_headless_shell-1217")).unwrap();
        assert!(!chromium_in(dir.path()));
        std::fs::create_dir(dir.path().join("chromium-1217")).unwrap();
        assert!(chromium_in(dir.path()));
        assert!(!chromium_in(&dir.path().join("missing")));
    }

    #[test]
    fn voice_needs_its_runtime_and_both_models() {
        let dir = tempfile::tempdir().unwrap();
        for (i, file) in VOICE_FILES.iter().enumerate() {
            assert!(!voice_in(dir.path()), "ready before {file}");
            let path = dir.path().join(file);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(&path, "x").unwrap();
            assert_eq!(voice_in(dir.path()), i == VOICE_FILES.len() - 1);
        }
    }
}
