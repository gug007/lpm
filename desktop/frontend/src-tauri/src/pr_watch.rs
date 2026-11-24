// Pull requests being opened or reviewed, for the automations that react to it
// (jobs/event_runs.rs). While some automation here listens, each repository it
// covers is asked every two minutes through `gh` (pr_watch_github.rs) or `glab`
// (pr_watch_gitlab.rs) which are open, and what was said on the ones you opened.
// The first look only takes stock, so what came in before lpm was watching says
// nothing. Anyone can comment on a public repository, and a run acts with your
// permissions, so only people with write access and bots count, and never you.
use crate::githost::{origin_parts, Forge};
use crate::jobs::event_pulls::{self, News, PullRequestNews, PullRequestsWanted};
use crate::jobs::event_runs;
use crate::pr_watch_state::{Pull, RepoState, Review};
use crate::pr_watch_text as text;
use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant};
use tauri::AppHandle;

const TICK: Duration = Duration::from_secs(15);
const POLL_EVERY: Duration = Duration::from_secs(2 * 60);
const MAX_WAIT: Duration = Duration::from_secs(30 * 60);
const PROJECTS_EVERY: Duration = Duration::from_secs(5 * 60);

pub fn start(app: AppHandle) {
    let _ = std::thread::Builder::new()
        .name("pr-watch".into())
        .spawn(move || {
            let mut watch = PrWatch::default();
            loop {
                std::thread::sleep(TICK);
                match event_runs::pull_requests_wanted() {
                    Some(wanted) => watch.tick(&app, &wanted, Instant::now()),
                    None => watch = PrWatch::default(),
                }
            }
        });
}

/// A local project's folder in a repository.
#[derive(Clone, Debug, PartialEq)]
struct Checkout {
    project: String,
    /// The original it's a copy of, or itself: whose automations react.
    family: String,
    root: String,
}

#[derive(Default)]
struct PrWatch {
    repos: HashMap<String, Vec<Checkout>>,
    repos_read: Option<Instant>,
    states: HashMap<String, Watched>,
}

struct Watched {
    state: RepoState,
    next: Instant,
    wait: Duration,
}

/// Every local checkout, by the repository its origin names.
fn local_repos() -> HashMap<String, Vec<Checkout>> {
    let archived = crate::project_archive::hidden_names();
    let mut names = crate::config::project_names();
    names.sort();
    let mut repos: HashMap<String, Vec<Checkout>> = HashMap::new();
    for project in names.into_iter().filter(|n| !archived.contains(n)) {
        let Ok((root, false)) = crate::config::project_root(&project) else {
            continue;
        };
        if crate::label_git::locate(&root).is_none() {
            continue;
        }
        let url = crate::git::git_out(&root, &["remote", "get-url", "origin"]).unwrap_or_default();
        let Some((host, path)) = origin_parts(&url) else {
            continue;
        };
        let family = crate::config::peek_parent(&project).unwrap_or_else(|| project.clone());
        repos
            .entry(format!("{host}/{path}").to_lowercase())
            .or_default()
            .push(Checkout { project, family, root });
    }
    repos
}

/// The projects of a repository whose automations react.
fn listeners(checkouts: &[Checkout], wanted: &PullRequestsWanted) -> Vec<String> {
    let mut families: Vec<String> = Vec::new();
    for c in checkouts {
        if wanted.wants(&c.family) && !families.contains(&c.family) {
            families.push(c.family.clone());
        }
    }
    families
}

/// The project already on `pull`'s branch: one of `family`'s copies first, then
/// `family` itself, then any other.
fn checkout_on(
    checkouts: &[Checkout],
    family: &str,
    pull: &Pull,
    branch_of: impl Fn(&str) -> Option<String>,
) -> Option<String> {
    // A fork's branch can share its name with one here.
    if pull.from_fork && !pull.mine {
        return None;
    }
    let mut on: Vec<&Checkout> = checkouts
        .iter()
        .filter(|c| branch_of(&c.root).as_deref() == Some(pull.branch.as_str()))
        .collect();
    on.sort_by_key(|c| match (c.family == family, c.project == c.family) {
        (true, false) => 0,
        (true, true) => 1,
        _ => 2,
    });
    on.first().map(|c| c.project.clone())
}

impl PrWatch {
    fn tick(&mut self, app: &AppHandle, wanted: &PullRequestsWanted, now: Instant) {
        if self
            .repos_read
            .is_none_or(|at| now.duration_since(at) >= PROJECTS_EVERY)
        {
            self.repos = local_repos();
            self.repos_read = Some(now);
        }
        let mut live: HashSet<&String> = HashSet::new();
        for (id, checkouts) in &self.repos {
            let families = listeners(checkouts, wanted);
            if families.is_empty() {
                continue;
            }
            live.insert(id);
            let watched = self.states.entry(id.clone()).or_insert_with(|| Watched {
                state: RepoState::default(),
                next: now,
                wait: POLL_EVERY,
            });
            if watched.next > now {
                continue;
            }
            watched.wait = match poll(app, &mut watched.state, checkouts, &families, wanted) {
                Ok(()) => POLL_EVERY,
                Err(_) => (watched.wait * 2).min(MAX_WAIT),
            };
            watched.next = now + watched.wait;
        }
        self.states.retain(|id, _| live.contains(id));
    }
}

enum Source<'a> {
    GitHub,
    GitLab(&'a crate::githost::GitLabRepo),
}

fn poll(
    app: &AppHandle,
    state: &mut RepoState,
    checkouts: &[Checkout],
    families: &[String],
    wanted: &PullRequestsWanted,
) -> Result<(), String> {
    let cwd = checkouts.first().map(|c| c.root.as_str()).unwrap_or_default();
    let forge = crate::githost::forge(cwd);
    let source = match &forge {
        Forge::GitHub => Source::GitHub,
        Forge::GitLab(repo) => Source::GitLab(repo),
    };
    let listing = match source {
        Source::GitHub => crate::pr_watch_github::open(cwd)?,
        Source::GitLab(repo) => crate::pr_watch_gitlab::open(cwd, repo)?,
    };
    let changes = state.take_in(&listing);
    let words = match source {
        Source::GitHub => text::Words::GITHUB,
        Source::GitLab(_) => text::Words::GITLAB,
    };
    let announce = |pull: &Pull, summary: &dyn Fn(&str) -> String, detail: &str, news: &dyn Fn() -> News| {
        for family in families {
            event_pulls::pull_request(
                app,
                PullRequestNews {
                    project: family.clone(),
                    checkout: checkout_on(checkouts, family, pull, crate::label_git::read_branch),
                    number: pull.number,
                    url: pull.url.clone(),
                    branch: pull.branch.clone(),
                    base: pull.base.clone(),
                    commit: pull.head.clone(),
                    summary: summary(&crate::config::project_display_name(family)),
                    detail: detail.to_string(),
                    news: news(),
                    opened_by_me: pull.mine.then(|| pull.created_at()).flatten(),
                },
            );
        }
    };

    let writes = |bot: bool, login: &str| bot || crate::pr_watch_github::can_write(cwd, login);
    // Who can push is only told to those who can, so on a repository of someone
    // else's being one of its members has to do.
    let trusts = |r: &Review| match source {
        Source::GitHub if listing.can_push => writes(r.bot, &r.author),
        _ => true,
    };

    if wanted.opened {
        for pull in &changes.opened {
            let trusted = match source {
                _ if pull.mine => true,
                Source::GitHub => pull.trusted && listing.can_push && writes(pull.bot, &pull.author),
                Source::GitLab(repo) => crate::pr_watch_gitlab::can_write(cwd, repo, pull.author_id),
            };
            if trusted {
                announce(pull, &|place| text::opened(&words, pull, place), "", &|| News::Opened);
            }
        }
    }
    if !wanted.reviews {
        state.settle(changes.talked.iter().map(|p| p.seen()));
        return Ok(());
    }
    for pull in &changes.talked {
        let reviews = match source {
            Source::GitHub => crate::pr_watch_github::reviews(cwd, pull.number),
            Source::GitLab(repo) => crate::pr_watch_gitlab::reviews(cwd, repo, pull.number),
        };
        // Left unsettled, it's read again on the next look.
        let Ok(reviews) = reviews else { continue };
        let since = state.mark(pull.number).to_string();
        let theirs: Vec<_> = reviews
            .iter()
            .filter(|r| r.counts(&listing.me) && trusts(r))
            .collect();
        let fresh: Vec<_> = theirs.iter().copied().filter(|r| r.at > since).collect();
        if let Some(newest) = fresh.iter().map(|r| r.at.as_str()).max() {
            let detail = text::detail(&fresh, &theirs);
            announce(
                pull,
                &|place| text::reviewed(&words, pull, &fresh, place),
                &detail,
                &|| News::Reviewed {
                    at: newest.to_string(),
                    bots_only: fresh.iter().all(|r| r.bot),
                },
            );
        }
        let newest = reviews.iter().map(|r| r.at.clone()).max().unwrap_or_default();
        state.settle([pull.seen().marked(newest.max(since))]);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn checkout(project: &str, family: &str) -> Checkout {
        Checkout {
            project: project.into(),
            family: family.into(),
            root: format!("/{project}"),
        }
    }

    fn on(checkouts: &[Checkout], family: &str, pull: &Pull, branches: &[(&str, &str)]) -> Option<String> {
        checkout_on(checkouts, family, pull, |root| {
            branches
                .iter()
                .find(|(project, _)| root == format!("/{project}"))
                .map(|(_, branch)| branch.to_string())
        })
    }

    #[test]
    fn work_goes_to_the_copy_on_the_branch_before_the_original() {
        let all = [checkout("web", "web"), checkout("web-a1", "web"), checkout("clone", "clone")];
        let pull = Pull { branch: "feat/x".into(), mine: true, ..Pull::default() };
        assert_eq!(on(&all, "web", &pull, &[("web", "main")]), None);
        assert_eq!(on(&all, "web", &pull, &[("web", "feat/x")]), Some("web".into()));
        assert_eq!(
            on(&all, "web", &pull, &[("web", "feat/x"), ("web-a1", "feat/x")]),
            Some("web-a1".into())
        );
        assert_eq!(on(&all, "web", &pull, &[("clone", "feat/x")]), Some("clone".into()));
    }

    #[test]
    fn a_forks_branch_is_not_the_one_of_that_name_here() {
        let all = [checkout("web", "web")];
        let mut pull = Pull { branch: "main".into(), from_fork: true, ..Pull::default() };
        assert_eq!(on(&all, "web", &pull, &[("web", "main")]), None);
        pull.mine = true;
        assert_eq!(on(&all, "web", &pull, &[("web", "main")]), Some("web".into()));
    }

    #[test]
    fn a_repositorys_originals_listen_once_each() {
        let all = [checkout("web", "web"), checkout("web-a1", "web"), checkout("clone", "clone")];
        assert_eq!(listeners(&all, &PullRequestsWanted::for_test(&["web"])), vec!["web"]);
        assert!(listeners(&all, &PullRequestsWanted::for_test(&["other"])).is_empty());
    }
}
