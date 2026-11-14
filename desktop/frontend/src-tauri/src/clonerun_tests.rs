use super::*;
use crate::cloneprogress::Phase;
use std::path::PathBuf;
use std::process::Command;

fn git(dir: &Path, args: &[&str]) {
    let out = Command::new("git")
        .args(["-c", "user.name=lpm", "-c", "user.email=lpm@example.com"])
        .args(["-c", "commit.gpgsign=false"])
        .args(args)
        .current_dir(dir)
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
}

fn source_repo(root: &Path) -> PathBuf {
    let src = root.join("src");
    std::fs::create_dir(&src).unwrap();
    git(&src, &["init", "-q"]);
    for i in 0..60 {
        let body: String = (0..2000)
            .map(|j| char::from(b'a' + ((i * 7 + j * 13) % 26) as u8))
            .collect();
        std::fs::write(src.join(format!("f{i}.txt")), body).unwrap();
    }
    git(&src, &["add", "."]);
    git(&src, &["commit", "-q", "-m", "init"]);
    src
}

fn file_url(path: &Path) -> String {
    format!("file://{}", path.display())
}

fn argv(url: &str, dest: &Path) -> Vec<String> {
    vec![
        "clone".into(),
        "--progress".into(),
        "--".into(),
        url.into(),
        dest.to_string_lossy().into_owned(),
    ]
}

fn test_env() -> Vec<(&'static str, String)> {
    vec![("GIT_TERMINAL_PROMPT", "0".into()), ("LC_ALL", "C".into())]
}

#[test]
fn a_clone_reports_its_phases() {
    let tmp = tempfile::tempdir().unwrap();
    let src = source_repo(tmp.path());
    let dest = tmp.path().join("dest");
    std::fs::create_dir(&dest).unwrap();
    let mut seen = Vec::new();
    let ran = run(
        "test-phases",
        &argv(&file_url(&src), &dest),
        &test_env(),
        |p| seen.push(p.clone()),
    );
    assert!(ran.is_ok());
    assert!(dest.join("f0.txt").exists());
    let phases: Vec<Phase> = seen.iter().map(|p| p.phase).collect();
    assert!(phases.contains(&Phase::Receiving), "{phases:?}");
    assert!(seen
        .iter()
        .any(|p| p.phase == Phase::Receiving && p.finished && p.percent == Some(100)));
}

#[test]
fn a_failed_clone_answers_with_what_git_said() {
    let tmp = tempfile::tempdir().unwrap();
    let dest = tmp.path().join("dest");
    let missing = tmp.path().join("missing");
    let Err(Failure::Git(msg)) = run(
        "test-missing",
        &argv(&file_url(&missing), &dest),
        &test_env(),
        |_| {},
    ) else {
        panic!("a clone of a missing repo succeeded");
    };
    assert!(
        msg.contains("does not appear to be a git repository"),
        "{msg}"
    );
    assert!(!msg.contains("Cloning into"), "{msg}");
}

#[test]
fn cancel_ends_git_and_everything_it_started() {
    let tmp = tempfile::tempdir().unwrap();
    let dest = tmp.path().join("dest");
    std::fs::create_dir(&dest).unwrap();
    let mut env = test_env();
    env.push(("GIT_SSH_COMMAND", "sh -c 'sleep 30' --".into()));
    env.push(("GIT_SSH_VARIANT", "simple".into()));
    let args = argv("ssh://example.invalid/repo.git", &dest);
    let started = Instant::now();
    let clone = std::thread::spawn(move || run("test-cancel", &args, &env, |_| {}));
    std::thread::sleep(Duration::from_millis(600));
    assert!(cancel_clone("test-cancel".into()));
    let ended = clone.join().unwrap();
    assert!(matches!(ended, Err(Failure::Cancelled)));
    assert!(
        started.elapsed() < Duration::from_secs(10),
        "{:?}",
        started.elapsed()
    );
    remove_partial(&dest);
    assert!(!dest.exists());
    assert!(!cancel_clone("test-cancel".into()));
}

#[test]
fn cancelling_an_unknown_clone_is_a_no_op() {
    assert!(!cancel_clone("no-such-clone".into()));
}

#[test]
fn prompts_and_unknown_hosts_get_a_clear_message() {
    let prompt = map_clone_error(
        "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
    );
    assert!(prompt.contains("sign-in"), "{prompt}");
    let host = map_clone_error(
        "Host key verification failed.\nfatal: Could not read from remote repository.",
    );
    assert!(host.contains("host's key"), "{host}");
    let key = map_clone_error("git@github.com: Permission denied (publickey).");
    assert!(key.starts_with("Authentication failed"), "{key}");
    assert_eq!(
        map_clone_error("fatal: something odd"),
        "clone failed: fatal: something odd"
    );
}

#[test]
fn removing_a_partial_clone_deletes_its_folder() {
    let tmp = tempfile::tempdir().unwrap();
    let dest = tmp.path().join("dest");
    std::fs::create_dir_all(dest.join(".git/objects")).unwrap();
    std::fs::write(dest.join(".git/objects/pack"), b"x").unwrap();
    remove_partial(&dest);
    assert!(!dest.exists());
    remove_partial(&dest);
}

// Over the network: `cargo test clonerun -- --ignored --nocapture`.
#[test]
#[ignore]
fn a_real_clone_cancelled_while_receiving() {
    let tmp = tempfile::tempdir().unwrap();
    let dest = tmp.path().join("git");
    std::fs::create_dir(&dest).unwrap();
    let args = argv("https://github.com/git/git.git", &dest);
    let watch = dest.clone();
    let clone = std::thread::spawn(move || {
        let mut cancelled = false;
        run("test-net-cancel", &args, &quiet_env(), |p| {
            eprintln!("{p:?}");
            if !cancelled && p.phase == Phase::Receiving && p.percent.unwrap_or(0) >= 3 {
                cancelled = true;
                let at = Instant::now();
                std::thread::spawn(move || {
                    assert!(cancel_clone("test-net-cancel".into()));
                    eprintln!("cancel took {:?}", at.elapsed());
                });
            }
        })
    });
    let ended = clone.join().unwrap();
    assert!(matches!(ended, Err(Failure::Cancelled)));
    assert!(watch.exists());
    remove_partial(&watch);
    assert!(!watch.exists());
}

#[test]
#[ignore]
fn a_real_small_clone() {
    let tmp = tempfile::tempdir().unwrap();
    let dest = tmp.path().join("hello");
    std::fs::create_dir(&dest).unwrap();
    let mut seen = Vec::new();
    let ran = run(
        "test-net-small",
        &argv("https://github.com/octocat/Hello-World.git", &dest),
        &quiet_env(),
        |p| seen.push(p.clone()),
    );
    for p in &seen {
        eprintln!("{p:?}");
    }
    assert!(ran.is_ok());
    assert!(dest.join("README").exists());
}
