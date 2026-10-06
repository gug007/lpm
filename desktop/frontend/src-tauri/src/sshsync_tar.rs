// Windows backend for sync-mode mirrors. Windows ships no rsync, and the
// cwRsync/MSYS builds read `C:\...` as a remote host, so the mirror moves tar
// streams over the ssh exec channel instead: the host runs the POSIX `tar` every
// SSH host has, and this side reads and writes the archive itself.
//
// rsync's contract is kept where it matters: `--update` (a file newer on the
// receiving side is never clobbered), no deletions in either direction, and a
// push sends only files whose size or mtime moved since the last sync (rsync's
// quick check, against a manifest of what that sync left in the mirror).
// Directories named in IGNORED_WATCH_DIRS are not mirrored: they hold
// platform-specific build output and dependencies, and without rsync's delta
// transfer every pull would re-send them whole. A file with one of those names
// (a `build` script) is mirrored like any other.
#![cfg_attr(not(windows), allow(dead_code))]
use crate::config::{self, SshSettings};
use std::collections::HashMap;
use std::io::{self, Read, Write};
use std::path::{Component, Path};
use std::process::{ChildStderr, Command, Stdio};
use std::thread::JoinHandle;
use std::time::UNIX_EPOCH;

#[derive(Clone, Copy, PartialEq, Debug)]
struct Stamp {
    mtime: u64,
    len: u64,
}

/// What the last pull/push left in the mirror, keyed by `/`-joined relative path.
#[derive(Default)]
pub struct Manifest {
    // The mirror file's stamp when it last matched the host.
    synced: HashMap<String, Stamp>,
    // The file's mode on the host, so a push doesn't strip an executable bit.
    modes: HashMap<String, u32>,
}

/// Bring the host's tree into `root`, keeping any mirror file that is newer.
pub fn pull(ssh: &SshSettings, root: &Path, manifest: &mut Manifest) -> Result<(), String> {
    let mut child = ssh_command(ssh, &pull_script(&ssh.dir))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("sync pull: {e}"))?;
    let stderr = drain(child.stderr.take());
    let mut stdout = child.stdout.take().expect("piped stdout");
    let unpacked = unpack(&mut stdout, root, manifest);
    if unpacked.is_err() {
        let _ = child.kill();
    }
    let _ = io::copy(&mut stdout, &mut io::sink());
    let status = child.wait().map_err(|e| format!("sync pull: {e}"))?;
    let stderr = stderr.join().unwrap_or_default();
    if !status.success() {
        return Err(format!(
            "sync pull failed: {}",
            config::trim_tail(&stderr, 500)
        ));
    }
    unpacked.map_err(|e| format!("sync pull: {e}"))
}

/// Send mirror files that changed since the last sync back to the host.
pub fn push(ssh: &SshSettings, root: &Path, manifest: &mut Manifest) -> Result<(), String> {
    let changed = changed_files(root, manifest);
    if changed.is_empty() {
        return Ok(());
    }
    let mut child = ssh_command(ssh, &push_script(&ssh.dir))
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("sync push: {e}"))?;
    let stderr = drain(child.stderr.take());
    let stdin = child.stdin.take().expect("piped stdin");
    let sent = write_archive(stdin, root, &changed, manifest);
    let status = child.wait().map_err(|e| format!("sync push: {e}"))?;
    let stderr = stderr.join().unwrap_or_default();
    if !status.success() {
        return Err(format!(
            "sync push failed: {}",
            config::trim_tail(&stderr, 500)
        ));
    }
    let sent = sent.map_err(|e| format!("sync push: {e}"))?;
    manifest.synced.extend(sent);
    Ok(())
}

fn ssh_command(ssh: &SshSettings, script: &str) -> Command {
    let mut cmd = crate::osproc::command("ssh");
    cmd.args(config::ssh_exec_args(ssh)).arg(script);
    cmd
}

fn drain(stderr: Option<ChildStderr>) -> JoinHandle<Vec<u8>> {
    std::thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(mut e) = stderr {
            let _ = e.read_to_end(&mut buf);
        }
        buf
    })
}

/// Archive the host dir to stdout. GNU tar exits 1 when a file changes while
/// it's read, which still leaves a usable archive; only 2+ is a failure.
/// COPYFILE_DISABLE keeps a macOS host's bsdtar from adding `._*` entries.
/// `<dir>/?*` leaves out what is inside an ignored directory but never a file of
/// that name, which bsdtar lets `<dir>/*` match; the emptied directory itself is
/// skipped on this side.
fn pull_script(dir: &str) -> String {
    let mut tar = String::from("COPYFILE_DISABLE=1 tar");
    for d in config::IGNORED_WATCH_DIRS {
        let pattern = format!("{d}/?*");
        tar.push_str(&format!(" --exclude={}", config::shell_quote(&pattern)));
    }
    tar.push_str(" -cf - .");
    let script = format!(
        "cd {} && {{ {tar}; [ $? -le 1 ]; }}",
        config::quote_remote_path(dir)
    );
    format!("sh -c {}", config::shell_quote(&script))
}

/// Copies each extracted file over the host's copy unless that one is newer:
/// rsync's `--update`. `find` runs it from the scratch dir with the project dir
/// as `$1`. A failed copy is recorded in `$2` and the rest still go, as tar
/// would; `find` alone can't carry the failure out of every batch it runs.
const PUSH_APPLY: &str = "d=$1; m=$2; shift 2; for f; do h=$d/${f#./}; \
     if [ -e \"$h\" ] && [ \"$h\" -nt \"$f\" ]; then continue; fi; \
     if [ -d \"$h\" ]; then echo \"$h is a directory\" >&2; : > \"$m\"; continue; fi; \
     { [ -d \"${h%/*}\" ] || mkdir -p \"${h%/*}\"; } && cp -p \"$f\" \"$h.lpm-push.$$\" && \
     mv -f \"$h.lpm-push.$$\" \"$h\" || { rm -f \"$h.lpm-push.$$\"; : > \"$m\"; }; \
     done";

/// Extract into a scratch dir on the host, then copy across each file the host
/// doesn't have a newer copy of. Not `tar --keep-newer-files`: BusyBox tar, the
/// only one on Alpine and many containers, has no such option.
fn push_script(dir: &str) -> String {
    let script = format!(
        "cd {} && d=$(pwd) && t=$(mktemp -d) && trap 'rm -rf \"$t\"' EXIT && \
         mkdir \"$t/x\" && tar -xf - -C \"$t/x\" && cd \"$t/x\" && \
         find . -type f -exec sh -c {} sh \"$d\" \"$t/failed\" {{}} + && \
         [ ! -e \"$t/failed\" ]",
        config::quote_remote_path(dir),
        config::shell_quote(PUSH_APPLY)
    );
    format!("sh -c {}", config::shell_quote(&script))
}

/// The mirror-relative path of an archive or mirror entry: `/`-joined plain
/// components only, None for the root itself, anything escaping the root, an
/// ignored directory, or anything under one.
fn mirror_rel(path: &Path, is_dir: bool) -> Option<String> {
    let mut parts = Vec::new();
    for comp in path.components() {
        match comp {
            Component::Normal(seg) => parts.push(seg.to_str()?),
            Component::CurDir => {}
            _ => return None,
        }
    }
    let dirs = if is_dir {
        &parts[..]
    } else {
        &parts[..parts.len().saturating_sub(1)]
    };
    if dirs.iter().any(|seg| config::IGNORED_WATCH_DIRS.contains(seg)) {
        return None;
    }
    (!parts.is_empty()).then(|| parts.join("/"))
}

fn local_stamp(path: &Path) -> Option<Stamp> {
    let meta = std::fs::symlink_metadata(path).ok()?;
    if !meta.is_file() {
        return None;
    }
    let mtime = meta
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_secs();
    Some(Stamp {
        mtime,
        len: meta.len(),
    })
}

/// Extract regular files and dirs. A mirror file newer than the archived one is
/// kept (and stays out of `synced`, so the next push sends it); an identical one
/// is left untouched so the mirror's watcher doesn't see a rewrite. Links and
/// names this filesystem can't hold are skipped rather than failing the pull.
fn unpack(reader: impl Read, root: &Path, manifest: &mut Manifest) -> io::Result<()> {
    let mut archive = tar::Archive::new(reader);
    for entry in archive.entries()? {
        let mut entry = entry?;
        let kind = entry.header().entry_type();
        let is_dir = kind == tar::EntryType::Directory;
        let Some(rel) = entry.path().ok().and_then(|p| mirror_rel(&p, is_dir)) else {
            continue;
        };
        if is_dir {
            let _ = std::fs::create_dir_all(root.join(&rel));
            continue;
        }
        if !matches!(kind, tar::EntryType::Regular | tar::EntryType::Continuous) {
            continue;
        }
        let header = entry.header();
        let remote = Stamp {
            mtime: header.mtime()?,
            len: entry.size(),
        };
        let mode = header.mode().unwrap_or(0o644);
        let dest = root.join(&rel);
        match local_stamp(&dest) {
            Some(local) if local.mtime > remote.mtime => {
                manifest.modes.insert(rel, mode);
                continue;
            }
            Some(local) if local == remote => {
                manifest.synced.insert(rel.clone(), local);
                manifest.modes.insert(rel, mode);
                continue;
            }
            _ => {}
        }
        if let Ok(true) = entry.unpack_in(root) {
            if let Some(local) = local_stamp(&dest) {
                manifest.synced.insert(rel.clone(), local);
            }
            manifest.modes.insert(rel, mode);
        }
    }
    Ok(())
}

/// Mirror files whose stamp differs from what the last sync recorded, sorted.
fn changed_files(root: &Path, manifest: &Manifest) -> Vec<String> {
    let mut out = Vec::new();
    let mut dirs = vec![root.to_path_buf()];
    while let Some(dir) = dirs.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let Ok(kind) = entry.file_type() else {
                continue;
            };
            let path = entry.path();
            let Some(rel) = path
                .strip_prefix(root)
                .ok()
                .and_then(|p| mirror_rel(p, kind.is_dir()))
            else {
                continue;
            };
            if kind.is_dir() {
                dirs.push(path);
            } else if kind.is_file() {
                let stamp = local_stamp(&path);
                if stamp.is_some() && manifest.synced.get(&rel).copied() != stamp {
                    out.push(rel);
                }
            }
        }
    }
    out.sort();
    out
}

/// Write `files` as a tar stream to `out`, each with the host's mode when known.
/// Returns the stamps sent, read in the same pass as the bytes.
fn write_archive(
    out: impl Write,
    root: &Path,
    files: &[String],
    manifest: &Manifest,
) -> io::Result<Vec<(String, Stamp)>> {
    let mut builder = tar::Builder::new(out);
    let mut sent = Vec::new();
    for rel in files {
        let path = root.join(rel);
        let (Some(stamp), Ok(data)) = (local_stamp(&path), std::fs::read(&path)) else {
            continue;
        };
        let mut header = tar::Header::new_gnu();
        header.set_entry_type(tar::EntryType::Regular);
        header.set_size(data.len() as u64);
        header.set_mtime(stamp.mtime);
        header.set_mode(manifest.modes.get(rel).copied().unwrap_or(0o644));
        builder.append_data(&mut header, rel, data.as_slice())?;
        sent.push((
            rel.clone(),
            Stamp {
                mtime: stamp.mtime,
                len: data.len() as u64,
            },
        ));
    }
    builder.into_inner()?.flush()?;
    Ok(sent)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::time::{Duration, SystemTime};

    fn write(root: &Path, rel: &str, body: &str, mtime: u64) {
        let path = root.join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, body).unwrap();
        let file = std::fs::File::options().write(true).open(&path).unwrap();
        file.set_modified(SystemTime::UNIX_EPOCH + Duration::from_secs(mtime))
            .unwrap();
    }

    fn archive_of(root: &Path, files: &[&str], modes: &[(&str, u32)]) -> Vec<u8> {
        let mut manifest = Manifest::default();
        for (rel, mode) in modes {
            manifest.modes.insert(rel.to_string(), *mode);
        }
        let files: Vec<String> = files.iter().map(|f| f.to_string()).collect();
        let mut buf = Vec::new();
        write_archive(&mut buf, root, &files, &manifest).unwrap();
        buf
    }

    fn read(root: &Path, rel: &str) -> String {
        std::fs::read_to_string(root.join(rel)).unwrap()
    }

    #[test]
    fn scripts_run_posix_tar_in_the_remote_dir() {
        let pull = pull_script("~/code/app");
        assert!(pull.starts_with("sh -c '"), "{pull}");
        assert!(
            pull.contains("cd \"$HOME\"'\\''/code/app'\\'' && {"),
            "{pull}"
        );
        assert!(pull.contains("--exclude='\\''node_modules/?*'\\''"), "{pull}");
        assert!(pull.contains(" -cf - .; [ $? -le 1 ]; }"), "{pull}");
        let push = push_script("/srv/app");
        assert!(push.starts_with("sh -c 'cd '\\''/srv/app'\\'' && "), "{push}");
        assert!(!push.contains("--keep-newer-files"), "{push}");
    }

    // The scripts the host runs, run here through the system sh and tar (bsdtar
    // on macOS, GNU tar on Linux CI) the way the host's login shell would.
    #[cfg(unix)]
    #[test]
    fn scripts_round_trip_through_a_real_tar() {
        let host = tempfile::tempdir().unwrap();
        let mirror = tempfile::tempdir().unwrap();
        let host_dir = host.path().to_string_lossy().into_owned();
        write(host.path(), "src/app.js", "v1", 1_000);
        write(host.path(), "notes.txt", "host is newer", 5_000);
        write(host.path(), "node_modules/dep/index.js", "dep", 1_000);
        write(host.path(), "web/build/app.js", "built", 1_000);
        write(host.path(), "build", "#!/bin/sh", 1_000);
        write(host.path(), "src/dist", "a file named like a dir", 1_000);

        let out = Command::new("sh")
            .arg("-c")
            .arg(pull_script(&host_dir))
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "{}",
            String::from_utf8_lossy(&out.stderr)
        );
        let mut manifest = Manifest::default();
        unpack(out.stdout.as_slice(), mirror.path(), &mut manifest).unwrap();
        assert_eq!(read(mirror.path(), "src/app.js"), "v1");
        assert!(!mirror.path().join("node_modules").exists());
        assert!(!mirror.path().join("web/build").exists());
        assert_eq!(read(mirror.path(), "build"), "#!/bin/sh");
        assert_eq!(read(mirror.path(), "src/dist"), "a file named like a dir");

        write(mirror.path(), "src/app.js", "v2", 2_000);
        write(mirror.path(), "notes.txt", "stale mirror copy", 3_000);
        write(mirror.path(), "src/new.js", "new", 2_000);
        write(mirror.path(), "build", "#!/bin/sh\nmake", 2_000);
        write(mirror.path(), "lib/deep/new.rs", "deep", 2_000);
        let changed = changed_files(mirror.path(), &manifest);
        assert_eq!(
            changed,
            vec![
                "build",
                "lib/deep/new.rs",
                "notes.txt",
                "src/app.js",
                "src/new.js"
            ]
        );

        let mut child = Command::new("sh")
            .arg("-c")
            .arg(push_script(&host_dir))
            .stdin(Stdio::piped())
            .spawn()
            .unwrap();
        write_archive(
            child.stdin.take().unwrap(),
            mirror.path(),
            &changed,
            &manifest,
        )
        .unwrap();
        assert!(child.wait().unwrap().success());
        assert_eq!(read(host.path(), "src/app.js"), "v2");
        assert_eq!(read(host.path(), "src/new.js"), "new");
        assert_eq!(read(host.path(), "build"), "#!/bin/sh\nmake");
        assert_eq!(read(host.path(), "lib/deep/new.rs"), "deep");
        assert_eq!(read(host.path(), "notes.txt"), "host is newer");
        assert_eq!(
            local_stamp(&host.path().join("src/app.js")).unwrap().mtime,
            2_000
        );
    }

    // A file the host can't take fails the push, without holding back the rest.
    #[cfg(unix)]
    #[test]
    fn a_push_the_host_refuses_part_of_still_fails() {
        let host = tempfile::tempdir().unwrap();
        let mirror = tempfile::tempdir().unwrap();
        let clash = host.path().join("clash");
        std::fs::create_dir_all(&clash).unwrap();
        std::fs::File::open(&clash)
            .unwrap()
            .set_modified(SystemTime::UNIX_EPOCH + Duration::from_secs(1_000))
            .unwrap();
        write(mirror.path(), "clash", "a file where the host has a dir", 2_000);
        write(mirror.path(), "ok.txt", "fine", 2_000);
        let changed = changed_files(mirror.path(), &Manifest::default());

        let mut child = Command::new("sh")
            .arg("-c")
            .arg(push_script(&host.path().to_string_lossy()))
            .stdin(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        write_archive(
            child.stdin.take().unwrap(),
            mirror.path(),
            &changed,
            &Manifest::default(),
        )
        .unwrap();
        assert!(!child.wait().unwrap().success());
        assert_eq!(read(host.path(), "ok.txt"), "fine");
    }

    #[test]
    fn rel_paths_stay_inside_the_mirror_and_skip_ignored_dirs() {
        assert_eq!(
            mirror_rel(Path::new("./src/main.rs"), false).as_deref(),
            Some("src/main.rs")
        );
        assert_eq!(mirror_rel(Path::new("src"), true).as_deref(), Some("src"));
        assert_eq!(mirror_rel(Path::new("."), true), None);
        assert_eq!(mirror_rel(Path::new("../etc/passwd"), false), None);
        assert_eq!(mirror_rel(Path::new("/etc/passwd"), false), None);
        assert_eq!(mirror_rel(Path::new("web/node_modules/x.js"), false), None);
        assert_eq!(mirror_rel(Path::new("web/node_modules"), true), None);
    }

    // The ignore list names directories: a `build` script or a `dist` file is
    // part of the project.
    #[test]
    fn a_file_named_like_an_ignored_dir_is_mirrored() {
        assert_eq!(mirror_rel(Path::new("./build"), false).as_deref(), Some("build"));
        assert_eq!(
            mirror_rel(Path::new("src/dist"), false).as_deref(),
            Some("src/dist")
        );
        assert_eq!(mirror_rel(Path::new("build"), true), None);
        assert_eq!(mirror_rel(Path::new("build/app.js"), false), None);
    }

    #[test]
    fn a_pull_fills_the_mirror_and_records_what_it_wrote() {
        let host = tempfile::tempdir().unwrap();
        let mirror = tempfile::tempdir().unwrap();
        write(host.path(), "src/main.rs", "fn main() {}", 1_000);
        write(host.path(), "run.sh", "#!/bin/sh", 1_000);
        let tar = archive_of(
            host.path(),
            &["src/main.rs", "run.sh"],
            &[("run.sh", 0o755)],
        );

        let mut manifest = Manifest::default();
        unpack(tar.as_slice(), mirror.path(), &mut manifest).unwrap();

        assert_eq!(read(mirror.path(), "src/main.rs"), "fn main() {}");
        assert_eq!(
            local_stamp(&mirror.path().join("run.sh")).unwrap().mtime,
            1_000
        );
        assert_eq!(manifest.modes.get("run.sh"), Some(&0o755));
        assert!(changed_files(mirror.path(), &manifest).is_empty());
    }

    #[test]
    fn a_newer_mirror_file_survives_a_pull_and_is_pushed_next() {
        let host = tempfile::tempdir().unwrap();
        let mirror = tempfile::tempdir().unwrap();
        write(host.path(), "a.txt", "host", 1_000);
        write(mirror.path(), "a.txt", "local edit", 2_000);
        let tar = archive_of(host.path(), &["a.txt"], &[]);

        let mut manifest = Manifest::default();
        unpack(tar.as_slice(), mirror.path(), &mut manifest).unwrap();

        assert_eq!(read(mirror.path(), "a.txt"), "local edit");
        assert_eq!(changed_files(mirror.path(), &manifest), vec!["a.txt"]);
    }

    #[test]
    fn an_older_mirror_file_is_replaced() {
        let host = tempfile::tempdir().unwrap();
        let mirror = tempfile::tempdir().unwrap();
        write(host.path(), "a.txt", "host v2", 2_000);
        write(mirror.path(), "a.txt", "v1", 1_000);
        let tar = archive_of(host.path(), &["a.txt"], &[]);

        let mut manifest = Manifest::default();
        unpack(tar.as_slice(), mirror.path(), &mut manifest).unwrap();

        assert_eq!(read(mirror.path(), "a.txt"), "host v2");
        assert!(changed_files(mirror.path(), &manifest).is_empty());
    }

    #[test]
    fn a_push_carries_only_edits_and_new_files_with_host_modes() {
        let host = tempfile::tempdir().unwrap();
        let mirror = tempfile::tempdir().unwrap();
        write(host.path(), "run.sh", "#!/bin/sh", 1_000);
        write(host.path(), "keep.txt", "same", 1_000);
        let tar = archive_of(host.path(), &["run.sh", "keep.txt"], &[("run.sh", 0o755)]);
        let mut manifest = Manifest::default();
        unpack(tar.as_slice(), mirror.path(), &mut manifest).unwrap();

        write(mirror.path(), "run.sh", "#!/bin/sh\necho hi", 3_000);
        write(mirror.path(), "new.txt", "new", 3_000);
        write(mirror.path(), "node_modules/dep.js", "x", 3_000);
        let changed = changed_files(mirror.path(), &manifest);
        assert_eq!(changed, vec!["new.txt", "run.sh"]);

        let mut buf = Vec::new();
        let sent = write_archive(&mut buf, mirror.path(), &changed, &manifest).unwrap();
        manifest.synced.extend(sent);
        assert!(changed_files(mirror.path(), &manifest).is_empty());

        let mut archive = tar::Archive::new(buf.as_slice());
        let entries: Vec<(PathBuf, u32, u64)> = archive
            .entries()
            .unwrap()
            .map(|e| {
                let e = e.unwrap();
                let h = e.header();
                (
                    e.path().unwrap().into_owned(),
                    h.mode().unwrap(),
                    h.mtime().unwrap(),
                )
            })
            .collect();
        assert_eq!(
            entries,
            vec![
                (PathBuf::from("new.txt"), 0o644, 3_000),
                (PathBuf::from("run.sh"), 0o755, 3_000),
            ]
        );
    }
}
