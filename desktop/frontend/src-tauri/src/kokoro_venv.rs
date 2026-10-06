// Kokoro on Linux lives in its own Python virtual environment in the lpm
// directory. Distributions mark the system Python as externally managed (PEP
// 668), so `pip3 install` into it is refused, and pip itself is often missing.

use std::path::PathBuf;
use std::process::{Command, Output};

fn venv_dir() -> PathBuf {
    crate::config::lpm_dir().join("kokoro")
}

fn venv_python() -> PathBuf {
    venv_dir().join("bin").join("python3")
}

/// The interpreter that has Kokoro: the environment's once it exists, the
/// system one otherwise (a Kokoro the user installed there themselves).
pub fn python() -> Command {
    let venv = venv_python();
    if venv.is_file() {
        crate::osproc::command(venv)
    } else {
        crate::osproc::command("python3")
    }
}

pub fn install() -> Result<(), String> {
    if !venv_python().is_file() {
        let dir = venv_dir();
        let out = crate::osproc::command("python3")
            .arg("-m")
            .arg("venv")
            .arg(&dir)
            .output()
            .map_err(|e| python_missing(&e))?;
        if !out.status.success() {
            let _ = std::fs::remove_dir_all(&dir);
            return Err(venv_failed(&combined(&out)));
        }
    }
    let out = crate::osproc::command(venv_python())
        .args([
            "-m",
            "pip",
            "install",
            "--disable-pip-version-check",
            "kokoro",
            "soundfile",
        ])
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(format!(
            "pip install failed: {}\n{}",
            out.status,
            combined(&out)
        ));
    }
    Ok(())
}

pub fn uninstall() -> Result<(), String> {
    match std::fs::remove_dir_all(venv_dir()) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("remove {}: {e}", venv_dir().display())),
    }
}

fn python_missing(err: &std::io::Error) -> String {
    if err.kind() == std::io::ErrorKind::NotFound {
        "Kokoro needs Python 3. Install python3 and python3-venv with your package manager, then try again.".into()
    } else {
        format!("start python3: {err}")
    }
}

fn venv_failed(output: &str) -> String {
    if output.contains("ensurepip") {
        "Python can't create the environment Kokoro installs into. Install python3-venv with your package manager (on Debian and Ubuntu: sudo apt install python3-venv), then try again.".into()
    } else {
        format!("python3 -m venv failed:\n{output}")
    }
}

fn combined(out: &Output) -> String {
    let mut s = String::from_utf8_lossy(&out.stdout).into_owned();
    s.push_str(&String::from_utf8_lossy(&out.stderr));
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_python_says_what_to_install() {
        let err = std::io::Error::from(std::io::ErrorKind::NotFound);
        assert!(python_missing(&err).contains("python3-venv"));
    }

    #[test]
    fn a_missing_venv_module_says_what_to_install() {
        let ubuntu = "The virtual environment was not created successfully because ensurepip is not\navailable.";
        assert!(venv_failed(ubuntu).contains("sudo apt install python3-venv"));
        assert!(venv_failed("Error: [Errno 13] Permission denied")
            .starts_with("python3 -m venv failed"));
    }
}
