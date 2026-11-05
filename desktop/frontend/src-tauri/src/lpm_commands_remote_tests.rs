use super::*;
use crate::lpm_commands::{Layout, Reach, AT_ROOT};
use crate::lpm_commands_git::SkillGit;

fn frame(kind: &str, path: &str, body: &str) -> Vec<u8> {
    let mut out = format!("{kind}\u{1f}{path}\u{1f}{}\n", body.len()).into_bytes();
    out.extend_from_slice(body.as_bytes());
    out
}

const MINE: &str = "---\nname: fix\ndescription: Fix\nmetadata:\n  lpm-created: \"true\"\n---\n\nFix it.\n";
const THEIRS: &str = "---\nname: lint\ndescription: Lint\n---\n\nLint.\n";

#[test]
fn a_skill_kept_at_the_top_reads_back_as_that() {
    let bytes = frame("S", "lint", THEIRS);
    let layout = Layout { skills: [("lint".to_string(), AT_ROOT.to_string())].into(), ..Layout::default() };
    let snap = parse_snapshot(&bytes, "/srv/.agents/skills", "/srv/.claude/skills", layout);
    assert!(snap.listed_others[0].at_root);
    assert_eq!(snap.listed_others[0].folder, None);
}

#[test]
fn sorts_the_stream_into_lpm_skills_and_others() {
    let mut bytes = b"L\n".to_vec();
    bytes.extend(frame("S", "fix", MINE));
    bytes.extend(frame("S", "lint", THEIRS));
    bytes.extend(b"K\x1ffix\x1f../../.agents/skills/fix\n");
    bytes.extend(b"K\x1fdotfiles\x1f/home/me/dotfiles/x\n");
    bytes.extend(frame("C", "solo", THEIRS));
    let layout = Layout {
        folders: vec!["Review".to_string()],
        skills: [("fix".to_string(), "Bugs".to_string()), ("lint".to_string(), "Review".to_string())].into(),
    };
    let snap = parse_snapshot(&bytes, "/srv/.agents/skills", "/srv/.claude/skills", layout);
    assert!(snap.legacy);
    assert_eq!(snap.folders, ["Review", "Bugs"]);
    let files: Vec<_> = snap.files.iter().map(|f| (f.name.as_str(), f.doc.body.as_str())).collect();
    assert_eq!(files, [("fix", "Fix it.")]);
    assert_eq!(snap.others, ["lint", "dotfiles", "solo"]);
    assert_eq!(snap.listed_others[0].folder.as_deref(), Some("Review"));
    let listed: Vec<_> = snap.listed_others.iter().map(|o| (o.name.as_str(), o.path.as_str())).collect();
    assert_eq!(
        listed,
        [("lint", "/srv/.agents/skills/lint/SKILL.md"), ("solo", "/srv/.claude/skills/solo/SKILL.md")],
        "a link alone can't be read over SSH, so its name is only held"
    );
    assert_eq!(snap.files[0].reach, Reach { claude: true, codex: true });
}

#[test]
fn a_stream_says_where_git_stands_on_each_skill() {
    let mut bytes = frame("S", "fix", MINE);
    bytes.extend(frame("S", "kept", &MINE.replace("fix", "kept")));
    bytes.extend(b"K\x1fkept\x1f../../.agents/skills/kept\n");
    bytes.extend(b"G\nT\x1f.agents/skills/fix/SKILL.md\n");
    bytes.extend(b"I\x1f.agents/skills/kept\nI\x1f.claude/skills/kept\n");
    let snap = parse_snapshot(&bytes, "", "", Layout::default());
    assert!(snap.in_repo);
    let git = |name: &str| snap.files.iter().find(|f| f.name == name).unwrap().git;
    assert_eq!(git("fix"), SkillGit { tracked: true, ..SkillGit::default() });
    assert_eq!(git("kept"), SkillGit { kept_out: true, ..SkillGit::default() });
}

#[test]
fn a_stream_without_git_is_a_project_outside_a_repo() {
    assert!(!parse_snapshot(&frame("S", "fix", MINE), "", "", Layout::default()).in_repo);
}

#[cfg(unix)]
#[test]
fn the_script_reports_git_as_a_host_would() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let git = |args: &[&str]| {
        assert!(std::process::Command::new("git").args(args).current_dir(root).output().unwrap().status.success());
    };
    git(&["init", "-q"]);
    for name in ["kept", "open"] {
        let skill = root.join(".agents/skills").join(name);
        std::fs::create_dir_all(&skill).unwrap();
        std::fs::write(skill.join("SKILL.md"), MINE.replace("fix", name)).unwrap();
    }
    std::fs::create_dir_all(root.join(".claude/skills")).unwrap();
    std::os::unix::fs::symlink("../../.agents/skills/kept", root.join(".claude/skills/kept")).unwrap();
    std::fs::write(root.join(".git/info/exclude"), "/.agents/skills/kept\n/.claude/skills/kept\n").unwrap();
    git(&["add", ".agents/skills/open"]);

    let quote = |path: &std::path::Path| format!("'{}'", path.display());
    let script = snapshot_script(
        &quote(root),
        &quote(&root.join(".agents/skills")),
        &quote(&root.join(".claude/skills")),
        &quote(&root.join(".lpm")),
    );
    let out = std::process::Command::new("sh").arg("-c").arg(script).output().unwrap();
    assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
    let snap = parse_snapshot(&out.stdout, "", "", Layout::default());
    assert!(snap.in_repo);
    let state = |name: &str| snap.files.iter().find(|f| f.name == name).unwrap().git;
    assert_eq!(state("kept"), SkillGit { kept_out: true, ..SkillGit::default() });
    assert_eq!(state("open"), SkillGit { tracked: true, ..SkillGit::default() });
}

#[cfg(unix)]
#[test]
fn the_script_says_nothing_of_git_outside_a_repo_and_still_succeeds() {
    let dir = tempfile::tempdir().unwrap();
    let path = format!("'{}'", dir.path().display());
    let out = std::process::Command::new("sh")
        .arg("-c")
        .arg(snapshot_script(&path, "'/none/a'", "'/none/b'", "'/none/c'"))
        .env("GIT_CEILING_DIRECTORIES", dir.path().parent().unwrap())
        .output()
        .unwrap();
    assert!(out.status.success());
    assert!(!parse_snapshot(&out.stdout, "", "", Layout::default()).in_repo);
}

#[test]
fn a_skill_with_no_link_on_the_host_is_out_of_claudes_reach() {
    let snap = parse_snapshot(&frame("S", "fix", MINE), "", "", Layout::default());
    assert_eq!(snap.files[0].reach, Reach { claude: false, codex: true });
}

#[test]
fn a_truncated_stream_stops_without_inventing_content() {
    let mut bytes = frame("S", "a", MINE);
    bytes.extend(b"S\x1fb\x1f99\nshort");
    assert_eq!(parse_snapshot(&bytes, "", "", Layout::default()).files.len(), 1);
}

#[test]
fn reads_an_old_list_from_its_stream() {
    let mut bytes = b"D\x1fReview\nD\x1f.hidden\n".to_vec();
    bytes.extend(frame("F", "Review/fix-ticket.md", "Fix it.\nTwice.\n"));
    bytes.extend(frame("F", "explain.md", "Explain."));
    bytes.extend(frame("F", "bad name.md", "skip"));
    let list = parse_legacy(&bytes);
    assert_eq!(list.folders, ["Review"]);
    let files: Vec<_> = list
        .files
        .iter()
        .map(|f| (f.folder.clone(), f.name.clone(), f.content.clone()))
        .collect();
    assert_eq!(
        files,
        [
            (Some("Review".to_string()), "fix-ticket".to_string(), "Fix it.\nTwice.\n".to_string()),
            (None, "explain".to_string(), "Explain.".to_string()),
        ]
    );
}

#[test]
fn paths_stay_quoted_under_home() {
    let fs = RemoteFs::new(SshSettings::default(), "~/code/app");
    assert_eq!(fs.quoted("bugs/SKILL.md"), "\"$HOME\"'/code/app/.agents/skills/bugs/SKILL.md'");
}
