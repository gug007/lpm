// The releases on github.com's own pages, read when the API turns an update
// check away. The API answers 60 unauthenticated requests an hour per network,
// shared by every app and tool behind the same address, so an office or a few
// GitHub-reading tools can use it up before lpm asks; these pages aren't
// counted against it. They carry what a check needs: which release is the
// latest stable one, which came after it, and each one's downloads.
use crate::updatechannel::{get, send, Asset, Channel, Release};
use crate::updates::newer;

/// What the API would have offered `channel`: the newest stable release, and
/// on Beta every release published after it, which can only be a Beta build.
pub(crate) fn releases(site: &str, channel: Channel) -> Result<Vec<Release>, String> {
    let stable = latest_tag(site)?;
    let mut found = vec![release(site, &stable, false)?];
    if channel == Channel::Beta {
        let feed = get(&format!("{site}.atom"))?;
        for tag in links(&feed, "/releases/tag/") {
            if newer(version(&tag), version(&stable)) {
                found.push(release(site, &tag, true)?);
            }
        }
    }
    Ok(found)
}

/// `/releases/latest` redirects to the newest stable release's tag.
fn latest_tag(site: &str) -> Result<String, String> {
    let url = format!("{site}/latest");
    let location = crate::updates::run_off_worker(move || {
        let resp = send(&url, false)?;
        Ok(resp
            .headers()
            .get(reqwest::header::LOCATION)
            .and_then(|v| v.to_str().ok())
            .unwrap_or_default()
            .to_string())
    })?;
    links(&location, "/releases/tag/")
        .into_iter()
        .next()
        .ok_or_else(|| "no stable release found".into())
}

fn release(site: &str, tag: &str, prerelease: bool) -> Result<Release, String> {
    let page = get(&format!("{site}/expanded_assets/{tag}"))?;
    let assets = links(&page, &format!("/releases/download/{tag}/"))
        .into_iter()
        .map(|name| Asset {
            browser_download_url: format!("{site}/download/{tag}/{name}"),
            name,
        })
        .collect();
    Ok(Release {
        tag_name: tag.to_string(),
        prerelease,
        draft: false,
        assets,
    })
}

fn version(tag: &str) -> &str {
    tag.trim_start_matches('v')
}

/// The last path segment of every link in `text` that goes through `marker`,
/// once each, in order.
fn links(text: &str, marker: &str) -> Vec<String> {
    let mut found: Vec<String> = Vec::new();
    for (at, _) in text.match_indices(marker) {
        let rest = &text[at + marker.len()..];
        let end = rest
            .find(|c: char| matches!(c, '"' | '\'' | '<' | '>' | '?' | '#') || c.is_whitespace())
            .unwrap_or(rest.len());
        let segment = &rest[..end];
        if !segment.is_empty() && !segment.contains('/') && !found.iter().any(|f| f == segment) {
            found.push(segment.to_string());
        }
    }
    found
}

#[cfg(test)]
mod tests {
    use super::links;
    use crate::updatechannel::{fetch_from, Asset, Channel};
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpListener;

    type Reply = (u16, Vec<(&'static str, String)>, String);

    /// A stand-in for GitHub on a local port, answering each path with `route`.
    fn serve(route: fn(&str) -> Reply) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        std::thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let mut reader = BufReader::new(&stream);
                let mut request = String::new();
                let _ = reader.read_line(&mut request);
                let mut header = String::new();
                while reader.read_line(&mut header).is_ok_and(|n| n > 2) {
                    header.clear();
                }
                let path = request.split_whitespace().nth(1).unwrap_or_default();
                let (status, headers, body) = route(path);
                let mut reply = format!(
                    "HTTP/1.1 {status} X\r\nContent-Length: {}\r\nConnection: close\r\n",
                    body.len()
                );
                for (name, value) in headers {
                    reply += &format!("{name}: {value}\r\n");
                }
                reply += "\r\n";
                reply += &body;
                let _ = (&stream).write_all(reply.as_bytes());
            }
        });
        base
    }

    fn assets_page(tag: &str, names: &[&str]) -> String {
        names
            .iter()
            .map(|n| {
                format!(
                    r#"<li><a href="/o/r/releases/download/{tag}/{n}" rel="nofollow">{n}</a></li>"#
                )
            })
            .collect()
    }

    /// The API has used up this network's allowance; the pages still answer.
    fn rate_limited(path: &str) -> Reply {
        let ok = |body: String| (200, vec![], body);
        match path {
            p if p.starts_with("/api/") => (
                403,
                vec![
                    ("x-ratelimit-remaining", "0".into()),
                    ("x-ratelimit-reset", "4102444800".into()),
                ],
                r#"{"message":"API rate limit exceeded"}"#.into(),
            ),
            "/site/releases/latest" => (
                302,
                vec![("location", "https://github.com/o/r/releases/tag/v1.4.9".into())],
                String::new(),
            ),
            "/site/releases.atom" => ok(["v1.5.0", "v1.4.9", "v1.4.8"]
                .iter()
                .map(|t| format!(r#"<entry><link rel="alternate" type="text/html" href="https://github.com/o/r/releases/tag/{t}"/></entry>"#))
                .collect()),
            "/site/releases/expanded_assets/v1.5.0" => ok(assets_page(
                "v1.5.0",
                &["lpm-desktop-macos-arm64.dmg", "lpm-desktop-linux-amd64.deb"],
            )),
            "/site/releases/expanded_assets/v1.4.9" => ok(assets_page(
                "v1.4.9",
                &["lpm-desktop-macos-arm64.dmg", "lpm-desktop-linux-amd64.deb"],
            )),
            _ => (404, vec![], String::new()),
        }
    }

    fn dmg(assets: &[Asset]) -> Option<String> {
        assets
            .iter()
            .find(|a| a.name.ends_with("macos-arm64.dmg"))
            .map(|a| a.browser_download_url.clone())
    }

    #[test]
    fn a_rate_limited_check_is_answered_from_the_release_pages() {
        let base = serve(rate_limited);
        let site = format!("{base}/site/releases");
        let choice = fetch_from(
            &format!("{base}/api/releases"),
            &site,
            Channel::Stable,
            &dmg,
        )
        .expect("the release pages answer");
        let newest = choice.newest.unwrap();
        assert_eq!(newest.version, "1.4.9");
        assert_eq!(
            newest.url,
            format!("{site}/download/v1.4.9/lpm-desktop-macos-arm64.dmg")
        );
        assert_eq!(choice.stable.unwrap().version, "1.4.9");
    }

    #[test]
    fn beta_finds_builds_published_after_the_stable_release() {
        let base = serve(rate_limited);
        let site = format!("{base}/site/releases");
        let choice = fetch_from(&format!("{base}/api/releases"), &site, Channel::Beta, &dmg)
            .expect("the release pages answer");
        let newest = choice.newest.unwrap();
        assert_eq!(newest.version, "1.5.0");
        assert_eq!(
            newest.url,
            format!("{site}/download/v1.5.0/lpm-desktop-macos-arm64.dmg")
        );
        assert_eq!(choice.stable.unwrap().version, "1.4.9");
    }

    #[test]
    fn pages_without_this_machines_download_leave_the_refusal_standing() {
        fn no_downloads(path: &str) -> Reply {
            if path.starts_with("/site/releases/expanded_assets/") {
                (200, vec![], "<ul></ul>".into())
            } else {
                rate_limited(path)
            }
        }
        let base = serve(no_downloads);
        let err = fetch_from(
            &format!("{base}/api/releases"),
            &format!("{base}/site/releases"),
            Channel::Stable,
            &dmg,
        )
        .unwrap_err();
        assert!(
            err.starts_with("GitHub is limiting update checks from this network. Try again in "),
            "{err}"
        );
    }

    #[test]
    fn an_answering_api_is_used_without_the_pages() {
        fn api_up(path: &str) -> Reply {
            match path {
                "/api/releases/latest" => (
                    200,
                    vec![],
                    r#"{"tag_name":"v1.4.9","assets":[{"name":"lpm-desktop-macos-arm64.dmg","browser_download_url":"https://x/api.dmg"}]}"#.into(),
                ),
                _ => (500, vec![], String::new()),
            }
        }
        let base = serve(api_up);
        let choice = fetch_from(
            &format!("{base}/api/releases"),
            &format!("{base}/site/releases"),
            Channel::Stable,
            &dmg,
        )
        .unwrap();
        assert_eq!(choice.newest.unwrap().url, "https://x/api.dmg");
    }

    #[test]
    fn links_read_tags_and_asset_names_from_the_pages() {
        assert_eq!(
            links(
                "https://github.com/o/r/releases/tag/v0.7.53",
                "/releases/tag/"
            ),
            ["v0.7.53"]
        );
        let feed = r#"<id>tag:github.com,2008:Repository/1/v0.7.53</id>
            <link rel="alternate" type="text/html" href="https://github.com/o/r/releases/tag/v0.7.53"/>
            <link rel="alternate" type="text/html" href="https://github.com/o/r/releases/tag/v0.7.52"/>"#;
        assert_eq!(links(feed, "/releases/tag/"), ["v0.7.53", "v0.7.52"]);
        let page = r#"<a href="/o/r/releases/download/v0.7.53/lpm-desktop-macos-arm64.dmg" rel="nofollow">
            <a href="/o/r/releases/download/v0.7.53/lpm-desktop-macos-arm64.dmg" class="x">
            <a href="/o/r/archive/refs/tags/v0.7.53.zip">"#;
        assert_eq!(
            links(page, "/releases/download/v0.7.53/"),
            ["lpm-desktop-macos-arm64.dmg"]
        );
    }
}
