// Host half of "Bring changes": the Mac that holds the work answers three peer
// verbs — snapshot + pack, chunk read, release. Nothing is written to the repo;
// the working tree is captured as a throwaway commit built in a temp index, so
// the user's own index and HEAD are untouched.
//
// Frames are plain JSON text (the peer channel carries no binary), so pack bytes
// travel base64'd in 1 MiB chunks. Every verb runs on its own thread and replies
// through the connection's out-queue — a blocking handler would stall that
// connection's reads.
use crate::git::{git_command, git_out_env};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::mpsc::SyncSender;
use std::sync::{Mutex, OnceLock};

pub const GIT_BRING_FEATURE: &str = "gitBring";

const CHUNK_BYTES: u64 = 1024 * 1024;
const MAX_PACK_BYTES: u64 = 1024 * 1024 * 1024;
const MAX_HAVES: usize = 512;
const PACK_TTL_MS: i64 = 10 * 60 * 1000;
const SNAPSHOT_MESSAGE: &str = "lpm: working state";

/// A machine identity for the snapshot commit: the repo may have no configured
/// user, and the commit is a transport artifact that never carries authorship.
const SNAPSHOT_IDENTITY: [(&str, &str); 4] = [
    ("GIT_AUTHOR_NAME", "lpm"),
    ("GIT_AUTHOR_EMAIL", "lpm@localhost"),
    ("GIT_COMMITTER_NAME", "lpm"),
    ("GIT_COMMITTER_EMAIL", "lpm@localhost"),
];

struct PendingPack {
    path: PathBuf,
    bytes: u64,
    touched_at: i64,
}

fn registry() -> &'static Mutex<HashMap<String, PendingPack>> {
    static REG: OnceLock<Mutex<HashMap<String, PendingPack>>> = OnceLock::new();
    REG.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Answer one bring-changes request. The caller has already matched the verb.
pub fn handle_bring(out: &SyncSender<String>, t: &str, v: &Value) {
    let req_id = v.get("reqId").cloned().unwrap_or(Value::Null);
    let (out, verb, v) = (out.clone(), t.to_string(), v.clone());
    std::thread::spawn(move || {
        let res = match verb.as_str() {
            "gitBringPrepare" => prepare(&v),
            "gitBringChunk" => chunk(&v),
            "gitBringDone" => done(&v),
            _ => Err(format!("unknown bring request: {verb}")),
        };
        let frame = match res {
            Ok(value) => crate::peer::result_frame(&req_id, true, value),
            Err(e) => crate::peer::result_frame(&req_id, false, Value::String(e)),
        };
        let _ = out.try_send(frame);
    });
}

fn str_arg(v: &Value, key: &str) -> String {
    v.get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn prepare(v: &Value) -> Result<Value, String> {
    reap_expired();
    let cwd = str_arg(v, "cwd");
    if cwd.is_empty() || !Path::new(&cwd).is_dir() {
        return Err("the project folder is missing on the other Mac".into());
    }
    if git(&cwd, &["rev-parse", "--is-inside-work-tree"]).is_err() {
        return Err("that project is not a Git repository on the other Mac".into());
    }
    let head = git(&cwd, &["rev-parse", "HEAD"])
        .map_err(|_| "that project has no commits yet on the other Mac".to_string())?;
    let branch = git(&cwd, &["symbolic-ref", "--quiet", "--short", "HEAD"])
        .ok()
        .filter(|b| !b.is_empty());

    let snapshot = snapshot(&cwd, &head)?;
    let target = snapshot.sha.clone().unwrap_or_else(|| head.clone());
    let haves = filter_haves(&cwd, v.get("have"));
    let path = pack(&cwd, &target, &haves)?;

    let bytes = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    if bytes > MAX_PACK_BYTES {
        let _ = std::fs::remove_file(&path);
        return Err(format!(
            "the changes are too large to bring ({} MB)",
            bytes / (1024 * 1024)
        ));
    }
    let transfer_id = uuid::Uuid::new_v4().to_string();
    registry().lock().unwrap().insert(
        transfer_id.clone(),
        PendingPack {
            path,
            bytes,
            touched_at: crate::status::now_millis(),
        },
    );
    Ok(json!({
        "transferId": transfer_id,
        "head": head,
        "branch": branch,
        "snapshot": snapshot.sha,
        "bytes": bytes,
        "chunk": CHUNK_BYTES,
        "changed": snapshot.changed,
    }))
}

fn chunk(v: &Value) -> Result<Value, String> {
    let id = str_arg(v, "transferId");
    let offset = v.get("offset").and_then(Value::as_u64).unwrap_or(0);
    let len = v
        .get("len")
        .and_then(Value::as_u64)
        .unwrap_or(CHUNK_BYTES)
        .clamp(1, CHUNK_BYTES);

    let (path, bytes) = {
        let mut reg = registry().lock().unwrap();
        let p = reg
            .get_mut(&id)
            .ok_or_else(|| "that transfer expired — start it again".to_string())?;
        p.touched_at = crate::status::now_millis();
        (p.path.clone(), p.bytes)
    };
    if offset > bytes {
        return Err("read past the end of the change set".into());
    }
    let want = len.min(bytes - offset) as usize;
    let mut buf = vec![0u8; want];
    let mut f = File::open(&path).map_err(|e| e.to_string())?;
    f.seek(SeekFrom::Start(offset)).map_err(|e| e.to_string())?;
    f.read_exact(&mut buf).map_err(|e| e.to_string())?;
    Ok(json!({ "b64": B64.encode(&buf), "eof": offset + want as u64 >= bytes }))
}

fn done(v: &Value) -> Result<Value, String> {
    let id = str_arg(v, "transferId");
    if let Some(p) = registry().lock().unwrap().remove(&id) {
        let _ = std::fs::remove_file(&p.path);
    }
    Ok(json!({}))
}

fn reap_expired() {
    let now = crate::status::now_millis();
    let stale: Vec<PendingPack> = {
        let mut reg = registry().lock().unwrap();
        let ids: Vec<String> = reg
            .iter()
            .filter(|(_, p)| now - p.touched_at > PACK_TTL_MS)
            .map(|(id, _)| id.clone())
            .collect();
        ids.iter().filter_map(|id| reg.remove(id)).collect()
    };
    for p in stale {
        let _ = std::fs::remove_file(&p.path);
    }
}

// --- git plumbing -------------------------------------------------------------

struct Snapshot {
    sha: Option<String>,
    changed: u64,
}

fn git(cwd: &str, args: &[&str]) -> Result<String, String> {
    git_out_env(cwd, args, &[])
}

fn temp_path(prefix: &str) -> PathBuf {
    std::env::temp_dir().join(format!("{prefix}-{}", uuid::Uuid::new_v4()))
}

/// Capture the working tree (tracked edits, deletions and untracked-unignored
/// files) as a commit on top of HEAD, built in a throwaway index so the user's
/// own staging area is never touched. Ignored files stay out — they are
/// machine-specific. Returns no sha when the tree already matches HEAD.
fn snapshot(cwd: &str, head: &str) -> Result<Snapshot, String> {
    let index = temp_path("lpm-bring-index");
    let index_arg = index.to_string_lossy().to_string();
    let envs = [("GIT_INDEX_FILE", index_arg.as_str())];
    let built = build_snapshot(cwd, head, &envs);
    let _ = std::fs::remove_file(&index);
    built
}

fn build_snapshot(cwd: &str, head: &str, envs: &[(&str, &str)]) -> Result<Snapshot, String> {
    git_out_env(cwd, &["read-tree", head], envs)?;
    git_out_env(cwd, &["add", "-A", "--"], envs)?;
    let tree = git_out_env(cwd, &["write-tree"], envs)?;
    let head_tree = git(cwd, &["rev-parse", &format!("{head}^{{tree}}")])?;
    if tree == head_tree {
        return Ok(Snapshot {
            sha: None,
            changed: 0,
        });
    }
    let changed = git(cwd, &["diff-tree", "-r", "--name-only", &head_tree, &tree])
        .map(|o| o.lines().filter(|l| !l.trim().is_empty()).count() as u64)
        .unwrap_or(0);
    let mut identity = SNAPSHOT_IDENTITY.to_vec();
    identity.extend_from_slice(envs);
    let sha = git_out_env(
        cwd,
        &["commit-tree", &tree, "-p", head, "-m", SNAPSHOT_MESSAGE],
        &identity,
    )?;
    Ok(Snapshot {
        sha: Some(sha),
        changed,
    })
}

/// Keep only the haves this repo actually contains as commits; a rev arg for a
/// missing object makes `pack-objects` fail outright.
fn filter_haves(cwd: &str, raw: Option<&Value>) -> Vec<String> {
    let wanted = crate::gitbringapply::dedup_cap(
        raw.and_then(Value::as_array)
            .map(|a| {
                a.iter()
                    .filter_map(Value::as_str)
                    .filter(|s| crate::gitbringapply::is_object_id(s))
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default(),
        MAX_HAVES,
    );
    if wanted.is_empty() {
        return wanted;
    }
    let listing = git_with_stdin(cwd, &["cat-file", "--batch-check"], wanted.join("\n").as_bytes())
        .unwrap_or_default();
    listing
        .lines()
        .filter_map(|l| {
            let mut parts = l.split_whitespace();
            let sha = parts.next()?;
            (parts.next() == Some("commit")).then(|| sha.to_string())
        })
        .collect()
}

/// Pack every object reachable from `target` that the asking Mac is missing.
/// Both ends of the pipeline are files, so neither the rev list nor the pack can
/// deadlock against a full pipe buffer.
fn pack(cwd: &str, target: &str, haves: &[String]) -> Result<PathBuf, String> {
    let mut revs = format!("{target}\n");
    for h in haves {
        revs.push('^');
        revs.push_str(h);
        revs.push('\n');
    }
    let revs_path = temp_path("lpm-bring-revs");
    std::fs::write(&revs_path, revs).map_err(|e| e.to_string())?;
    let dest = temp_path("lpm-bring-pack");

    let run = run_to_file(
        cwd,
        &["pack-objects", "--revs", "--stdout", "--delta-base-offset"],
        &revs_path,
        &dest,
    );
    let _ = std::fs::remove_file(&revs_path);
    match run {
        Ok(()) => Ok(dest),
        Err(e) => {
            let _ = std::fs::remove_file(&dest);
            Err(format!("could not pack the changes: {e}"))
        }
    }
}

fn run_to_file(cwd: &str, args: &[&str], stdin: &Path, stdout: &Path) -> Result<(), String> {
    let input = File::open(stdin).map_err(|e| e.to_string())?;
    let output = File::create(stdout).map_err(|e| e.to_string())?;
    let out = git_command(cwd, args, &[])
        .stdin(Stdio::from(input))
        .stdout(Stdio::from(output))
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?
        .wait_with_output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
    Err(if stderr.is_empty() {
        format!("git exited with status {}", out.status)
    } else {
        stderr
    })
}

fn git_with_stdin(cwd: &str, args: &[&str], input: &[u8]) -> Result<String, String> {
    let path = temp_path("lpm-bring-in");
    std::fs::write(&path, input).map_err(|e| e.to_string())?;
    let file = File::open(&path).map_err(|e| e.to_string())?;
    let out = git_command(cwd, args, &[])
        .stdin(Stdio::from(file))
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())
        .and_then(|c| c.wait_with_output().map_err(|e| e.to_string()));
    let _ = std::fs::remove_file(&path);
    Ok(String::from_utf8_lossy(&out?.stdout).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repo() -> (tempfile::TempDir, String) {
        let dir = tempfile::tempdir().unwrap();
        let cwd = dir.path().to_string_lossy().to_string();
        git(&cwd, &["init", "-q", "-b", "main"]).unwrap();
        std::fs::write(dir.path().join("a.txt"), "one\n").unwrap();
        git(&cwd, &["add", "-A"]).unwrap();
        git_out_env(
            &cwd,
            &["commit", "-q", "-m", "first"],
            &SNAPSHOT_IDENTITY.to_vec(),
        )
        .unwrap();
        (dir, cwd)
    }

    #[test]
    fn snapshot_of_a_clean_tree_produces_no_commit() {
        let (_d, cwd) = repo();
        let head = git(&cwd, &["rev-parse", "HEAD"]).unwrap();
        let snap = snapshot(&cwd, &head).unwrap();
        assert!(snap.sha.is_none());
        assert_eq!(snap.changed, 0);
    }

    #[test]
    fn snapshot_captures_edits_and_untracked_but_not_ignored() {
        let (d, cwd) = repo();
        std::fs::write(d.path().join(".gitignore"), "secret.env\n").unwrap();
        std::fs::write(d.path().join("a.txt"), "two\n").unwrap();
        std::fs::write(d.path().join("new.txt"), "fresh\n").unwrap();
        std::fs::write(d.path().join("secret.env"), "TOKEN=1\n").unwrap();
        let head = git(&cwd, &["rev-parse", "HEAD"]).unwrap();

        let snap = snapshot(&cwd, &head).unwrap();
        let sha = snap.sha.expect("dirty tree snapshots");
        // .gitignore itself is untracked-unignored, so it counts too.
        assert_eq!(snap.changed, 3);
        let listed = git(&cwd, &["ls-tree", "-r", "--name-only", &sha]).unwrap();
        assert!(listed.contains("new.txt"));
        assert!(!listed.contains("secret.env"));
        // The real index is untouched: nothing is staged.
        assert!(git(&cwd, &["diff", "--cached", "--name-only"])
            .unwrap()
            .is_empty());
    }

    #[test]
    fn snapshot_records_deletions() {
        let (d, cwd) = repo();
        std::fs::remove_file(d.path().join("a.txt")).unwrap();
        let head = git(&cwd, &["rev-parse", "HEAD"]).unwrap();
        let sha = snapshot(&cwd, &head).unwrap().sha.unwrap();
        assert!(git(&cwd, &["ls-tree", "-r", "--name-only", &sha])
            .unwrap()
            .is_empty());
    }

    #[test]
    fn filter_haves_drops_objects_this_repo_lacks() {
        let (_d, cwd) = repo();
        let head = git(&cwd, &["rev-parse", "HEAD"]).unwrap();
        let absent = "0".repeat(40);
        let kept = filter_haves(&cwd, Some(&json!([head, absent, "not-a-sha"])));
        assert_eq!(kept, vec![head]);
    }

    #[test]
    fn pack_and_chunk_round_trip_the_whole_file() {
        let (_d, cwd) = repo();
        let head = git(&cwd, &["rev-parse", "HEAD"]).unwrap();
        let path = pack(&cwd, &head, &[]).unwrap();
        let bytes = std::fs::metadata(&path).unwrap().len();
        assert!(bytes > 0);

        let id = uuid::Uuid::new_v4().to_string();
        registry().lock().unwrap().insert(
            id.clone(),
            PendingPack {
                path: path.clone(),
                bytes,
                touched_at: crate::status::now_millis(),
            },
        );
        let mut got = Vec::new();
        let mut offset = 0u64;
        loop {
            let r = chunk(&json!({ "transferId": id, "offset": offset, "len": 64 })).unwrap();
            let part = B64
                .decode(r.get("b64").and_then(Value::as_str).unwrap())
                .unwrap();
            offset += part.len() as u64;
            got.extend_from_slice(&part);
            if r.get("eof").and_then(Value::as_bool).unwrap() {
                break;
            }
        }
        assert_eq!(got, std::fs::read(&path).unwrap());
        assert_eq!(got.len() as u64, bytes);

        done(&json!({ "transferId": id })).unwrap();
        assert!(!path.exists());
        assert!(chunk(&json!({ "transferId": id, "offset": 0 })).is_err());
    }

    #[test]
    fn done_is_idempotent_for_an_unknown_transfer() {
        assert!(done(&json!({ "transferId": "nope" })).is_ok());
    }

    /// The whole pipeline across two real repos standing in for the two Macs:
    /// snapshot and pack on one, index and check out on the other. The peer
    /// socket only moves the bytes, so this covers everything that decides what
    /// the receiving Mac ends up with.
    #[test]
    fn a_transfer_mirrors_the_other_macs_working_state() {
        let (sender_dir, sender) = repo();
        let commit = |cwd: &str, msg: &str| {
            git(cwd, &["add", "-A"]).unwrap();
            git_out_env(cwd, &["commit", "-q", "-m", msg], &SNAPSHOT_IDENTITY.to_vec()).unwrap();
        };
        std::fs::write(sender_dir.path().join(".gitignore"), "secret.env\n").unwrap();
        std::fs::write(sender_dir.path().join("b.txt"), "bee\n").unwrap();
        commit(&sender, "shared");

        let receiver_dir = tempfile::tempdir().unwrap();
        let receiver = receiver_dir
            .path()
            .join("work")
            .to_string_lossy()
            .to_string();
        git(&sender, &["clone", "--no-hardlinks", "-q", &sender, &receiver]).unwrap();

        // Work done on the sender after the receiver last saw it: one commit it
        // is missing, plus every shape of uncommitted change.
        std::fs::write(sender_dir.path().join("c.txt"), "sea\n").unwrap();
        commit(&sender, "only on the sender");
        std::fs::write(sender_dir.path().join("a.txt"), "two\n").unwrap();
        std::fs::remove_file(sender_dir.path().join("b.txt")).unwrap();
        std::fs::write(sender_dir.path().join("new.txt"), "fresh\n").unwrap();
        std::fs::write(sender_dir.path().join("secret.env"), "TOKEN=1\n").unwrap();

        let head = git(&sender, &["rev-parse", "HEAD"]).unwrap();
        let target = snapshot(&sender, &head).unwrap().sha.expect("dirty tree");
        let haves = filter_haves(
            &sender,
            Some(&json!(crate::gitbringapply::have_list(&receiver))),
        );
        assert!(!haves.is_empty(), "the clone shares a base with the sender");

        let pack_path = pack(&sender, &target, &haves).unwrap();
        crate::gitbringapply::index_pack(&receiver, &pack_path).unwrap();
        crate::gitbringapply::apply_state(&receiver, "lpm/main", &target, &head, true).unwrap();
        let _ = std::fs::remove_file(&pack_path);

        let at = |p: &str| receiver_dir.path().join("work").join(p);
        assert_eq!(git(&receiver, &["rev-parse", "HEAD"]).unwrap(), head);
        assert_eq!(
            git(&receiver, &["rev-parse", "--abbrev-ref", "HEAD"]).unwrap(),
            "lpm/main"
        );
        // The commit the receiver was missing arrived with the pack.
        assert_eq!(std::fs::read_to_string(at("c.txt")).unwrap(), "sea\n");
        assert_eq!(std::fs::read_to_string(at("a.txt")).unwrap(), "two\n");
        assert_eq!(std::fs::read_to_string(at("new.txt")).unwrap(), "fresh\n");
        assert!(!at("b.txt").exists(), "the sender's deletion carried over");
        assert!(!at("secret.env").exists(), "ignored files never travel");

        // The point of the whole design: the sender's uncommitted work is present
        // but still uncommitted, so the receiver sees exactly what the sender saw.
        assert!(
            git(&receiver, &["diff", "--cached", "--name-only"])
                .unwrap()
                .is_empty(),
            "nothing may be left staged"
        );
        // Asserted through plumbing rather than `status --porcelain`, whose
        // leading status column would be lost to the trimming in `git_out`.
        let unstaged = git(&receiver, &["diff", "--name-status"]).unwrap();
        assert!(unstaged.contains("M\ta.txt"), "{unstaged}");
        assert!(unstaged.contains("D\tb.txt"), "{unstaged}");
        assert_eq!(
            git(&receiver, &["ls-files", "--others", "--exclude-standard"]).unwrap(),
            "new.txt"
        );
    }

    #[test]
    fn prepare_rejects_a_path_that_is_not_a_repo() {
        let dir = tempfile::tempdir().unwrap();
        let err = prepare(&json!({ "cwd": dir.path().to_string_lossy() })).unwrap_err();
        assert!(err.contains("not a Git repository"), "{err}");
    }
}
