// How a run is told about a pull request (jobs/event_runs.rs).
use crate::pr_watch_state::{LineComment, Pull, Review};
use crate::untrusted::{one_line, plain};

/// The detail travels in an environment variable and in the agent's prompt.
const DETAIL_CHARS: usize = 8000;

pub(crate) struct Words {
    noun: &'static str,
    mark: &'static str,
}

impl Words {
    pub(crate) const GITHUB: Words = Words {
        noun: "pull request",
        mark: "#",
    };
    pub(crate) const GITLAB: Words = Words {
        noun: "merge request",
        mark: "!",
    };

    fn name(&self, pull: &Pull) -> String {
        let title = one_line(&pull.title);
        let title: String = title.chars().take(120).collect();
        format!("{} {}{} ({title})", self.noun, self.mark, pull.number)
    }
}

pub(crate) fn opened(words: &Words, pull: &Pull, place: &str) -> String {
    format!("{} opened {} in {place}", one_line(&pull.author), words.name(pull))
}

pub(crate) fn reviewed(words: &Words, pull: &Pull, fresh: &[&Review], place: &str) -> String {
    let mut who: Vec<String> = Vec::new();
    for review in fresh {
        let author = one_line(&review.author);
        if !who.contains(&author) {
            who.push(author);
        }
    }
    let asked = fresh.iter().any(|r| r.state == "CHANGES_REQUESTED");
    let did = if asked { "requested changes on" } else { "commented on" };
    let who = match who.as_slice() {
        [] => "Someone".to_string(),
        [one] => one.clone(),
        [one, two] => format!("{one} and {two}"),
        [one, rest @ ..] => format!("{one} and {} others", rest.len()),
    };
    format!("{who} {did} {} in {place}", words.name(pull))
}

/// The new reviews in full, then the earlier ones as far as they fit.
pub(crate) fn detail(fresh: &[&Review], all: &[&Review]) -> String {
    let earlier: Vec<&Review> = all
        .iter()
        .copied()
        .filter(|r| !fresh.iter().any(|f| std::ptr::eq(*f, *r)))
        .collect();
    let mut out = format!("New:\n{}", list(fresh));
    if !earlier.is_empty() {
        out.push_str(&format!("\n\nEarlier:\n{}", list(&earlier)));
    }
    if out.chars().count() > DETAIL_CHARS {
        let kept: String = out.chars().take(DETAIL_CHARS).collect();
        out = format!("{}…", kept.trim_end());
    }
    out
}

fn list(reviews: &[&Review]) -> String {
    reviews.iter().map(|r| entry(r)).collect::<Vec<_>>().join("\n")
}

fn entry(review: &Review) -> String {
    let verdict = match review.state.as_str() {
        "CHANGES_REQUESTED" => "requested changes",
        "APPROVED" => "approved",
        "DISMISSED" => "had a review dismissed",
        _ => "commented",
    };
    let mut out = format!("- {} {verdict}", one_line(&review.author));
    let body = plain(&review.body);
    if !body.is_empty() {
        out.push_str(&format!(": {}", indented(&body, 2)));
    }
    for comment in &review.comments {
        out.push_str(&format!("\n  - {}", line_entry(comment)));
    }
    out
}

fn line_entry(comment: &LineComment) -> String {
    let path = one_line(&comment.path);
    let place = match comment.line {
        Some(line) => format!("{path}:{line}"),
        None => path,
    };
    format!("{place}: {}", indented(&plain(&comment.body), 4))
}

fn indented(text: &str, by: usize) -> String {
    text.replace('\n', &format!("\n{}", " ".repeat(by)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pull() -> Pull {
        Pull {
            number: 212,
            title: "Add CSV\nexport".into(),
            author: "maria".into(),
            ..Pull::default()
        }
    }

    fn review(author: &str, state: &str, body: &str) -> Review {
        Review {
            author: author.into(),
            state: state.into(),
            body: body.into(),
            ..Review::default()
        }
    }

    #[test]
    fn says_who_did_what_where() {
        let p = pull();
        assert_eq!(
            opened(&Words::GITHUB, &p, "Web"),
            "maria opened pull request #212 (Add CSV export) in Web"
        );
        let a = review("maria", "COMMENTED", "x");
        let b = review("sam", "CHANGES_REQUESTED", "");
        let c = review("coderabbitai", "COMMENTED", "y");
        assert_eq!(
            reviewed(&Words::GITLAB, &p, &[&a, &a], "Web"),
            "maria commented on merge request !212 (Add CSV export) in Web"
        );
        assert_eq!(
            reviewed(&Words::GITHUB, &p, &[&a, &b], "Web"),
            "maria and sam requested changes on pull request #212 (Add CSV export) in Web"
        );
        assert!(reviewed(&Words::GITHUB, &p, &[&a, &b, &c], "Web").starts_with("maria and 2 others "));
    }

    #[test]
    fn new_reviews_come_first_with_the_lines_they_are_about() {
        let mut a = review("maria", "CHANGES_REQUESTED", "Two things.\r\nBoth small.");
        a.comments = vec![
            LineComment { path: "src/csv.ts".into(), line: Some(14), body: "Quote names\nwith commas.".into() },
            LineComment { path: "src/csv.ts".into(), line: None, body: "Outdated\u{3}".into() },
        ];
        let b = review("sam", "COMMENTED", "Nice");
        assert_eq!(
            detail(&[&a], &[&b, &a]),
            "New:\n- maria requested changes: Two things.\n  Both small.\n  - src/csv.ts:14: Quote names\n    with commas.\n  - src/csv.ts: Outdated\n\nEarlier:\n- sam commented: Nice"
        );
    }

    #[test]
    fn a_long_discussion_is_cut() {
        let a = review("maria", "COMMENTED", &"x".repeat(DETAIL_CHARS * 2));
        let text = detail(&[&a], &[&a]);
        assert!(text.chars().count() <= DETAIL_CHARS + 1);
        assert!(text.ends_with('…'));
    }
}
