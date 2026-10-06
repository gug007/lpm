// Which release asset a Linux or Windows desktop downloads when a newer lpm is
// out. These builds don't replace themselves — a deb or rpm belongs to the
// package manager, and Windows won't let a running .exe be swapped — so an
// update is a notice that links this machine's installer.

// Each platform constructs only its own kinds.
#[allow(dead_code)]
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Installer {
    Deb,
    Rpm,
    AppImage,
    WindowsSetup,
}

impl Installer {
    /// Accepted file-name endings, most preferred first (lowercase).
    fn suffixes(self) -> &'static [&'static str] {
        match self {
            Installer::Deb => &[".deb"],
            Installer::Rpm => &[".rpm"],
            Installer::AppImage => &[".appimage"],
            Installer::WindowsSetup => &["setup.exe", ".msi", ".exe"],
        }
    }
}

const X64: &[&str] = &["amd64", "x86_64", "x64"];
const ARM64: &[&str] = &["arm64", "aarch64"];

fn arch_tokens(arch: &str) -> &'static [&'static str] {
    match arch {
        "x86_64" => X64,
        "aarch64" => ARM64,
        _ => &[],
    }
}

fn names_any(name: &str, tokens: &[&str]) -> bool {
    tokens.iter().any(|t| name.contains(t))
}

/// The asset to install for `kind` on `arch` (`std::env::consts::ARCH`): one
/// naming this arch, else one naming no arch at all. The standalone CLI and the
/// headless host bundle are never installers.
pub fn pick<'a>(names: &[&'a str], kind: Installer, arch: &str) -> Option<&'a str> {
    let ours = arch_tokens(arch);
    for suffix in kind.suffixes() {
        let candidates: Vec<(&str, String)> = names
            .iter()
            .map(|n| (*n, n.to_ascii_lowercase()))
            .filter(|(_, l)| l.ends_with(suffix) && !l.contains("cli") && !l.contains("host"))
            .collect();
        let exact = candidates.iter().find(|(_, l)| names_any(l, ours));
        let neutral = candidates
            .iter()
            .find(|(_, l)| !names_any(l, X64) && !names_any(l, ARM64));
        if let Some((name, _)) = exact.or(neutral) {
            return Some(name);
        }
    }
    None
}

/// The package format this Linux machine installs: the AppImage it runs from,
/// else its distro family's (from /etc/os-release `ID` and `ID_LIKE`), else an
/// AppImage, which runs anywhere.
#[cfg(any(not(windows), test))]
pub fn linux_installer(appimage: bool, os_release: &str) -> Installer {
    if appimage {
        return Installer::AppImage;
    }
    let ids: Vec<String> = os_release
        .lines()
        .filter_map(|l| l.strip_prefix("ID=").or_else(|| l.strip_prefix("ID_LIKE=")))
        .flat_map(|v| {
            v.trim()
                .trim_matches(|c| c == '"' || c == '\'')
                .split_whitespace()
                .map(str::to_ascii_lowercase)
                .collect::<Vec<_>>()
        })
        .collect();
    let any = |family: &[&str]| ids.iter().any(|id| family.contains(&id.as_str()));
    if any(&["debian", "ubuntu"]) {
        Installer::Deb
    } else if any(&["fedora", "rhel", "centos", "suse", "opensuse"]) {
        Installer::Rpm
    } else {
        Installer::AppImage
    }
}

#[cfg(not(target_os = "macos"))]
pub fn current() -> Installer {
    #[cfg(windows)]
    return Installer::WindowsSetup;
    #[cfg(not(windows))]
    linux_installer(
        crate::daemonlaunch::running_appimage().is_some(),
        &std::fs::read_to_string("/etc/os-release").unwrap_or_default(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    // Tauri's default bundle names plus the existing macOS and host assets.
    const ASSETS: &[&str] = &[
        "lpm-desktop-macos-arm64.dmg",
        "lpm-desktop-macos-amd64.dmg",
        "lpm-host-linux-amd64.tar.gz",
        "lpm_1.4.0_amd64.deb",
        "lpm_1.4.0_arm64.deb",
        "lpm-1.4.0-1.x86_64.rpm",
        "lpm-1.4.0-1.aarch64.rpm",
        "lpm_1.4.0_amd64.AppImage",
        "lpm_1.4.0_aarch64.AppImage",
        "lpm_1.4.0_x64-setup.exe",
        "lpm_1.4.0_arm64-setup.exe",
        "lpm_1.4.0_x64_en-US.msi",
    ];

    #[test]
    fn picks_the_installer_for_each_platform_and_arch() {
        let cases = [
            (Installer::Deb, "x86_64", "lpm_1.4.0_amd64.deb"),
            (Installer::Deb, "aarch64", "lpm_1.4.0_arm64.deb"),
            (Installer::Rpm, "x86_64", "lpm-1.4.0-1.x86_64.rpm"),
            (Installer::Rpm, "aarch64", "lpm-1.4.0-1.aarch64.rpm"),
            (Installer::AppImage, "x86_64", "lpm_1.4.0_amd64.AppImage"),
            (Installer::AppImage, "aarch64", "lpm_1.4.0_aarch64.AppImage"),
            (Installer::WindowsSetup, "x86_64", "lpm_1.4.0_x64-setup.exe"),
            (
                Installer::WindowsSetup,
                "aarch64",
                "lpm_1.4.0_arm64-setup.exe",
            ),
        ];
        for (kind, arch, want) in cases {
            assert_eq!(pick(ASSETS, kind, arch), Some(want), "{kind:?} {arch}");
        }
    }

    #[test]
    fn falls_back_to_msi_then_an_arch_neutral_asset() {
        let names = ["lpm_1.4.0_x64_en-US.msi", "lpm-cli-windows-amd64.exe"];
        assert_eq!(
            pick(&names, Installer::WindowsSetup, "x86_64"),
            Some("lpm_1.4.0_x64_en-US.msi")
        );
        assert_eq!(
            pick(&["lpm.deb"], Installer::Deb, "aarch64"),
            Some("lpm.deb")
        );
        // An installer built for the other arch is never offered.
        assert_eq!(
            pick(&["lpm_1.4.0_amd64.deb"], Installer::Deb, "aarch64"),
            None
        );
    }

    #[test]
    fn nothing_to_offer_without_this_platforms_assets() {
        let mac_only = ["lpm-desktop-macos-arm64.dmg", "lpm-host-linux-amd64.tar.gz"];
        assert_eq!(pick(&mac_only, Installer::Deb, "x86_64"), None);
        assert_eq!(pick(&mac_only, Installer::WindowsSetup, "x86_64"), None);
    }

    #[test]
    fn linux_package_follows_the_distro_family() {
        let ubuntu = "NAME=\"Ubuntu\"\nID=ubuntu\nID_LIKE=debian\n";
        let mint = "ID=linuxmint\nID_LIKE=\"ubuntu debian\"\n";
        let rocky = "ID=\"rocky\"\nID_LIKE=\"rhel centos fedora\"\n";
        let tumbleweed = "ID=\"opensuse-tumbleweed\"\nID_LIKE=\"opensuse suse\"\n";
        let arch = "NAME=\"Arch Linux\"\nID=arch\n";
        assert_eq!(linux_installer(false, ubuntu), Installer::Deb);
        assert_eq!(linux_installer(false, mint), Installer::Deb);
        assert_eq!(linux_installer(false, rocky), Installer::Rpm);
        assert_eq!(linux_installer(false, "ID=fedora\n"), Installer::Rpm);
        assert_eq!(linux_installer(false, tumbleweed), Installer::Rpm);
        assert_eq!(linux_installer(false, arch), Installer::AppImage);
        assert_eq!(linux_installer(false, ""), Installer::AppImage);
        // Running from an AppImage keeps the user on AppImages.
        assert_eq!(linux_installer(true, ubuntu), Installer::AppImage);
    }
}
