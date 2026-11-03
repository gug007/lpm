// Which release an update moves to.
//
// Stable follows stable releases only. Beta also takes Beta builds:
// GitHub pre-releases with ordinary version numbers, published before they're
// promoted to stable (scripts/release.sh). Promoting clears the flag on that
// same release, so Stable gets the build Beta already ran. Either channel
// can always go back to the newest stable release.
use serde::Deserialize;
use serde_json::Value;
use std::time::Duration;

pub(crate) const API: &str = "https://api.github.com/repos/gug007/lpm/releases";
/// Enough to reach past a run of Beta builds to the newest stable one;
/// when it doesn't, that release is asked for on its own.
const LIST_LEN: usize = 20;
pub(crate) const SETTING: &str = "updateChannel";

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum Channel {
    Stable,
    Beta,
}

impl Channel {
    pub(crate) fn current() -> Channel {
        Self::parse(crate::config::load_settings().get(SETTING))
    }

    fn parse(value: Option<&Value>) -> Channel {
        match value.and_then(Value::as_str) {
            Some("beta") => Channel::Beta,
            _ => Channel::Stable,
        }
    }

    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Channel::Stable => "stable",
            Channel::Beta => "beta",
        }
    }
}

#[derive(Deserialize)]
pub(crate) struct Release {
    #[serde(default)]
    tag_name: String,
    #[serde(default)]
    prerelease: bool,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    pub(crate) assets: Vec<Asset>,
}

#[derive(Deserialize)]
pub(crate) struct Asset {
    #[serde(default)]
    pub(crate) name: String,
    #[serde(default)]
    pub(crate) browser_download_url: String,
}

/// A release this machine can install: its version and its download.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Found {
    pub(crate) version: String,
    pub(crate) url: String,
}

#[derive(Debug, PartialEq)]
pub(crate) struct Choice {
    /// What this channel updates to.
    pub(crate) newest: Option<Found>,
    /// What a rollback goes back to.
    pub(crate) stable: Option<Found>,
}

/// Ask GitHub for the releases `channel` can move to. `download` picks this
/// machine's file out of a release's assets.
pub(crate) fn fetch(
    channel: Channel,
    download: &dyn Fn(&[Asset]) -> Option<String>,
) -> Result<Choice, String> {
    let latest =
        || -> Result<Vec<Release>, String> { Ok(vec![parse(&get(&format!("{API}/latest"))?)?]) };
    let releases = match channel {
        Channel::Stable => latest()?,
        Channel::Beta => parse(&get(&format!("{API}?per_page={LIST_LEN}"))?)?,
    };
    let mut choice = choose(&releases, channel, download);
    if choice.stable.is_none() && channel == Channel::Beta {
        choice.stable = choose(&latest()?, Channel::Stable, download).stable;
    }
    Ok(choice)
}

pub(crate) fn parse<T: serde::de::DeserializeOwned>(body: &str) -> Result<T, String> {
    serde_json::from_str(body).map_err(|e| format!("failed to parse response: {e}"))
}

fn choose(
    releases: &[Release],
    channel: Channel,
    download: &dyn Fn(&[Asset]) -> Option<String>,
) -> Choice {
    let mut choice = Choice {
        newest: None,
        stable: None,
    };
    for release in releases.iter().filter(|r| !r.draft) {
        let Some(url) = download(&release.assets) else {
            continue;
        };
        let found = Found {
            version: release.tag_name.trim_start_matches('v').to_string(),
            url,
        };
        if !release.prerelease {
            keep_newer(&mut choice.stable, found.clone());
        }
        if !release.prerelease || channel == Channel::Beta {
            keep_newer(&mut choice.newest, found);
        }
    }
    choice
}

fn keep_newer(slot: &mut Option<Found>, found: Found) {
    if slot
        .as_ref()
        .is_none_or(|kept| crate::updates::newer(&found.version, &kept.version))
    {
        *slot = Some(found);
    }
}

pub(crate) fn get(url: &str) -> Result<String, String> {
    let url = url.to_string();
    crate::updates::run_off_worker(move || {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(30))
            .user_agent("lpm")
            .build()
            .map_err(|e| e.to_string())?;
        let resp = client
            .get(&url)
            .send()
            .map_err(|e| format!("failed to check for updates: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!(
                "GitHub API returned status {}",
                resp.status().as_u16()
            ));
        }
        resp.text().map_err(|e| e.to_string())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn release(tag: &str, prerelease: bool, has_download: bool) -> Release {
        let assets = if has_download {
            json!([{ "name": "lpm.dmg", "browser_download_url": format!("https://x/{tag}.dmg") }])
        } else {
            json!([])
        };
        serde_json::from_value(
            json!({ "tag_name": tag, "prerelease": prerelease, "assets": assets }),
        )
        .unwrap()
    }

    fn dmg(assets: &[Asset]) -> Option<String> {
        assets.first().map(|a| a.browser_download_url.clone())
    }

    fn versions(choice: &Choice) -> (Option<&str>, Option<&str>) {
        (
            choice.newest.as_ref().map(|f| f.version.as_str()),
            choice.stable.as_ref().map(|f| f.version.as_str()),
        )
    }

    #[test]
    fn stable_skips_beta_builds() {
        let list = [
            release("v1.5.0", true, true),
            release("v1.4.9", false, true),
        ];
        let choice = choose(&list, Channel::Stable, &dmg);
        assert_eq!(versions(&choice), (Some("1.4.9"), Some("1.4.9")));
    }

    #[test]
    fn beta_takes_the_newest_of_either_kind() {
        let list = [
            release("v1.5.0", true, true),
            release("v1.4.9", false, true),
        ];
        let choice = choose(&list, Channel::Beta, &dmg);
        assert_eq!(versions(&choice), (Some("1.5.0"), Some("1.4.9")));
        assert_eq!(choice.newest.unwrap().url, "https://x/v1.5.0.dmg");
    }

    #[test]
    fn a_stable_release_past_every_beta_build_wins_on_beta() {
        let list = [
            release("v1.5.1", false, true),
            release("v1.5.0", true, true),
        ];
        let choice = choose(&list, Channel::Beta, &dmg);
        assert_eq!(versions(&choice), (Some("1.5.1"), Some("1.5.1")));
    }

    #[test]
    fn order_on_the_page_does_not_decide() {
        let list = [
            release("v1.4.9", false, true),
            release("v1.4.10", false, true),
        ];
        let choice = choose(&list, Channel::Stable, &dmg);
        assert_eq!(versions(&choice), (Some("1.4.10"), Some("1.4.10")));
    }

    #[test]
    fn a_release_without_this_machines_download_is_never_offered() {
        let list = [
            release("v1.5.0", true, false),
            release("v1.4.9", false, true),
        ];
        let choice = choose(&list, Channel::Beta, &dmg);
        assert_eq!(versions(&choice), (Some("1.4.9"), Some("1.4.9")));
    }

    #[test]
    fn drafts_are_ignored() {
        let mut draft = release("v1.6.0", false, true);
        draft.draft = true;
        let choice = choose(&[draft], Channel::Beta, &dmg);
        assert_eq!(versions(&choice), (None, None));
    }

    #[test]
    fn the_channel_defaults_to_stable() {
        assert_eq!(Channel::parse(None), Channel::Stable);
        assert_eq!(Channel::parse(Some(&json!("bogus"))), Channel::Stable);
        assert_eq!(Channel::parse(Some(&json!("beta"))), Channel::Beta);
    }
}
