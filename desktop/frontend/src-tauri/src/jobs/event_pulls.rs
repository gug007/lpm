// Pull requests as an event's source (pr_watch.rs): whose are worth asking the
// forge about, the news of one, and what waits while the run it would start is
// under way.
use super::event_happening::{matches, Happening};
use super::event_runs::{busy, deliver, is_wanted, offer, today};
use super::events::EventKind;
use super::{state_key, Schedule};
use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};
use tauri::AppHandle;

/// Whose pull requests are worth asking the forge about: those of the projects
/// with a job that would react now.
#[derive(Default, Clone)]
pub(crate) struct PullRequestsWanted {
    pub(crate) reviews: bool,
    pub(crate) opened: bool,
    pub(super) projects: HashSet<String>,
    pub(super) anywhere: bool,
}

impl PullRequestsWanted {
    #[cfg(test)]
    pub(crate) fn for_test(projects: &[&str]) -> Self {
        Self {
            reviews: true,
            projects: projects.iter().map(|p| p.to_string()).collect(),
            ..Self::default()
        }
    }

    pub(crate) fn wants(&self, project: &str) -> bool {
        self.anywhere || self.projects.contains(project)
    }
}

/// Something about a pull request of `project`'s repository.
pub(crate) struct PullRequestNews {
    pub(crate) project: String,
    pub(crate) checkout: Option<String>,
    pub(crate) number: u64,
    pub(crate) url: String,
    pub(crate) branch: String,
    pub(crate) base: String,
    pub(crate) commit: String,
    pub(crate) summary: String,
    pub(crate) detail: String,
    pub(crate) news: News,
    /// When it was opened, for one opened as the person signed in.
    pub(crate) opened_by_me: Option<u64>,
}

pub(crate) enum News {
    Opened,
    /// Reviewed, the newest of them at this time.
    Reviewed { at: String, bots_only: bool },
}

pub(crate) fn pull_request(app: &AppHandle, n: PullRequestNews) {
    let (kind, once, bots_only) = match n.news {
        News::Opened => (EventKind::PrOpened, format!("opened:{}", n.url), false),
        News::Reviewed { at, bots_only } => (
            EventKind::PrReviewed,
            format!("review:{}@{at}", n.url),
            bots_only,
        ),
    };
    if !is_wanted(kind) {
        return;
    }
    let mut h = Happening::new(kind, &n.project);
    h.branch = n.branch;
    h.commit = n.commit;
    h.summary = n.summary;
    h.detail = n.detail;
    h.url = n.url;
    h.pull = Some(n.number);
    h.base = n.base;
    h.checkout = n.checkout;
    h.once = once;
    h.bots_only = bots_only;
    if kind == EventKind::PrOpened {
        h.by_me_at = n.opened_by_me;
    }
    deliver(app, h);
}

/// Pull request news that came while a run it would start was under way. CI
/// fails again and a service crashes again, but a review is left once, so it
/// waits; newer news of the same pull request takes its place.
fn held() -> &'static Mutex<Vec<(String, String, Happening)>> {
    static HELD: OnceLock<Mutex<Vec<(String, String, Happening)>>> = OnceLock::new();
    HELD.get_or_init(Default::default)
}

pub(super) fn wait(project: &str, id: &str, h: &Happening) {
    hold(&mut held().lock().unwrap(), project, id, h);
}

fn hold(held: &mut Vec<(String, String, Happening)>, project: &str, id: &str, h: &Happening) {
    held.retain(|(p, i, old)| p != project || i != id || old.kind != h.kind || old.url != h.url);
    held.push((project.to_string(), id.to_string(), h.clone()));
}

/// Offers again what waited for a run to end, oldest first.
pub(super) fn offer_held(app: &AppHandle) {
    let waiting: Vec<(String, String, Happening)> = {
        let mut held = held().lock().unwrap();
        let (free, still): (Vec<_>, Vec<_>) = held
            .drain(..)
            .partition(|(project, id, _)| !busy(&state_key(project, id)));
        *held = still;
        free
    };
    let today = today();
    for (project, id, h) in waiting {
        if let Some(job) = super::find_job(&project, &id) {
            if matches!(&job.schedule, Schedule::Event(spec) if matches(spec, &project, &h)) {
                offer(app, &project, job, &h, &today);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn review(once: &str) -> Happening {
        let mut h = Happening::new(EventKind::PrReviewed, "web");
        h.url = "https://github.com/o/r/pull/212".into();
        h.once = once.into();
        h
    }

    #[test]
    fn newer_news_of_a_pull_request_takes_the_place_of_what_waits() {
        let mut held = Vec::new();
        hold(&mut held, "web", "fix", &review("first"));
        hold(&mut held, "web", "other", &review("first"));
        hold(&mut held, "web", "fix", &review("second"));
        let waiting: Vec<(&str, &str)> = held.iter().map(|(_, id, h)| (id.as_str(), h.once.as_str())).collect();
        assert_eq!(waiting, vec![("other", "first"), ("fix", "second")]);
    }
}
