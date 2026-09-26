// Phone-side Auto Commit, Auto Commit and Push and Auto Create PR: the
// `gitAuto`, `gitAutoState`, `gitAutoCancel` and `gitAutoSwitchBase` verbs
// behind the AI items in the mobile Git menu.
//
// The desktop drives these flows from its own UI (autoCommit.ts, autoPR.ts).
// The phone can't: a run chains several AI generations, and a locked phone
// drops its socket long before they finish. So the Mac owns the run end to
// end, keeps the latest state per project, and broadcasts every change to all
// paired phones; a phone that reconnects asks `gitAutoState` to catch up.
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::SyncSender;
use std::sync::{Arc, Mutex, OnceLock};
use tauri::AppHandle;

const PENDING: &str = "pending";
const RUNNING: &str = "running";
const DONE: &str = "done";
const FAILED: &str = "failed";
const SKIPPED: &str = "skipped";

const CANCELED: &str = crate::aigen::AI_CANCELED;

#[derive(Clone, Copy, PartialEq, Debug)]
enum Kind {
    Commit,
    CommitPush,
    Pr,
}

impl Kind {
    fn parse(s: &str) -> Option<Self> {
        match s {
            "commit" => Some(Self::Commit),
            "commitPush" => Some(Self::CommitPush),
            "pr" => Some(Self::Pr),
            _ => None,
        }
    }

    fn name(self) -> &'static str {
        match self {
            Self::Commit => "commit",
            Self::CommitPush => "commitPush",
            Self::Pr => "pr",
        }
    }

    fn steps(self) -> &'static [&'static str] {
        match self {
            Self::Commit => &["commit"],
            Self::CommitPush => &["commit", "push"],
            Self::Pr => &["branch", "commit", "push", "pr"],
        }
    }
}

#[derive(Clone, Serialize)]
struct Step {
    id: &'static str,
    status: &'static str,
    #[serde(skip_serializing_if = "String::is_empty")]
    detail: String,
}

/// Everything the phone renders for a run. Result fields stay empty until the
/// step that produces them lands; `url` is also set when Auto Create PR stops
/// because the branch already has an open pull request.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RunState {
    run_id: u64,
    // Echoed from the phone's start, so a phone waiting on its own start can tell
    // its run from the project's previous one.
    #[serde(skip_serializing_if = "String::is_empty")]
    nonce: String,
    kind: &'static str,
    phase: &'static str,
    canceling: bool,
    steps: Vec<Step>,
    #[serde(skip_serializing_if = "String::is_empty")]
    error: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    message: String,
    rebased: bool,
    #[serde(skip_serializing_if = "String::is_empty")]
    url: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    title: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    branch: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    base: String,
}

struct Run {
    state: RunState,
    cancel: Arc<AtomicBool>,
    // AI generations in flight, so a cancel can reap them mid-run.
    gens: Vec<String>,
}

fn runs() -> &'static Mutex<HashMap<String, Run>> {
    static RUNS: OnceLock<Mutex<HashMap<String, Run>>> = OnceLock::new();
    RUNS.get_or_init(|| Mutex::new(HashMap::new()))
}

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

pub fn handle(app: &AppHandle, out: &SyncSender<String>, t: &str, v: &Value) {
    let field = |k: &str| {
        v.get(k)
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_default()
    };
    let project = field("project");
    match t {
        "gitAuto" => start(app, out, project, &field("kind"), field("nonce")),
        "gitAutoState" => {
            let run = runs()
                .lock()
                .unwrap()
                .get(&project)
                .map(|r| r.state.clone());
            reply(out, frame(&project, run.as_ref()));
        }
        "gitAutoCancel" => cancel(app, &project),
        "gitAutoSwitchBase" => switch_base(out, project, field("base")),
        _ => {}
    }
}

fn frame(project: &str, run: Option<&RunState>) -> Value {
    json!({ "t": "gitAuto", "project": project, "ok": true, "run": run })
}

fn reply(out: &SyncSender<String>, val: Value) {
    let _ = out.try_send(val.to_string());
}

fn start(app: &AppHandle, out: &SyncSender<String>, project: String, kind: &str, nonce: String) {
    let Some(kind) = Kind::parse(kind) else {
        reply(
            out,
            json!({ "t": "gitAuto", "project": project, "ok": false, "error": "Unknown action." }),
        );
        return;
    };
    let cwd = match crate::config::project_root(&project) {
        Ok((cwd, _)) => cwd,
        Err(e) => {
            reply(
                out,
                json!({ "t": "gitAuto", "project": project, "ok": false, "error": e }),
            );
            return;
        }
    };
    let run_id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    let cancel = Arc::new(AtomicBool::new(false));
    let state = {
        let mut map = runs().lock().unwrap();
        // One run per project: a second tap (or another phone) re-attaches to the
        // run already going instead of racing it on the same working tree.
        if let Some(run) = map.get(&project).filter(|r| r.state.phase == RUNNING) {
            reply(out, frame(&project, Some(&run.state)));
            return;
        }
        let state = RunState {
            run_id,
            nonce,
            kind: kind.name(),
            phase: RUNNING,
            canceling: false,
            steps: kind
                .steps()
                .iter()
                .map(|id| Step {
                    id,
                    status: PENDING,
                    detail: String::new(),
                })
                .collect(),
            error: String::new(),
            message: String::new(),
            rebased: false,
            url: String::new(),
            title: String::new(),
            branch: String::new(),
            base: String::new(),
        };
        map.insert(
            project.clone(),
            Run {
                state: state.clone(),
                cancel: cancel.clone(),
                gens: Vec::new(),
            },
        );
        state
    };
    crate::remote::broadcast_frame(app, frame(&project, Some(&state)));

    let tracker = Tracker {
        app: app.clone(),
        project,
        run_id,
        cancel,
    };
    std::thread::spawn(move || {
        let result = match kind {
            Kind::Commit => run_commit(&tracker, &cwd, false),
            Kind::CommitPush => run_commit(&tracker, &cwd, true),
            Kind::Pr => run_pr(&tracker, &cwd),
        };
        tracker.finish(result);
    });
}

fn cancel(app: &AppHandle, project: &str) {
    let (gens, state) = {
        let mut map = runs().lock().unwrap();
        let Some(run) = map.get_mut(project).filter(|r| r.state.phase == RUNNING) else {
            return;
        };
        run.cancel.store(true, Ordering::SeqCst);
        run.state.canceling = true;
        (run.gens.clone(), run.state.clone())
    };
    for gen_id in gens {
        crate::aigen::cancel_ai_generate(gen_id);
    }
    crate::remote::broadcast_frame(app, frame(project, Some(&state)));
}

/// The step Auto Create PR leaves the user on: back to the base branch with its
/// latest commits, as the desktop's PRCreatedView does. A failed pull still
/// counts as switched, and says why.
fn switch_base(out: &SyncSender<String>, project: String, base: String) {
    let cwd = match crate::config::project_root(&project) {
        Ok((cwd, _)) => cwd,
        Err(e) => {
            reply(
                out,
                json!({ "t": "gitAutoSwitchBase", "project": project, "ok": false, "error": e }),
            );
            return;
        }
    };
    let out = out.clone();
    std::thread::spawn(move || {
        let val = match crate::git::checkout_branch(cwd.clone(), base.clone(), String::new()) {
            Err(e) => {
                json!({ "t": "gitAutoSwitchBase", "project": project, "ok": false, "error": e })
            }
            Ok(()) => {
                let (strategy, flags) = crate::remote::git_pull_opts();
                match crate::git::pull_branch(cwd, strategy, flags) {
                    Ok(()) => {
                        json!({ "t": "gitAutoSwitchBase", "project": project, "ok": true, "base": base })
                    }
                    Err(e) => json!({ "t": "gitAutoSwitchBase", "project": project, "ok": true,
                        "base": base, "pullError": e }),
                }
            }
        };
        reply(&out, val);
    });
}

/// A run's handle on the shared registry: every mutation is dropped once a newer
/// run for the same project has replaced this one, and broadcast otherwise.
struct Tracker {
    app: AppHandle,
    project: String,
    run_id: u64,
    cancel: Arc<AtomicBool>,
}

impl Tracker {
    fn mutate(&self, f: impl FnOnce(&mut Run)) -> Option<RunState> {
        let mut map = runs().lock().unwrap();
        let run = map
            .get_mut(&self.project)
            .filter(|r| r.state.run_id == self.run_id)?;
        f(run);
        Some(run.state.clone())
    }

    fn update(&self, f: impl FnOnce(&mut Run)) {
        if let Some(state) = self.mutate(f) {
            crate::remote::broadcast_frame(&self.app, frame(&self.project, Some(&state)));
        }
    }

    fn report(&self, id: &str, status: &'static str, detail: impl Into<String>) {
        let detail = detail.into();
        self.update(|run| set_step(&mut run.state, id, status, detail));
    }

    fn check(&self) -> Result<(), String> {
        if self.cancel.load(Ordering::SeqCst) {
            Err(CANCELED.into())
        } else {
            Ok(())
        }
    }

    /// Run one step: refuse to start once canceled, mark it running, and mark it
    /// failed if it errors. `f` reports its own `done`/`skipped`.
    fn step<T>(
        &self,
        id: &str,
        detail: impl Into<String>,
        f: impl FnOnce() -> Result<T, String>,
    ) -> Result<T, String> {
        self.check()?;
        self.report(id, RUNNING, detail);
        f().inspect_err(|_| self.report(id, FAILED, ""))
    }

    /// One AI generation, registered under its own id while it runs so a cancel
    /// can kill it.
    fn generate(&self, f: impl FnOnce(String) -> Result<String, String>) -> Result<String, String> {
        self.check()?;
        let gen_id = format!(
            "phone-git-auto-{}-{}",
            self.run_id,
            NEXT_ID.fetch_add(1, Ordering::Relaxed)
        );
        self.mutate(|run| run.gens.push(gen_id.clone()));
        let forget = || self.mutate(|run| run.gens.retain(|g| *g != gen_id));
        // A cancel that landed between check() and registration missed this id.
        if self.cancel.load(Ordering::SeqCst) {
            forget();
            return Err(CANCELED.into());
        }
        let result = f(gen_id.clone());
        forget();
        result
    }

    fn finish(&self, result: Result<(), String>) {
        let canceled = self.cancel.load(Ordering::SeqCst);
        self.update(|run| {
            let s = &mut run.state;
            s.canceling = false;
            run.gens.clear();
            match result {
                Ok(()) => s.phase = DONE,
                Err(_) if canceled => {
                    s.phase = "canceled";
                    for step in &mut s.steps {
                        if step.status == RUNNING || step.status == FAILED {
                            step.status = PENDING;
                            step.detail.clear();
                        }
                    }
                }
                Err(e) => {
                    s.phase = FAILED;
                    s.error = e;
                }
            }
        });
    }
}

fn set_step(state: &mut RunState, id: &str, status: &'static str, detail: String) {
    if let Some(step) = state.steps.iter_mut().find(|s| s.id == id) {
        step.status = status;
        step.detail = detail;
    }
}

fn changed_paths(cwd: &str) -> Vec<String> {
    crate::git::git_changed_files(cwd.to_string())
        .into_iter()
        .map(|f| f.path)
        .collect()
}

fn first_line(text: &str) -> String {
    text.lines().next().unwrap_or("").trim().to_string()
}

/// Write the message with AI and commit every changed file; returns the message.
fn commit_all(t: &Tracker, cwd: &str) -> Result<String, String> {
    let paths = changed_paths(cwd);
    if paths.is_empty() {
        return Err("No changes to commit.".into());
    }
    let (cli, model, effort, fast) = crate::remote::git_ai_opts();
    let message = t
        .generate(|gen_id| {
            crate::aigen::generate_commit_message(
                t.app.clone(),
                t.project.clone(),
                cwd.to_string(),
                cli,
                model,
                effort,
                fast,
                paths.clone(),
                String::new(),
                gen_id,
            )
        })?
        .trim()
        .to_string();
    if message.is_empty() {
        return Err("The AI returned an empty commit message.".into());
    }
    t.check()?;
    t.report("commit", RUNNING, "Committing…");
    crate::git::git_commit(cwd.to_string(), message.clone(), paths)?;
    Ok(message)
}

fn run_commit(t: &Tracker, cwd: &str, push: bool) -> Result<(), String> {
    let message = t.step("commit", "Writing the commit message…", || {
        commit_all(t, cwd)
    })?;
    let line = first_line(&message);
    t.update(|run| {
        set_step(&mut run.state, "commit", DONE, line.clone());
        run.state.message = line;
    });
    if !push {
        return Ok(());
    }
    let branch = crate::git::git_status(cwd.to_string()).branch;
    let rebased = t.step("push", format!("Pushing {branch}…"), || {
        crate::gitpush::git_push_rebasing(cwd.to_string(), crate::remote::git_push_flags())
    })?;
    t.update(|run| {
        set_step(&mut run.state, "push", DONE, format!("origin/{branch}"));
        run.state.rebased = rebased;
    });
    Ok(())
}

/// Which Auto Create PR steps a checkout needs, mirroring autoPR.ts planAutoPR.
#[derive(Debug, PartialEq)]
struct Plan {
    branch: bool,
    commit: bool,
    push: bool,
}

fn plan(status: &crate::git::GitStatus, base: &str) -> Result<Plan, String> {
    if !status.is_git_repo {
        return Err("Not a git repository.".into());
    }
    let branch = status.detached || status.branch.is_empty() || status.branch == base;
    let commit = status.uncommitted > 0;
    if branch && !commit {
        let at = if status.detached { "this commit" } else { base };
        return Err(format!(
            "Nothing to open a pull request for: no changes on {at}."
        ));
    }
    let push = branch || commit || !status.has_upstream || status.ahead > 0;
    Ok(Plan {
        branch,
        commit,
        push,
    })
}

fn run_pr(t: &Tracker, cwd: &str) -> Result<(), String> {
    let status = crate::git::git_status(cwd.to_string());
    let base = crate::git::git_default_branch(cwd.to_string());
    let plan = plan(&status, &base)?;
    if !plan.branch {
        t.report("branch", SKIPPED, format!("Already on {}", status.branch));
    }
    if !plan.commit {
        t.report("commit", SKIPPED, "No uncommitted changes");
    }
    if !plan.push {
        t.report("push", SKIPPED, "Already pushed");
    }
    if !plan.branch {
        if let Some(pr) = crate::pull_request::branch_pull_request(cwd.to_string())
            .filter(|pr| pr.state == "OPEN")
        {
            let url = pr.url.clone();
            t.update(|run| run.state.url = url);
            return Err(format!(
                "{} already has an open pull request (#{}).",
                status.branch, pr.number
            ));
        }
    }

    let (cli, model, effort, fast) = crate::remote::git_ai_opts();
    let mut branch = status.branch.clone();
    if plan.branch {
        branch = t.step("branch", "Naming the branch…", || {
            let raw = t.generate(|gen_id| {
                crate::aigen::generate_branch_name(
                    t.app.clone(),
                    t.project.clone(),
                    cwd.to_string(),
                    cli.clone(),
                    model.clone(),
                    effort.clone(),
                    fast,
                    gen_id,
                )
            })?;
            let name = slugify_branch(&raw);
            if name.is_empty() {
                return Err("The AI returned an empty branch name.".into());
            }
            t.check()?;
            t.report("branch", RUNNING, format!("Creating {name}…"));
            crate::git::create_branch(cwd.to_string(), name.clone())?;
            Ok(name)
        })?;
        t.update(|run| {
            set_step(&mut run.state, "branch", DONE, branch.clone());
            run.state.branch = branch.clone();
        });
    }

    if plan.commit {
        let committed = t.step("commit", "Writing the commit message…", || {
            if changed_paths(cwd).is_empty() {
                return Ok(None);
            }
            commit_all(t, cwd).map(Some)
        })?;
        match committed {
            Some(message) => t.report("commit", DONE, first_line(&message)),
            None => t.report("commit", SKIPPED, "No uncommitted changes"),
        }
    }

    if plan.push {
        t.step("push", format!("Pushing {branch}…"), || {
            crate::git::git_push(cwd.to_string(), crate::remote::git_push_flags())
        })?;
        t.report("push", DONE, format!("origin/{branch}"));
    }

    let (title, url) = t.step("pr", "Writing the title and description…", || {
        let generate = |f: PrGenerator| {
            t.generate(|gen_id| {
                f(
                    t.app.clone(),
                    t.project.clone(),
                    cwd.to_string(),
                    cli.clone(),
                    model.clone(),
                    effort.clone(),
                    fast,
                    base.clone(),
                    gen_id,
                )
            })
        };
        let (title, body) = std::thread::scope(|s| {
            let body = s.spawn(|| generate(crate::aigen::generate_pr_description));
            let title = generate(crate::aigen::generate_pr_title);
            let body = body
                .join()
                .unwrap_or_else(|_| Err("Writing the description failed.".into()));
            (title, body)
        });
        let title = first_line(&title?);
        let body = body?;
        if title.is_empty() {
            return Err("The AI returned an empty pull request title.".into());
        }
        t.check()?;
        t.report("pr", RUNNING, "Opening the pull request…");
        let url = crate::git::create_pull_request(
            cwd.to_string(),
            title.clone(),
            body.trim().to_string(),
            base.clone(),
        )?;
        Ok((title, url.trim().to_string()))
    })?;
    t.update(|run| {
        let s = &mut run.state;
        set_step(s, "pr", DONE, title.clone());
        s.url = url;
        s.title = title;
        s.branch = branch;
        s.base = base;
    });
    Ok(())
}

type PrGenerator = fn(
    AppHandle,
    String,
    String,
    String,
    String,
    String,
    bool,
    String,
    String,
) -> Result<String, String>;

/// slugify.ts with `allowSlash`: lower-case, runs of anything outside
/// `[a-z0-9/_.-]` become one hyphen, no leading or trailing hyphens.
fn slugify_branch(s: &str) -> String {
    let mut out = String::new();
    for c in s.trim().to_lowercase().chars() {
        let keep = c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '/' | '_' | '.');
        let c = if keep { c } else { '-' };
        if c == '-' && out.ends_with('-') {
            continue;
        }
        out.push(c);
    }
    out.trim_matches('-').to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::GitStatus;

    fn status(branch: &str, uncommitted: i64, has_upstream: bool, ahead: i64) -> GitStatus {
        GitStatus {
            branch: branch.into(),
            detached: false,
            uncommitted,
            is_git_repo: true,
            has_upstream,
            ahead,
            behind: 0,
            has_remote: true,
        }
    }

    #[test]
    fn slugify_matches_the_desktop() {
        assert_eq!(slugify_branch("  Feat/Add Login  "), "feat/add-login");
        assert_eq!(
            slugify_branch("fix: crash -- on   start!"),
            "fix-crash-on-start"
        );
        assert_eq!(
            slugify_branch("`chore/bump_deps.v2`\n"),
            "chore/bump_deps.v2"
        );
        assert_eq!(slugify_branch("Émoji ✨ branch"), "moji-branch");
        assert_eq!(slugify_branch("---"), "");
    }

    #[test]
    fn default_branch_with_changes_needs_everything() {
        let p = plan(&status("main", 3, true, 0), "main").unwrap();
        assert_eq!(
            p,
            Plan {
                branch: true,
                commit: true,
                push: true
            }
        );
    }

    #[test]
    fn clean_default_branch_has_nothing_to_submit() {
        let e = plan(&status("main", 0, true, 0), "main").unwrap_err();
        assert!(e.contains("no changes on main"), "{e}");
        let mut detached = status("", 0, false, 0);
        detached.detached = true;
        assert!(plan(&detached, "main").unwrap_err().contains("this commit"));
    }

    #[test]
    fn pushed_feature_branch_only_opens_the_pr() {
        let p = plan(&status("feat/x", 0, true, 0), "main").unwrap();
        assert_eq!(
            p,
            Plan {
                branch: false,
                commit: false,
                push: false
            }
        );
    }

    #[test]
    fn unpushed_feature_branch_pushes() {
        assert!(plan(&status("feat/x", 0, false, 0), "main").unwrap().push);
        assert!(plan(&status("feat/x", 0, true, 2), "main").unwrap().push);
        let p = plan(&status("feat/x", 1, true, 0), "main").unwrap();
        assert!(!p.branch && p.commit && p.push);
    }

    #[test]
    fn not_a_repo_is_refused() {
        let mut s = status("", 0, false, 0);
        s.is_git_repo = false;
        assert_eq!(plan(&s, "").unwrap_err(), "Not a git repository.");
    }

    #[test]
    fn kinds_round_trip() {
        for k in [Kind::Commit, Kind::CommitPush, Kind::Pr] {
            assert_eq!(Kind::parse(k.name()), Some(k));
        }
        assert_eq!(Kind::parse("merge"), None);
    }
}
