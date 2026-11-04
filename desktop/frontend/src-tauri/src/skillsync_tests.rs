use super::*;
use crate::lpm_commands_local::LocalFs;
use serde_json::json;
use tempfile::TempDir;

struct Place {
    _dir: TempDir,
    skills: PathBuf,
    claude: PathBuf,
    lpm: PathBuf,
}

fn place() -> Place {
    let dir = tempfile::tempdir().unwrap();
    let home = dir.path().to_path_buf();
    Place {
        skills: home.join(".agents/skills"),
        claude: home.join(".claude/skills"),
        lpm: home.join(".lpm"),
        _dir: dir,
    }
}

fn store(p: &Place) -> LocalFs {
    LocalFs::new(p.skills.clone(), p.claude.clone(), p.lpm.clone())
}

fn doc(body: &str) -> String {
    format!("---\nname: x\ndescription: d\nmetadata:\n  lpm-created: \"true\"\n---\n\n{body}\n")
}

fn write(root: &Path, rel: &str, content: &str) {
    let path = root.join(rel);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, content).unwrap();
}

fn listed(p: &Place) -> LocalSkills {
    list_of(&store(p)).unwrap()
}

fn item(p: &Place, name: &str) -> Vec<u8> {
    item_from(&store(p), name).unwrap().content.into_bytes()
}

#[test]
fn only_lpms_skills_are_listed_and_the_rest_are_held() {
    let p = place();
    write(&p.skills, "mine/SKILL.md", &doc("body"));
    write(&p.skills, "theirs/SKILL.md", "---\nname: theirs\ndescription: d\n---\n\nbody\n");
    let list = listed(&p);
    assert_eq!(list.skills.keys().collect::<Vec<_>>(), ["mine"]);
    assert_eq!(list.held, ["theirs"]);
}

#[test]
fn a_skill_crosses_with_its_scripts_and_compares_equal_after() {
    let (from, to) = (place(), place());
    write(&from.skills, "deploy/SKILL.md", &doc("run the script"));
    write(&from.skills, "deploy/scripts/go.sh", "#!/bin/sh\n");
    write(&from.skills, "deploy/agents/openai.yaml", "policy: {}\n");
    write(&from.skills, "deploy/.DS_Store", "junk");
    let script = from.skills.join("deploy/scripts/go.sh");
    fsperm::set_mode(&script, 0o755).unwrap();

    let sent = item(&from, "deploy");
    let stored = apply_to(&store(&to), "deploy", &sent).unwrap();

    assert_eq!(stored, listed(&from).skills["deploy"].hash);
    assert_eq!(stored, listed(&to).skills["deploy"].hash);
    assert_eq!(stored, wire_digest(&sent).unwrap());
    assert!(!to.skills.join("deploy/.DS_Store").exists());
    #[cfg(unix)]
    {
        let meta = std::fs::metadata(to.skills.join("deploy/scripts/go.sh")).unwrap();
        assert!(is_exec(&meta));
    }
}

#[test]
fn claude_gets_its_way_to_a_skill_that_arrives() {
    let (from, to) = (place(), place());
    write(&from.skills, "deploy/SKILL.md", &doc("body"));
    apply_to(&store(&to), "deploy", &item(&from, "deploy")).unwrap();
    assert!(to.claude.join("deploy/SKILL.md").is_file());
}

#[test]
fn an_update_replaces_the_folder_and_keeps_the_claude_link() {
    let (from, to) = (place(), place());
    write(&to.skills, "deploy/SKILL.md", &doc("old"));
    write(&to.skills, "deploy/gone.txt", "old file");
    store(&to).link_claude("deploy").unwrap();
    write(&from.skills, "deploy/SKILL.md", &doc("new"));

    apply_to(&store(&to), "deploy", &item(&from, "deploy")).unwrap();

    let read = std::fs::read_to_string(to.claude.join("deploy/SKILL.md")).unwrap();
    assert!(read.contains("new"));
    assert!(!to.skills.join("deploy/gone.txt").exists());
    let leftovers: Vec<_> = std::fs::read_dir(&to.skills)
        .unwrap()
        .flatten()
        .map(|e| e.file_name())
        .filter(|n| n != "deploy")
        .collect();
    assert!(leftovers.is_empty(), "{leftovers:?}");
}

#[test]
fn a_skill_stays_in_the_folder_this_computer_keeps_it_in() {
    let (from, to) = (place(), place());
    write(&to.claude, "deploy/SKILL.md", &doc("old"));
    write(&from.skills, "deploy/SKILL.md", &doc("new"));
    apply_to(&store(&to), "deploy", &item(&from, "deploy")).unwrap();
    assert!(std::fs::read_to_string(to.claude.join("deploy/SKILL.md")).unwrap().contains("new"));
    assert!(!to.skills.join("deploy").exists());
}

#[test]
fn someone_elses_skill_is_never_replaced_or_deleted() {
    let (from, to) = (place(), place());
    write(&from.skills, "lint/SKILL.md", &doc("mine"));
    let theirs = "---\nname: lint\ndescription: d\n---\n\ntheirs\n";
    write(&to.claude, "lint/SKILL.md", theirs);

    assert!(apply_to(&store(&to), "lint", &item(&from, "lint")).is_err());
    assert!(delete_from(&store(&to), "lint").is_err());
    assert_eq!(std::fs::read_to_string(to.claude.join("lint/SKILL.md")).unwrap(), theirs);
}

#[test]
fn a_bundle_without_the_mark_is_refused() {
    let to = place();
    let content = base64_encode(b"---\nname: x\ndescription: d\n---\n\nbody\n");
    let sent = json!({ "files": [{ "path": "SKILL.md", "b64": content }] }).to_string();
    assert!(apply_to(&store(&to), "x", sent.as_bytes()).is_err());
    assert!(!to.skills.join("x").exists());
}

#[test]
fn a_path_out_of_the_folder_is_refused() {
    let to = place();
    let skill = base64_encode(doc("body").as_bytes());
    for path in ["../evil", "/tmp/evil", "a/../../evil", "a\\evil", ""] {
        let sent = json!({ "files": [
            { "path": "SKILL.md", "b64": skill },
            { "path": path, "b64": "" },
        ] })
        .to_string();
        assert!(apply_to(&store(&to), "x", sent.as_bytes()).is_err(), "{path}");
    }
    assert!(!to.skills.join("x").exists());
}

#[test]
fn a_name_outside_the_standard_is_refused() {
    let (from, to) = (place(), place());
    write(&from.skills, "deploy/SKILL.md", &doc("body"));
    assert!(apply_to(&store(&to), "../evil", &item(&from, "deploy")).is_err());
}

#[test]
fn a_deleted_skill_goes_with_its_link() {
    let p = place();
    write(&p.skills, "deploy/SKILL.md", &doc("body"));
    store(&p).link_claude("deploy").unwrap();
    delete_from(&store(&p), "deploy").unwrap();
    assert!(!p.skills.join("deploy/SKILL.md").exists());
    assert!(std::fs::symlink_metadata(p.claude.join("deploy")).is_err());
    delete_from(&store(&p), "deploy").unwrap();
}

#[test]
fn a_folder_too_large_to_send_is_held() {
    let p = place();
    write(&p.skills, "big/SKILL.md", &doc("body"));
    let file = std::fs::File::create(p.skills.join("big/blob")).unwrap();
    file.set_len(MAX_SKILL_BYTES + 1).unwrap();
    let list = listed(&p);
    assert!(list.skills.is_empty());
    assert_eq!(list.held, ["big"]);
}

#[cfg(unix)]
#[test]
fn a_linked_skill_folder_is_held_and_never_written_through() {
    let (from, to) = (place(), place());
    write(&from.skills, "deploy/SKILL.md", &doc("new"));
    let elsewhere = to._dir.path().join("dotfiles/deploy");
    write(&elsewhere, "SKILL.md", &doc("mine"));
    std::fs::create_dir_all(&to.skills).unwrap();
    std::os::unix::fs::symlink(&elsewhere, to.skills.join("deploy")).unwrap();

    assert_eq!(listed(&to).held, ["deploy"]);
    assert!(apply_to(&store(&to), "deploy", &item(&from, "deploy")).is_err());
    assert!(std::fs::read_to_string(elsewhere.join("SKILL.md")).unwrap().contains("mine"));
}

#[cfg(unix)]
#[test]
fn a_root_that_cant_be_read_isnt_an_empty_list() {
    let p = place();
    write(&p.skills, "deploy/SKILL.md", &doc("body"));
    fsperm::set_mode(&p.skills, 0o000).unwrap();
    let unreadable = std::fs::read_dir(&p.skills).is_err();
    let list = list_of(&store(&p));
    fsperm::set_mode(&p.skills, 0o755).unwrap();
    if unreadable {
        assert!(list.is_none());
    }
}

#[test]
fn no_skills_root_yet_is_an_empty_list() {
    let p = place();
    assert!(listed(&p).skills.is_empty());
}

#[test]
fn a_backup_holds_lpms_skills_and_not_the_others() {
    let p = place();
    write(&p.skills, "mine/SKILL.md", &doc("body"));
    write(&p.skills, "mine/scripts/go.sh", "x");
    write(&p.skills, "theirs/SKILL.md", "---\nname: theirs\ndescription: d\n---\n\nbody\n");
    let dst = p._dir.path().join("backup");
    back_up_from(&store(&p), &dst).unwrap();
    assert!(dst.join("mine/scripts/go.sh").is_file());
    assert!(!dst.join("theirs").exists());
}
