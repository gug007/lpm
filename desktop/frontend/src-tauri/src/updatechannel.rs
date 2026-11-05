// Which release an update moves to.
//
// Stable follows stable releases only. Beta also takes Beta builds:
// GitHub pre-releases with ordinary version numbers, published before they're
// promoted to stable (scripts/release.sh). Promoting clears the flag on that
// same release, so Stable gets the build Beta already ran. Either channel
// can always go back to the newest stable release.
use reqwest::blocking::Response;
use reqwest::redirect::Policy;
use serde::Deserialize;
use serde_json::Value;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

pub(crate) const API: &str = "https://api.github.com/repos/gug007/lpm/releases";
/// The same releases on github.com's own pages (releasesite.rs).
const SITE: &str = "https://github.com/gug007/lpm/releases";
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
    pub(crate) tag_name: String,
    #[serde(default)]
    pub(crate) prerelease: bool,
    #[serde(default)]
    pub(crate) draft: bool,
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

#[derive(Clone, Debug, PartialEq)]
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
    shared(channel, || fetch_from(API, SITE, channel, download))
}

/// How long one answer serves every check on its channel. The app asks at
/// launch from its sidebar and its background checker at once, and an Update
/// pressed right after a check asks again.
const SHARED_FOR: Duration = Duration::from_secs(60);

/// The lock is held while `ask` runs, so checks that arrive together wait for
/// the first one's answer instead of each asking GitHub. Failures aren't kept,
/// so Retry asks again.
fn shared(
    channel: Channel,
    ask: impl FnOnce() -> Result<Choice, String>,
) -> Result<Choice, String> {
    static LAST: Mutex<Option<(Instant, Channel, Choice)>> = Mutex::new(None);
    let mut last = LAST.lock().unwrap_or_else(|e| e.into_inner());
    if let Some((at, asked, choice)) = &*last {
        if *asked == channel && at.elapsed() < SHARED_FOR {
            return Ok(choice.clone());
        }
    }
    let choice = ask()?;
    *last = Some((Instant::now(), channel, choice.clone()));
    Ok(choice)
}

/// The API first; when it says no, github.com's release pages. Their answer
/// counts only if it names a stable release with this machine's download, so a
/// page that stops parsing shows the API's refusal instead of "up to date".
pub(crate) fn fetch_from(
    api: &str,
    site: &str,
    channel: Channel,
    download: &dyn Fn(&[Asset]) -> Option<String>,
) -> Result<Choice, String> {
    from_api(api, channel, download).or_else(|refused| {
        crate::releasesite::releases(site, channel)
            .map(|releases| choose(&releases, channel, download))
            .ok()
            .filter(|choice| choice.stable.is_some())
            .ok_or(refused)
    })
}

fn from_api(
    api: &str,
    channel: Channel,
    download: &dyn Fn(&[Asset]) -> Option<String>,
) -> Result<Choice, String> {
    let latest =
        || -> Result<Vec<Release>, String> { Ok(vec![parse(&get(&format!("{api}/latest"))?)?]) };
    let releases = match channel {
        Channel::Stable => latest()?,
        Channel::Beta => parse(&get(&format!("{api}?per_page={LIST_LEN}"))?)?,
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
        let resp = send(&url, true)?;
        if !resp.status().is_success() {
            return Err(refusal(&resp));
        }
        resp.text().map_err(|e| e.to_string())
    })
}

/// Blocking, so only from a plain thread (`run_off_worker`).
pub(crate) fn send(url: &str, follow_redirects: bool) -> Result<Response, String> {
    let redirects = if follow_redirects {
        Policy::default()
    } else {
        Policy::none()
    };
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent("lpm")
        .redirect(redirects)
        .build()
        .map_err(|e| e.to_string())?
        .get(url)
        .send()
        .map_err(|e| format!("failed to check for updates: {e}"))
}

fn refusal(resp: &Response) -> String {
    let status = resp.status().as_u16();
    let header = |name: &str| resp.headers().get(name).and_then(|v| v.to_str().ok());
    if !matches!(status, 403 | 429) || header("x-ratelimit-remaining") != Some("0") {
        return format!("GitHub API returned status {status}");
    }
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs());
    let minutes = header("x-ratelimit-reset")
        .and_then(|reset| reset.parse::<u64>().ok())
        .map(|reset| reset.saturating_sub(now).div_ceil(60).max(1));
    let when = match minutes {
        Some(1) => "in a minute".to_string(),
        Some(m) => format!("in {m} minutes"),
        None => "later".to_string(),
    };
    format!("GitHub is limiting update checks from this network. Try again {when}.")
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

    #[test]
    fn checks_close_together_share_one_answer_per_channel() {
        let asked = std::cell::Cell::new(0);
        let ask = || {
            asked.set(asked.get() + 1);
            Ok(Choice {
                newest: None,
                stable: None,
            })
        };
        let refused = || Err("GitHub API returned status 403".to_string());
        assert!(shared(Channel::Beta, refused).is_err());
        shared(Channel::Beta, ask).unwrap();
        shared(Channel::Beta, ask).unwrap();
        assert_eq!(asked.get(), 1, "the second check reuses the first's answer");
        shared(Channel::Stable, ask).unwrap();
        assert_eq!(asked.get(), 2, "another channel asks for itself");
    }
}
