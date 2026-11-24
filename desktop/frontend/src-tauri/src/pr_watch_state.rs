// What lpm has seen of a repository's open pull requests, and what is new in the
// next listing of them.
use std::collections::HashMap;

/// How many open pull requests a listing holds, the last to change first.
pub(crate) const LISTED: usize = 50;

#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct Pull {
    pub(crate) number: u64,
    pub(crate) title: String,
    pub(crate) url: String,
    pub(crate) author: String,
    /// GitLab's id for the author; 0 on GitHub.
    pub(crate) author_id: u64,
    /// Opened by the person the CLI is signed in as.
    pub(crate) mine: bool,
    /// Opened by a bot or one of the repository's people.
    pub(crate) trusted: bool,
    pub(crate) bot: bool,
    pub(crate) draft: bool,
    pub(crate) from_fork: bool,
    pub(crate) branch: String,
    pub(crate) base: String,
    pub(crate) head: String,
    /// ISO 8601, as the forge's clock has it, so they compare as text.
    pub(crate) created: String,
    pub(crate) updated: String,
}

impl Pull {
    /// When it was opened, in Unix seconds.
    pub(crate) fn created_at(&self) -> Option<u64> {
        let at = chrono::DateTime::parse_from_rfc3339(&self.created).ok()?;
        u64::try_from(at.timestamp()).ok()
    }

    pub(crate) fn seen(&self) -> Seen {
        Seen {
            updated: self.updated.clone(),
            mark: self.updated.clone(),
            draft: self.draft,
            number: self.number,
        }
    }
}

#[derive(Debug, Default)]
pub(crate) struct Listing {
    /// Who the CLI is signed in as.
    pub(crate) me: String,
    /// They can push to the repository.
    pub(crate) can_push: bool,
    pub(crate) pulls: Vec<Pull>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct Seen {
    updated: String,
    /// Reviews up to this time are known.
    mark: String,
    draft: bool,
    number: u64,
}

impl Seen {
    pub(crate) fn marked(mut self, mark: String) -> Self {
        self.mark = mark;
        self
    }
}

#[derive(Debug, Default, PartialEq)]
pub(crate) struct Changes {
    pub(crate) opened: Vec<Pull>,
    /// Mine that something happened on since it was last read.
    pub(crate) talked: Vec<Pull>,
}

#[derive(Default)]
pub(crate) struct RepoState {
    looked: bool,
    seen: HashMap<u64, Seen>,
    /// The newest pull request of any listing so far.
    newest: String,
}

impl RepoState {
    /// What is new in `listing`. One of mine stays new until it's settled.
    pub(crate) fn take_in(&mut self, listing: &Listing) -> Changes {
        let mut changes = Changes::default();
        let first = !std::mem::replace(&mut self.looked, true);
        let newest = self.newest.clone();
        for pull in &listing.pulls {
            if pull.created > self.newest {
                self.newest = pull.created.clone();
            }
            match self.seen.get_mut(&pull.number) {
                _ if first => {
                    self.seen.insert(pull.number, pull.seen());
                }
                None => {
                    // One that only now made the listing's cut isn't new.
                    let new = pull.created > newest;
                    let mut seen = pull.seen();
                    if new {
                        seen.mark = pull.created.clone();
                        seen.updated = String::new();
                    }
                    self.seen.insert(pull.number, seen);
                    if new && !pull.draft {
                        changes.opened.push(pull.clone());
                    }
                    if new && pull.mine {
                        changes.talked.push(pull.clone());
                    }
                }
                Some(seen) => {
                    if seen.draft && !pull.draft {
                        changes.opened.push(pull.clone());
                    }
                    seen.draft = pull.draft;
                    if pull.mine && seen.updated != pull.updated {
                        changes.talked.push(pull.clone());
                    }
                }
            }
        }
        if listing.pulls.len() < LISTED {
            self.seen
                .retain(|number, _| listing.pulls.iter().any(|p| p.number == *number));
        }
        changes
    }

    /// Reviews of `number` up to this time are known.
    pub(crate) fn mark(&self, number: u64) -> &str {
        self.seen.get(&number).map(|s| s.mark.as_str()).unwrap_or("")
    }

    pub(crate) fn settle(&mut self, read: impl IntoIterator<Item = Seen>) {
        for seen in read {
            self.seen.insert(seen.number, seen);
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct LineComment {
    pub(crate) path: String,
    pub(crate) line: Option<u64>,
    pub(crate) body: String,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct Review {
    pub(crate) author: String,
    pub(crate) bot: bool,
    /// A bot, or one of the repository's people.
    pub(crate) trusted: bool,
    /// GitHub's word for the verdict: CHANGES_REQUESTED, COMMENTED, APPROVED…
    pub(crate) state: String,
    pub(crate) at: String,
    pub(crate) body: String,
    pub(crate) comments: Vec<LineComment>,
}

impl Review {
    /// Whether there's something in it for `me` to act on: an approval on its own
    /// asks for nothing, and what `me` wrote, an agent may have written.
    pub(crate) fn counts(&self, me: &str) -> bool {
        self.trusted
            && !self.author.eq_ignore_ascii_case(me)
            && (!self.comments.is_empty()
                || self.state == "CHANGES_REQUESTED"
                || (self.state == "COMMENTED" && !self.body.is_empty()))
    }
}

#[cfg(test)]
#[path = "pr_watch_state_tests.rs"]
mod tests;
