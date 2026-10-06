// Linux: an app is found the way a desktop session finds it — a launcher on
// PATH (or in the snap, Toolbox and ~/.local/bin folders a GUI session may not
// have on PATH), a Flatpak export, a desktop entry, or an AppImage — and started
// directly with its own arguments, since there is no `open -a`.
//
// A detected launcher is its argv joined by NUL (see `launcher`), so a desktop
// entry's fixed flags travel with it through the shared path string.
#[path = "openin_linux_xdg.rs"]
mod xdg;

use super::{file_args, is_vscode_family, launcher, run, InstalledApp};
use std::path::{Path, PathBuf};
use xdg::{find_desktop, home, icon_uri};

struct App {
    id: &'static str,
    bins: &'static [&'static str],
    flatpaks: &'static [&'static str],
    /// Desktop-entry file names; a trailing `*` matches by prefix, since
    /// JetBrains Toolbox suffixes its entries with a hash.
    desktops: &'static [&'static str],
    /// Lowercase file-name prefixes of an AppImage kept in the usual folders.
    appimages: &'static [&'static str],
}

const fn app(
    id: &'static str,
    bins: &'static [&'static str],
    flatpaks: &'static [&'static str],
    desktops: &'static [&'static str],
) -> App {
    App {
        id,
        bins,
        flatpaks,
        desktops,
        appimages: &[],
    }
}

const APPS: &[App] = &[
    App {
        appimages: &["cursor"],
        ..app(
            "cursor",
            &["cursor"],
            &[],
            &["cursor.desktop", "co.anysphere.cursor.desktop"],
        )
    },
    app(
        "vscode",
        &["code"],
        &["com.visualstudio.code"],
        &["code.desktop", "code_code.desktop"],
    ),
    app(
        "vscode-insiders",
        &["code-insiders"],
        &[],
        &[
            "code-insiders.desktop",
            "code-insiders_code-insiders.desktop",
        ],
    ),
    app("windsurf", &["windsurf"], &[], &["windsurf.desktop"]),
    app(
        "zed",
        &["zed", "zeditor", "zedit"],
        &["dev.zed.Zed"],
        &["dev.zed.Zed.desktop"],
    ),
    app(
        "sublime-text",
        &["subl"],
        &["com.sublimetext.three"],
        &["sublime_text.desktop"],
    ),
    app(
        "webstorm",
        &["webstorm"],
        &["com.jetbrains.WebStorm"],
        &["jetbrains-webstorm*", "webstorm_webstorm.desktop"],
    ),
    app(
        "intellij-idea",
        &["idea", "intellij-idea-ultimate", "intellij-idea-community"],
        &[
            "com.jetbrains.IntelliJ-IDEA-Ultimate",
            "com.jetbrains.IntelliJ-IDEA-Community",
        ],
        &[
            "jetbrains-idea*",
            "intellij-idea-ultimate_intellij-idea-ultimate.desktop",
            "intellij-idea-community_intellij-idea-community.desktop",
        ],
    ),
    app(
        "pycharm",
        &["pycharm", "pycharm-professional", "pycharm-community"],
        &[
            "com.jetbrains.PyCharm-Professional",
            "com.jetbrains.PyCharm-Community",
        ],
        &[
            "jetbrains-pycharm*",
            "pycharm-professional_pycharm-professional.desktop",
            "pycharm-community_pycharm-community.desktop",
        ],
    ),
    app(
        "goland",
        &["goland"],
        &["com.jetbrains.GoLand"],
        &["jetbrains-goland*", "goland_goland.desktop"],
    ),
    app(
        "rustrover",
        &["rustrover"],
        &["com.jetbrains.RustRover"],
        &["jetbrains-rustrover*", "rustrover_rustrover.desktop"],
    ),
    app(
        "clion",
        &["clion"],
        &["com.jetbrains.CLion"],
        &["jetbrains-clion*", "clion_clion.desktop"],
    ),
    app(
        "phpstorm",
        &["phpstorm"],
        &["com.jetbrains.PhpStorm"],
        &["jetbrains-phpstorm*", "phpstorm_phpstorm.desktop"],
    ),
    app(
        "rubymine",
        &["rubymine"],
        &["com.jetbrains.RubyMine"],
        &["jetbrains-rubymine*", "rubymine_rubymine.desktop"],
    ),
    app(
        "rider",
        &["rider"],
        &["com.jetbrains.Rider"],
        &["jetbrains-rider*", "rider_rider.desktop"],
    ),
    app(
        "typora",
        &["typora"],
        &["io.typora.Typora"],
        &["typora.desktop"],
    ),
    app(
        "gnome-terminal",
        &["gnome-terminal"],
        &[],
        &["org.gnome.Terminal.desktop"],
    ),
    app(
        "ptyxis",
        &["ptyxis"],
        &["app.devsuite.Ptyxis"],
        &["org.gnome.Ptyxis.desktop", "app.devsuite.Ptyxis.desktop"],
    ),
    app("konsole", &["konsole"], &[], &["org.kde.konsole.desktop"]),
    app(
        "xfce4-terminal",
        &["xfce4-terminal"],
        &[],
        &["xfce4-terminal.desktop"],
    ),
    app(
        "ghostty",
        &["ghostty"],
        &[],
        &["com.mitchellh.ghostty.desktop"],
    ),
    app("kitty", &["kitty"], &[], &["kitty.desktop"]),
    app(
        "alacritty",
        &["alacritty"],
        &[],
        &["Alacritty.desktop", "org.alacritty.Alacritty.desktop"],
    ),
    app(
        "wezterm",
        &["wezterm"],
        &["org.wezfurlong.wezterm"],
        &["org.wezfurlong.wezterm.desktop"],
    ),
    App {
        appimages: &["warp"],
        ..app("warp", &["warp-terminal"], &[], &["dev.warp.Warp.desktop"])
    },
    app("xterm", &["xterm"], &[], &["xterm.desktop"]),
    app(
        "finder",
        &["xdg-open", "gio"],
        &[],
        &["org.gnome.Nautilus.desktop", "org.kde.dolphin.desktop"],
    ),
];

/// Where a launcher lives when a GUI session's PATH leaves it out.
fn extra_bin_dirs() -> Vec<PathBuf> {
    let home = home();
    vec![
        home.join(".local/bin"),
        PathBuf::from("/snap/bin"),
        home.join(".local/share/JetBrains/Toolbox/scripts"),
        PathBuf::from("/usr/local/bin"),
    ]
}

/// A GUI app never lives in an `sbin`, and one that does can share an editor's
/// name: ZFS's event daemon is `/usr/sbin/zed`.
fn find_bin(bins: &[&str]) -> Option<String> {
    let in_sbin = |p: &Path| p.components().any(|c| c.as_os_str() == "sbin");
    bins.iter()
        .find_map(|bin| {
            crate::sys::find_on_path(bin)
                .into_iter()
                .chain(extra_bin_dirs().into_iter().map(|d| d.join(bin)))
                .find(|p| p.is_file() && !in_sbin(p))
        })
        .map(|p| p.to_string_lossy().into_owned())
}

fn find_flatpak(ids: &[&str]) -> Option<String> {
    let roots = [
        PathBuf::from("/var/lib/flatpak/exports/bin"),
        home().join(".local/share/flatpak/exports/bin"),
    ];
    ids.iter()
        .flat_map(|id| roots.iter().map(move |r| r.join(id)))
        .find(|p| p.is_file())
        .map(|p| p.to_string_lossy().into_owned())
}

fn find_appimage(prefixes: &[&str]) -> Option<String> {
    if prefixes.is_empty() {
        return None;
    }
    let home = home();
    let mut found: Vec<PathBuf> = [
        home.join("Applications"),
        home.join("AppImages"),
        home.join(".local/bin"),
    ]
    .iter()
    .filter_map(|d| std::fs::read_dir(d).ok())
    .flatten()
    .flatten()
    .filter(|e| {
        let name = e.file_name().to_string_lossy().to_lowercase();
        name.ends_with(".appimage") && prefixes.iter().any(|p| name.starts_with(p))
    })
    .map(|e| e.path())
    .filter(|p| p.is_file())
    .collect();
    found.sort();
    found.pop().map(|p| p.to_string_lossy().into_owned())
}

fn spec(id: &str) -> Option<&'static App> {
    APPS.iter().find(|a| a.id == id)
}

/// The app's launcher, or None when not installed.
pub(crate) fn detect(id: &str) -> Option<String> {
    let app = spec(id)?;
    find_bin(app.bins)
        .or_else(|| find_flatpak(app.flatpaks))
        .or_else(|| find_desktop(app.desktops).and_then(|e| e.launcher()))
        .or_else(|| find_appimage(app.appimages))
}

/// The icon the app's desktop entry names, from the hicolor theme or pixmaps.
pub(crate) fn system_icon(id: &str) -> Option<String> {
    icon_uri(&find_desktop(spec(id)?.desktops)?.icon?)
}

/// How a terminal is told where to start; None for an app that takes the
/// folder itself as its argument.
fn terminal_args(id: &str, dir: &str) -> Option<Vec<String>> {
    let args = match id {
        "gnome-terminal" | "xfce4-terminal" | "ghostty" => {
            vec![format!("--working-directory={dir}")]
        }
        "ptyxis" => vec![
            "--new-window".to_string(),
            format!("--working-directory={dir}"),
        ],
        "konsole" => vec!["--workdir".to_string(), dir.to_string()],
        "kitty" => vec!["--directory".to_string(), dir.to_string()],
        "alacritty" => vec!["--working-directory".to_string(), dir.to_string()],
        "wezterm" => vec!["start".to_string(), "--cwd".to_string(), dir.to_string()],
        "warp" => vec![format!(
            "warp://action/new_window?path={}",
            urlencoding::encode(dir)
        )],
        "xterm" => Vec::new(),
        _ => return None,
    };
    Some(args)
}

fn open_dir(id: &str, app_path: &str, dir: &str) -> Result<(), String> {
    if id == "finder" {
        return crate::files::open_default(dir);
    }
    let mut c = launcher(app_path);
    match terminal_args(id, dir) {
        Some(args) => c.args(args).current_dir(dir),
        None => c.arg(dir),
    };
    run(&mut c)
}

pub(crate) fn open_folder(app: &InstalledApp, path: &str) -> Result<(), String> {
    open_dir(app.id, &app.path, path)
}

/// VS Code-family launchers take the editor's own CLI flags directly.
pub(crate) fn vscode_cli(id: &str, app_path: &str) -> Option<String> {
    is_vscode_family(id).then(|| app_path.to_string())
}

pub(crate) fn open_file_with(
    id: &str,
    app_path: &str,
    abs: &str,
    line: i64,
    col: i64,
) -> Result<(), String> {
    if id == "finder" {
        return crate::files::reveal(abs);
    }
    if terminal_args(id, "").is_some() {
        let dir = Path::new(abs).parent().unwrap_or(Path::new("/"));
        return open_dir(id, app_path, &dir.to_string_lossy());
    }
    run(launcher(app_path).args(file_args(id, abs, line, col)))
}

/// No editor picked and none with a line recipe installed.
pub(crate) fn open_default(abs: &str) -> Result<(), String> {
    crate::files::open_default(abs)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn terminals_start_in_the_folder() {
        assert_eq!(
            terminal_args("gnome-terminal", "/p q"),
            Some(vec!["--working-directory=/p q".to_string()])
        );
        assert_eq!(
            terminal_args("wezterm", "/p"),
            Some(vec!["start".into(), "--cwd".into(), "/p".into()])
        );
        assert_eq!(
            terminal_args("warp", "/a b"),
            Some(vec!["warp://action/new_window?path=%2Fa%20b".to_string()])
        );
        assert_eq!(terminal_args("vscode", "/p"), None);
    }
}
