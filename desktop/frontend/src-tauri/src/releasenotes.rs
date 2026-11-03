// What an update brings: the notes release.sh writes into each GitHub release,
// for every release between the running version and the one on offer. The
// sidebar's update row lists them when hovered.
use crate::updatechannel::{Channel, API};
use crate::updates::newer;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;

/// GitHub's largest page. Someone further behind sees the newest of them and
/// is told there are more.
const PAGE: usize = 100;

#[derive(Deserialize)]
struct Release {
    #[serde(default)]
    tag_name: String,
    #[serde(default)]
    prerelease: bool,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    published_at: Option<String>,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseNote {
    version: String,
    published_at: String,
    notes: String,
    beta: bool,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseNotes {
    /// Newer than `since` and no newer than `until`, newest first.
    releases: Vec<ReleaseNote>,
    /// False when the page ended before reaching `since`.
    complete: bool,
}

#[tauri::command(async)]
pub fn release_notes(since: String, until: String) -> Result<ReleaseNotes, String> {
    let body = crate::updatechannel::get(&format!("{API}?per_page={PAGE}"))?;
    let releases: Vec<Release> = crate::updatechannel::parse(&body)?;
    Ok(between(releases, &since, &until, Channel::current()))
}

fn version(release: &Release) -> &str {
    release.tag_name.trim_start_matches('v')
}

fn newest_first(a: &str, b: &str) -> Ordering {
    if newer(a, b) {
        Ordering::Less
    } else if newer(b, a) {
        Ordering::Greater
    } else {
        Ordering::Equal
    }
}

/// The releases a `channel` would have installed on the way from `since` to
/// `until`: Beta builds only on Beta, never a draft.
fn between(releases: Vec<Release>, since: &str, until: &str, channel: Channel) -> ReleaseNotes {
    let complete = releases.len() < PAGE || releases.iter().any(|r| !newer(version(r), since));
    let mut picked: Vec<ReleaseNote> = releases
        .into_iter()
        .filter(|r| !r.draft && (channel == Channel::Beta || !r.prerelease))
        .filter(|r| newer(version(r), since) && !newer(version(r), until))
        .map(|r| ReleaseNote {
            version: version(&r).to_string(),
            published_at: r.published_at.unwrap_or_default(),
            notes: r.body.as_deref().unwrap_or_default().trim().to_string(),
            beta: r.prerelease,
        })
        .collect();
    picked.sort_by(|a, b| newest_first(&a.version, &b.version));
    ReleaseNotes {
        releases: picked,
        complete,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn release(tag: &str, prerelease: bool, body: Option<&str>) -> Release {
        serde_json::from_value(json!({
            "tag_name": tag,
            "prerelease": prerelease,
            "body": body,
            "published_at": "2026-11-03T07:11:50Z",
        }))
        .unwrap()
    }

    fn versions(notes: &ReleaseNotes) -> Vec<&str> {
        notes.releases.iter().map(|r| r.version.as_str()).collect()
    }

    #[test]
    fn lists_the_releases_after_the_running_one_newest_first() {
        let list = vec![
            release("v0.7.47", false, None),
            release("v0.7.49", false, Some("Switch accounts.")),
            release("v0.7.50", false, Some("Not offered yet.")),
            release("v0.7.48", false, Some("Keep awake.")),
            release("v0.7.44", false, Some("Already running.")),
        ];
        let notes = between(list, "0.7.44", "0.7.49", Channel::Stable);
        assert_eq!(versions(&notes), ["0.7.49", "0.7.48", "0.7.47"]);
        assert!(notes.complete);
    }

    #[test]
    fn trims_notes_and_keeps_a_release_without_any() {
        let list = vec![
            release("v0.7.49", false, Some("  Switch accounts.\n")),
            release("v0.7.48", false, None),
        ];
        let notes = between(list, "0.7.47", "0.7.49", Channel::Stable);
        assert_eq!(notes.releases[0].notes, "Switch accounts.");
        assert_eq!(notes.releases[1].notes, "");
        assert_eq!(notes.releases[0].published_at, "2026-11-03T07:11:50Z");
    }

    #[test]
    fn beta_builds_count_only_on_beta() {
        let list = vec![
            release("v0.7.49", true, Some("Beta build.")),
            release("v0.7.48", false, Some("Stable.")),
        ];
        let stable = between(list, "0.7.47", "0.7.49", Channel::Stable);
        assert_eq!(versions(&stable), ["0.7.48"]);

        let list = vec![
            release("v0.7.49", true, Some("Beta build.")),
            release("v0.7.48", false, Some("Stable.")),
        ];
        let beta = between(list, "0.7.47", "0.7.49", Channel::Beta);
        assert_eq!(versions(&beta), ["0.7.49", "0.7.48"]);
        assert!(beta.releases[0].beta);
    }

    #[test]
    fn drafts_are_left_out() {
        let mut draft = release("v0.7.49", false, Some("Unpublished."));
        draft.draft = true;
        let notes = between(vec![draft], "0.7.48", "0.7.49", Channel::Stable);
        assert!(notes.releases.is_empty());
    }

    #[test]
    fn a_full_page_that_never_reaches_the_running_version_is_incomplete() {
        let list: Vec<Release> = (0..PAGE)
            .map(|n| release(&format!("v1.0.{}", n + 1), false, Some("Notes.")))
            .collect();
        let notes = between(list, "0.9.0", "1.0.100", Channel::Stable);
        assert_eq!(notes.releases.len(), PAGE);
        assert!(!notes.complete);
    }
}
