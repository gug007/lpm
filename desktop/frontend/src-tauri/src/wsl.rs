// WSL: projects that live in a distro's own Linux file system. Such a project's
// root is the folder's Windows name, `\\wsl.localhost\<distro>\home\…`, so
// Windows reads its files as it reads any folder, while its services,
// terminals, agents and git run inside the distro on the Linux path, where its
// dependencies, symlinks and file watching work. Only Windows has roots like
// that, so nothing changes anywhere else.
#![cfg_attr(not(windows), allow(dead_code))]

use std::collections::BTreeMap;

/// A WSL folder: the distro it is in and its Linux path there.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Target {
    pub distro: String,
    pub linux: String,
}

/// The two names Windows gives a distro's files.
const HOSTS: [&str; 2] = ["wsl.localhost", "wsl$"];

/// `\\wsl.localhost\Ubuntu\home\dana\app` (or `\\wsl$\…`, with either slash, or
/// the `\\?\UNC\…` form) as its distro and Linux path. None for any other path.
pub fn parse(path: &str) -> Option<Target> {
    let path = path.trim().replace('/', "\\");
    let rest = path
        .strip_prefix(r"\\?\UNC\")
        .or_else(|| path.strip_prefix(r"\\"))?;
    let mut parts = rest.split('\\').filter(|p| !p.is_empty());
    let host = parts.next()?;
    if !HOSTS.iter().any(|h| h.eq_ignore_ascii_case(host)) {
        return None;
    }
    let distro = parts.next()?.to_string();
    let linux: Vec<&str> = parts.collect();
    Some(Target {
        distro,
        linux: format!("/{}", linux.join("/")),
    })
}

/// The Windows name of a Linux path in `distro`: a drive mounted under
/// /mnt/<letter> is that drive, anything else is in the distro's own files.
pub fn windows_path(distro: &str, linux: &str) -> String {
    if let Some(drive) = mounted_drive(linux) {
        return drive;
    }
    let rest = linux.trim_matches('/').replace('/', "\\");
    if rest.is_empty() {
        format!(r"\\wsl.localhost\{distro}")
    } else {
        format!(r"\\wsl.localhost\{distro}\{rest}")
    }
}

fn mounted_drive(linux: &str) -> Option<String> {
    let rest = linux.strip_prefix("/mnt/")?;
    let (letter, tail) = rest.split_once('/').unwrap_or((rest, ""));
    let mut chars = letter.chars();
    let (Some(drive), None) = (chars.next(), chars.next()) else {
        return None;
    };
    if !drive.is_ascii_alphabetic() {
        return None;
    }
    let tail = tail.trim_matches('/').replace('/', "\\");
    Some(format!(r"{}:\{tail}", drive.to_ascii_uppercase()))
}

/// The path a distro sees for a Windows path: its own files by their Linux
/// path, a drive's under /mnt/<letter>. None for one it can't reach, such as a
/// network share.
pub fn linux_path(path: &str) -> Option<String> {
    if let Some(target) = parse(path) {
        return Some(target.linux);
    }
    let path = path.trim().replace('\\', "/");
    let mut chars = path.chars();
    let (Some(drive), Some(':')) = (chars.next(), chars.next()) else {
        return None;
    };
    if !drive.is_ascii_alphabetic() {
        return None;
    }
    let tail = path[2..].trim_matches('/');
    let base = format!("/mnt/{}", drive.to_ascii_lowercase());
    Some(if tail.is_empty() {
        base
    } else {
        format!("{base}/{tail}")
    })
}

/// A service's or terminal's `cwd` against the project's Linux root, as it is
/// against any root: an absolute one wins, an empty one is the root.
pub fn join(root: &str, cwd: &str) -> String {
    let cwd = cwd.trim().replace('\\', "/");
    let cwd = cwd.trim_end_matches('/');
    if cwd.is_empty() {
        return root.to_string();
    }
    if cwd.starts_with('/') {
        return cwd.to_string();
    }
    format!("{}/{cwd}", root.trim_end_matches('/'))
}

/// A distro this PC has, as `wsl.exe --list --verbose` lists it.
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Distro {
    pub name: String,
    pub is_default: bool,
    pub version: u8,
    pub running: bool,
}

/// The rows of `wsl.exe --list --verbose`. Its header and state words follow
/// the Windows language, so only a row's shape is read: a `*` on the default,
/// the name, the state, the WSL version last. Docker Desktop's own distros are
/// left out, since nobody keeps projects in them.
pub fn parse_list(text: &str) -> Vec<Distro> {
    text.lines()
        .filter_map(|line| {
            let line = line.trim_matches(|c: char| c.is_whitespace() || c == '\u{feff}' || c == '\0');
            let (is_default, line) = match line.strip_prefix('*') {
                Some(rest) => (true, rest.trim_start()),
                None => (false, line),
            };
            let words: Vec<&str> = line.split_whitespace().collect();
            let [name, state @ .., version] = words.as_slice() else {
                return None;
            };
            let version = version.parse::<u8>().ok()?;
            if state.is_empty() || name.starts_with("docker-desktop") {
                return None;
            }
            Some(Distro {
                name: name.to_string(),
                is_default,
                version,
                running: state.iter().any(|s| s.eq_ignore_ascii_case("running")),
            })
        })
        .collect()
}

/// wsl.exe's own output: UTF-16 unless WSL_UTF8 is set, which older builds
/// ignore. UTF-8 text never holds a NUL, so one means UTF-16.
pub fn decode(bytes: &[u8]) -> String {
    if bytes.contains(&0) {
        let units: Vec<u16> = bytes
            .chunks_exact(2)
            .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
            .collect();
        String::from_utf16_lossy(&units)
    } else {
        String::from_utf8_lossy(bytes).into_owned()
    }
}

/// The line a shell inside the distro runs: into `dir`, `env` exported, then
/// `cmd`, the way an SSH project's lines run on its host.
pub fn script(dir: &str, env: &BTreeMap<String, String>, cmd: &str) -> String {
    let body = crate::config::build_local_script(env, cmd);
    let cd = format!("cd {}", crate::config::shell_quote(dir));
    if body.is_empty() {
        cd
    } else {
        format!("{cd} && {body}")
    }
}

/// wsl.exe's arguments for `script` in the distro's login bash.
pub fn login_args(distro: &str, script: &str) -> Vec<String> {
    ["-d", distro, "--exec", "bash", "-ilc", script]
        .into_iter()
        .map(String::from)
        .collect()
}

/// A service's line for its pane, whose shell is Git Bash: each word quoted
/// again, since the pane's shell parses the line, and MSYS told to leave the
/// Linux paths alone instead of rewriting them into Windows ones.
pub fn pane_line(distro: &str, script: &str) -> String {
    let words: Vec<String> = login_args(distro, script)
        .iter()
        .map(|w| crate::config::shell_quote(w))
        .collect();
    format!("MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' wsl.exe {}", words.join(" "))
}

/// Runs `"$0" "$@"` in a login bash so a tool installed for the user (gh in
/// ~/.local/bin) is found, with what the login prints kept out of its output.
const LOGIN_EXEC: &str = r#"exec bash -lc 'exec 1>&3 3>&-; exec "$0" "$@"' "$@" 3>&1 1>&2"#;

/// wsl.exe's arguments for `program args` in `dir` inside the distro, with
/// `envs` set on it. git comes straight from /usr/bin; anything else is looked
/// up the way the user's shell would.
pub fn tool_args(distro: &str, dir: &str, program: &str, args: &[&str], envs: &[(&str, &str)]) -> Vec<String> {
    let mut out: Vec<String> = ["-d", distro, "--cd", dir, "--exec"]
        .into_iter()
        .map(String::from)
        .collect();
    if program != "git" {
        out.extend(["sh", "-c", LOGIN_EXEC, "sh"].map(String::from));
    }
    out.push("env".into());
    out.extend(envs.iter().map(|(k, v)| format!("{k}={v}")));
    out.push(program.into());
    out.extend(args.iter().map(|a| a.to_string()));
    out
}

#[cfg(windows)]
pub fn exe() -> std::path::PathBuf {
    let root = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into());
    std::path::Path::new(&root).join("System32").join("wsl.exe")
}

/// `program args` run in the WSL folder `cwd`: git and gh for a WSL project.
#[cfg(windows)]
pub fn tool_command(target: &Target, program: &str, args: &[&str], envs: &[(&str, &str)]) -> std::process::Command {
    let mut cmd = crate::osproc::command(exe());
    cmd.args(tool_args(&target.distro, &target.linux, program, args, envs));
    cmd
}

/// The distros on this PC, the default first. Empty without WSL.
#[cfg(windows)]
pub fn distros() -> Vec<Distro> {
    let out = crate::osproc::command(exe())
        .args(["--list", "--verbose"])
        .env("WSL_UTF8", "1")
        .output();
    let mut list = match out {
        Ok(out) if out.status.success() => parse_list(&decode(&out.stdout)),
        _ => Vec::new(),
    };
    list.sort_by_key(|d| !d.is_default);
    list
}

/// The Windows name of the distro user's home folder.
#[cfg(windows)]
pub fn home(distro: &str) -> Result<String, String> {
    let out = crate::osproc::command(exe())
        .args(["-d", distro, "--exec", "sh", "-c", "printf %s \"$HOME\""])
        .env("WSL_UTF8", "1")
        .output()
        .map_err(|e| format!("couldn't run wsl.exe: {e}"))?;
    let linux = decode(&out.stdout).trim().to_string();
    if !out.status.success() || !linux.starts_with('/') {
        let why = decode(&out.stderr).trim().to_string();
        return Err(if why.is_empty() {
            format!("{distro} didn't start")
        } else {
            why
        });
    }
    Ok(windows_path(distro, &linux))
}

/// The distros the Add a project › WSL folder screen lists.
#[tauri::command(async)]
pub fn wsl_distros() -> Vec<Distro> {
    #[cfg(windows)]
    return distros();
    #[cfg(not(windows))]
    Vec::new()
}

/// Where the folder picker opens for a distro: its user's home.
#[tauri::command(async)]
pub fn wsl_home(distro: String) -> Result<String, String> {
    #[cfg(windows)]
    return home(&distro);
    #[cfg(not(windows))]
    Err(format!("{distro}: WSL is only on Windows"))
}

#[cfg(test)]
#[path = "wsl_tests.rs"]
mod tests;
