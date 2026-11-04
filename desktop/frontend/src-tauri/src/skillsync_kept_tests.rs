use super::*;
use crate::peersync::{compute_plan_v2, converged_bases, legacy_view, skipped_skills, DigestMap, SyncItem};
use crate::syncstate::BaseState;
use std::process::Command;
use tempfile::TempDir;

const PROJECT: &str = "web";
const REPO: &str = "github.com/acme/web";

fn git(dir: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .args(["-c", "user.email=t@example.com", "-c", "user.name=t"])
        .args(args)
        .current_dir(dir)
        .output()
        .unwrap();
    assert!(out.status.success(), "git {args:?}: {}", String::from_utf8_lossy(&out.stderr));
    String::from_utf8_lossy(&out.stdout).into_owned()
}

fn doc(body: &str) -> String {
    format!("---\nname: x\ndescription: d\nmetadata:\n  lpm-created: \"true\"\n---\n\n{body}\n")
}

struct Computer {
    _dir: TempDir,
    root: PathBuf,
    fs: LocalFs,
}

impl Computer {
    fn at(dir: TempDir, root: PathBuf) -> Self {
        let fs = project_store(&root);
        Self { _dir: dir, root, fs }
    }

    fn new() -> Self {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("repo");
        std::fs::create_dir_all(&root).unwrap();
        git(&root, &["init", "-q"]);
        std::fs::write(root.join("README.md"), "hi\n").unwrap();
        git(&root, &["add", "README.md"]);
        git(&root, &["commit", "-qm", "init"]);
        Self::at(dir, root)
    }

    /// The same repository somewhere else: a clone holds none of the source's
    /// `info/exclude` or ignored files, as a second computer wouldn't.
    fn clone_of(from: &Computer) -> Self {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("repo");
        let source = from.root.to_string_lossy().into_owned();
        git(dir.path(), &["clone", "-q", &source, "repo"]);
        Self::at(dir, root)
    }

    fn write(&self, name: &str, content: &str) {
        let folder = self.root.join(".agents/skills").join(name);
        std::fs::create_dir_all(&folder).unwrap();
        std::fs::write(folder.join("SKILL.md"), content).unwrap();
        self.fs.link_claude(name).unwrap();
    }

    fn kept(&self, name: &str, body: &str) {
        crate::lpm_commands_git::keep_landing(&self.fs, name).unwrap();
        self.write(name, &doc(body));
    }

    fn committed(&self, name: &str, body: &str) {
        self.write(name, &doc(body));
        git(&self.root, &["add", ".agents", ".claude"]);
        git(&self.root, &["commit", "-qm", "skill"]);
    }

    fn list(&self) -> KeptSkills {
        let mut out = KeptSkills::default();
        add_project(PROJECT, REPO.into(), &self.fs, &mut out);
        out
    }

    fn item(&self, name: &str) -> Vec<u8> {
        item_in(&self.fs, &unit(PROJECT, name), name).unwrap().content.into_bytes()
    }

    fn body(&self, name: &str) -> String {
        std::fs::read_to_string(self.root.join(".agents/skills").join(name).join("SKILL.md"))
            .unwrap()
    }

    fn git_sees(&self) -> String {
        git(&self.root, &["status", "--porcelain"])
    }

    fn exclude(&self) -> String {
        std::fs::read_to_string(self.root.join(".git/info/exclude")).unwrap_or_default()
    }
}

#[test]
fn only_a_kept_out_skill_crosses_and_every_other_name_is_held() {
    let c = Computer::new();
    c.kept("private", "mine");
    c.committed("shared", "ours");
    c.write("untracked", &doc("not decided"));
    c.write("theirs", "---\nname: theirs\ndescription: d\n---\n\nbody\n");
    let list = c.list();
    assert_eq!(list.skills.keys().collect::<Vec<_>>(), ["web/private"]);
    assert_eq!(list.held, ["web/shared", "web/theirs", "web/untracked"]);
    assert_eq!(list.repos[PROJECT], REPO);
}

#[test]
fn a_project_with_no_skills_can_still_receive_one() {
    let c = Computer::new();
    let list = c.list();
    assert!(list.skills.is_empty() && list.held.is_empty());
    assert_eq!(list.repos[PROJECT], REPO, "the other computer needs this to pair with it");
}

#[test]
fn a_skill_lands_out_of_git_compares_equal_and_claude_can_find_it() {
    let from = Computer::new();
    let to = Computer::clone_of(&from);
    from.kept("private", "mine");
    apply_in(&to.fs, "private", &from.item("private")).unwrap();
    assert_eq!(to.body("private"), doc("mine"));
    assert!(to.root.join(".claude/skills/private/SKILL.md").is_file());
    assert_eq!(to.git_sees(), "", "nothing to commit: {}", to.exclude());
    assert_eq!(to.list().skills["web/private"].hash, from.list().skills["web/private"].hash);
}

#[test]
fn an_update_lands_and_adds_no_second_rule() {
    let from = Computer::new();
    let to = Computer::clone_of(&from);
    from.kept("private", "first");
    apply_in(&to.fs, "private", &from.item("private")).unwrap();
    let rules = to.exclude();
    from.kept("private", "second");
    apply_in(&to.fs, "private", &from.item("private")).unwrap();
    assert_eq!(to.body("private"), doc("second"));
    assert_eq!(to.exclude(), rules);
}

#[test]
fn a_project_in_a_subfolder_gets_rules_for_its_own_place() {
    let dir = tempfile::tempdir().unwrap();
    let top = dir.path().join("repo");
    let root = top.join("apps/web");
    std::fs::create_dir_all(&root).unwrap();
    git(&top, &["init", "-q"]);
    let to = Computer::at(dir, root);
    let from = Computer::new();
    from.kept("private", "mine");
    apply_in(&to.fs, "private", &from.item("private")).unwrap();
    assert_eq!(git(&top, &["status", "--porcelain"]), "");
    assert!(to.list().skills.contains_key("web/private"));
}

#[test]
fn a_skill_in_git_here_is_never_replaced() {
    let from = Computer::new();
    let to = Computer::new();
    from.kept("shared", "kept out there");
    to.committed("shared", "in git here");
    let err = apply_in(&to.fs, "shared", &from.item("shared")).unwrap_err();
    assert!(err.contains("in Git"), "{err}");
    assert_eq!(to.body("shared"), doc("in git here"));
    assert_eq!(to.git_sees(), "");
    assert!(!to.exclude().contains("shared"));
}

#[test]
fn someone_elses_skill_is_never_replaced() {
    let from = Computer::new();
    let to = Computer::new();
    from.kept("taken", "mine");
    let foreign = "---\nname: taken\ndescription: d\n---\n\nbody\n";
    to.write("taken", foreign);
    assert!(apply_in(&to.fs, "taken", &from.item("taken")).is_err());
    assert_eq!(to.body("taken"), foreign);
}

#[test]
fn a_refused_bundle_leaves_no_rule_behind() {
    let to = Computer::new();
    assert!(apply_in(&to.fs, "private", br#"{"files":[]}"#).is_err());
    assert!(!to.exclude().contains("private"));
}

#[test]
fn only_a_kept_out_skill_can_be_read_for_another_computer() {
    let c = Computer::new();
    c.committed("shared", "ours");
    assert!(item_in(&c.fs, "web/shared", "shared").is_err());
    assert!(item_in(&c.fs, "web/missing", "missing").is_err());
}

#[test]
fn a_delete_takes_the_skill_and_its_rules() {
    let c = Computer::new();
    c.kept("private", "mine");
    delete_in(&c.fs, "private").unwrap();
    assert!(!c.root.join(".agents/skills/private").exists());
    assert!(std::fs::symlink_metadata(c.root.join(".claude/skills/private")).is_err());
    assert!(!c.exclude().contains("private"));
}

#[test]
fn a_delete_leaves_a_skill_in_git_alone() {
    let c = Computer::new();
    c.committed("shared", "ours");
    delete_in(&c.fs, "shared").unwrap();
    assert_eq!(c.body("shared"), doc("ours"));
    assert_eq!(c.git_sees(), "");
}

#[test]
fn a_backup_holds_kept_out_skills_and_nothing_git_can_bring_back() {
    let c = Computer::new();
    c.kept("private", "mine");
    c.committed("shared", "ours");
    let dst = tempfile::tempdir().unwrap();
    skillsync::back_up_where(&c.fs, dst.path(), is_kept_out).unwrap();
    assert!(dst.path().join("private/SKILL.md").is_file());
    assert!(!dst.path().join("shared").exists());
}

// ---- what a sync plans -------------------------------------------------------

fn digest(hash: &str, rev: u64, device: &str) -> ItemDigest {
    ItemDigest { hash: hash.into(), rev, device: device.into(), mtime: 1, ..Default::default() }
}

fn tombstone(rev: u64, device: &str) -> ItemDigest {
    ItemDigest { rev, device: device.into(), deleted: true, ..Default::default() }
}

fn side(skills: &[(&str, ItemDigest)]) -> KeptSkills {
    KeptSkills {
        repos: BTreeMap::from([(PROJECT.to_string(), REPO.to_string())]),
        skills: skills.iter().map(|(u, d)| (u.to_string(), d.clone())).collect(),
        held: Vec::new(),
    }
}

fn map(kept: Option<KeptSkills>) -> DigestMap {
    DigestMap { kept_skills: kept, ..Default::default() }
}

fn agreed(unit: &str, base: BaseState) -> BTreeMap<String, BaseState> {
    BTreeMap::from([(item_key(KIND, unit), base)])
}

fn plan(local: KeptSkills, remote: KeptSkills) -> Vec<SyncItem> {
    compute_plan_v2(&map(Some(local)), &map(Some(remote)), &BTreeMap::new())
}

#[test]
fn a_new_skill_goes_to_the_same_project_on_the_other_computer() {
    let items = plan(side(&[("web/lint", digest("a", 1, "A"))]), side(&[]));
    assert_eq!(items.len(), 1);
    assert_eq!((items[0].kind.as_str(), items[0].name.as_str()), (KIND, "web/lint"));
    assert_eq!(items[0].direction, "toRemote");
    assert!(!items[0].deleted && !items[0].conflict);
}

#[test]
fn nothing_crosses_to_a_different_repository_under_the_same_name() {
    let mut other = side(&[]);
    other.repos.insert(PROJECT.into(), "github.com/someone/web".into());
    assert!(plan(side(&[("web/lint", digest("a", 1, "A"))]), other).is_empty());
}

#[test]
fn nothing_crosses_to_a_project_that_says_nothing_of_its_repository() {
    let mut unknown = side(&[]);
    unknown.repos.clear();
    assert!(plan(side(&[("web/lint", digest("a", 1, "A"))]), unknown).is_empty());
}

#[test]
fn a_name_held_on_either_computer_stays_out_of_the_plan_both_ways() {
    let mut holder = side(&[]);
    holder.held.push("web/lint".into());
    assert!(plan(side(&[("web/lint", digest("a", 1, "A"))]), holder.clone()).is_empty());
    assert!(plan(holder, side(&[("web/lint", digest("a", 1, "A"))])).is_empty());
}

#[test]
fn a_held_name_blocks_a_deletion_too() {
    let mut holder = side(&[]);
    holder.held.push("web/lint".into());
    assert!(plan(side(&[("web/lint", tombstone(2, "A"))]), holder).is_empty());
}

#[test]
fn a_skill_that_is_merely_gone_comes_back() {
    let base = BaseState { rev: 1, digest: "a".into(), deleted: false };
    let remote = map(Some(side(&[("web/lint", digest("a", 1, "B"))])));
    let items = compute_plan_v2(&map(Some(side(&[]))), &remote, &agreed("web/lint", base));
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].direction, "toLocal");
    assert!(!items[0].deleted, "absent is not deleted, whatever was agreed");
}

#[test]
fn a_delete_made_in_lpm_crosses_once_both_computers_agreed_on_the_skill() {
    let base = BaseState { rev: 1, digest: "a".into(), deleted: false };
    let local = map(Some(side(&[("web/lint", tombstone(2, "A"))])));
    let remote = map(Some(side(&[("web/lint", digest("a", 1, "B"))])));
    let items = compute_plan_v2(&local, &remote, &agreed("web/lint", base));
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].direction, "toRemote");
    assert!(items[0].deleted);
}

#[test]
fn a_delete_never_agreed_on_loses_to_the_live_skill() {
    let items = plan(
        side(&[("web/lint", tombstone(2, "A"))]),
        side(&[("web/lint", digest("a", 1, "B"))]),
    );
    assert_eq!(items[0].direction, "toLocal");
    assert!(!items[0].deleted);
}

#[test]
fn two_first_versions_of_a_skill_are_flagged_and_settle_the_same_way_on_both() {
    let (a, b) = (digest("a", 1, "A"), ItemDigest { mtime: 2, ..digest("b", 1, "B") });
    let mine = plan(side(&[("web/lint", a.clone())]), side(&[("web/lint", b.clone())]));
    let theirs = plan(side(&[("web/lint", b)]), side(&[("web/lint", a)]));
    assert!(mine[0].conflict && theirs[0].conflict);
    assert_eq!((mine[0].direction.as_str(), theirs[0].direction.as_str()), ("toLocal", "toRemote"));
}

#[test]
fn the_same_skill_name_in_two_projects_is_two_skills() {
    let mut local = side(&[("web/lint", digest("a", 1, "A")), ("api/lint", digest("b", 1, "A"))]);
    local.repos.insert("api".into(), "github.com/acme/api".into());
    let mut remote = side(&[("web/lint", digest("a", 1, "B"))]);
    remote.repos.insert("api".into(), "github.com/acme/api".into());
    let items = plan(local, remote);
    assert_eq!(items.iter().map(|i| i.name.as_str()).collect::<Vec<_>>(), ["api/lint"]);
}

#[test]
fn an_older_peer_is_left_out_of_it_entirely() {
    let local = map(Some(side(&[("web/lint", digest("a", 1, "A"))])));
    let older: DigestMap = serde_json::from_str(r#"{"projects":{},"globals":{},"templates":{}}"#).unwrap();
    assert!(older.kept_skills.is_none());
    assert!(compute_plan_v2(&local, &older, &BTreeMap::new()).is_empty());
    assert!(skipped_skills(&local, &older).is_empty());
}

#[test]
fn the_legacy_view_drops_them() {
    assert!(legacy_view(map(Some(side(&[])))).kept_skills.is_none());
}

#[test]
fn equal_skills_record_what_both_computers_agreed_on() {
    let local = map(Some(side(&[("web/lint", digest("a", 3, "A"))])));
    let remote = map(Some(side(&[("web/lint", digest("a", 3, "A"))])));
    let bases = converged_bases(&local, &remote);
    assert_eq!(bases.len(), 1);
    assert_eq!(bases[0].0, item_key(KIND, "web/lint"));
    assert_eq!((bases[0].1.rev, bases[0].1.digest.as_str()), (3, "a"));
}

#[test]
fn a_skill_stopped_by_the_other_computer_is_named_without_its_project() {
    let mut holder = side(&[]);
    holder.held.push("web/lint".into());
    let live = side(&[("web/lint", digest("a", 1, "A"))]);
    assert_eq!(skipped_skills(&map(Some(live.clone())), &map(Some(holder.clone()))), ["lint"]);
    assert_eq!(skipped_skills(&map(Some(holder)), &map(Some(live))), ["lint"]);
}

#[test]
fn credentials_in_an_origin_stay_off_the_wire() {
    let key = crate::ignoredpath::repo_key("https://user:secret@github.com/acme/web.git");
    assert_eq!(key, REPO);
}

#[test]
fn a_unit_splits_at_the_skill() {
    assert_eq!(split("web/lint"), Ok(("web", "lint")));
    assert!(split("lint").is_err());
    assert_eq!(item_key(KIND, &unit("web", "lint")), "kept-skill/web/lint");
}
