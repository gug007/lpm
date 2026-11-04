// The other computers an agent here can reach, as the composer's "@" menu (the
// desktop's and the phone's) offers them: each connected computer whose lpm
// takes this one's agents' commands or copies, with its projects and its home
// folder as places. Picking a place inserts `NAME:PATH`, the form `lpm exec
// --on` and `lpm cp` take. Naming a place grants nothing: the other computer's
// policy and lpm's approval still hold every command and copy.
use crate::agentfiles::Access;
use crate::ignoredhost::str_arg;
use crate::peerclient::{self, Computer, PeerClientHub};
use serde::Serialize;
use serde_json::Value;
use std::time::Duration;
use tauri::State;

/// How long the menu waits on one computer's projects before it falls back to
/// the last list that computer gave.
const PROJECTS_TIMEOUT: Duration = Duration::from_secs(2);
const HOME_LABEL: &str = "Home folder";
const HOME_PATH: &str = "~";
/// What follows a place's `NAME:PATH` in the prompt, so the agent knows how to reach it.
const REACH_NOTE: &str = " (on another computer; reach it with lpm exec --on and lpm cp)";

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MentionComputer {
    pub name: String,
    pub slug: String,
    /// What its policy lets this one's agents do there, in a few words.
    pub access: String,
    pub places: Vec<Place>,
}

#[derive(Debug, PartialEq, Serialize)]
pub(crate) struct Place {
    pub label: String,
    /// `NAME:PATH`, as the menu shows it.
    pub path: String,
    /// The text that takes the typed "@fragment"'s place.
    pub insert: String,
}

/// Every connected computer that runs this one's agents' commands or copies,
/// each with its projects (asked of all of them at once) and its home folder.
pub(crate) fn mention_computers(hub: &PeerClientHub) -> Vec<MentionComputer> {
    let all = peerclient::computers(hub);
    let kept: Vec<&Computer> = all
        .iter()
        .filter(|c| c.connected && (c.supported || c.runs))
        .collect();
    if kept.is_empty() {
        return Vec::new();
    }
    let slugs: Vec<Option<&str>> = kept.iter().map(|c| Some(c.slug.as_str())).collect();
    kept.iter()
        .zip(crate::remote_machines::sidebar_projects(
            hub,
            &slugs,
            PROJECTS_TIMEOUT,
        ))
        .map(|(c, projects)| {
            mention_computer(
                c,
                peerclient::reach_name(c, &all),
                &projects.unwrap_or_default(),
            )
        })
        .collect()
}

/// `reach` is the name its places start with: the one `lpm exec --on` and
/// `lpm cp` find it by (peerclient::reach_name).
fn mention_computer(c: &Computer, reach: &str, projects: &[Value]) -> MentionComputer {
    let mut places: Vec<Place> = projects
        .iter()
        .filter(|p| !p.get("isRemote").and_then(Value::as_bool).unwrap_or(false))
        .filter_map(|p| {
            let root = str_arg(p, "root");
            if root.is_empty() {
                return None;
            }
            let label = Some(str_arg(p, "label"))
                .filter(|l| !l.is_empty())
                .unwrap_or_else(|| str_arg(p, "name"));
            Some(place(reach, label, &place_path(root, &c.home)))
        })
        .collect();
    places.push(place(reach, HOME_LABEL, HOME_PATH));
    MentionComputer {
        name: c.name.clone(),
        slug: c.slug.clone(),
        access: access(c),
        places,
    }
}

fn place(name: &str, label: &str, path: &str) -> Place {
    let path = format!("{name}:{path}");
    Place {
        label: label.to_string(),
        insert: format!("{path}{REACH_NOTE}"),
        path,
    }
}

/// A folder there as an agent here names it: `~` and `~/…` inside that
/// computer's home, the absolute path otherwise (outside the home, a Windows
/// host, or a home it didn't say).
fn place_path(root: &str, home: &str) -> String {
    let home = home.trim_end_matches('/');
    if root.starts_with('/') && home.starts_with('/') {
        let trimmed = root.trim_end_matches('/');
        if trimmed == home {
            return HOME_PATH.into();
        }
        if let Some(rest) = trimmed.strip_prefix(home).and_then(|r| r.strip_prefix('/')) {
            return format!("{HOME_PATH}/{rest}");
        }
    }
    root.to_string()
}

/// What that computer lets this one's agents do, as far as its lpm can.
fn access(c: &Computer) -> String {
    let files = match (c.supported, c.policy.access) {
        (false, _) | (_, Access::Off) => None,
        (_, Access::Read) => Some("copy from it"),
        (_, Access::Write) => Some("copy both ways"),
    };
    let parts: Vec<&str> = [(c.runs && c.policy.run).then_some("commands"), files]
        .into_iter()
        .flatten()
        .collect();
    if parts.is_empty() {
        "off · turn on in Connections".into()
    } else {
        parts.join(" · ")
    }
}

#[tauri::command(async)]
pub fn agent_mention_computers(hub: State<'_, PeerClientHub>) -> Vec<MentionComputer> {
    mention_computers(hub.inner())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agentfiles::Policy;
    use serde_json::json;

    fn computer(policy: Policy, supported: bool, runs: bool) -> Computer {
        Computer {
            slug: "c2a0e3b1".into(),
            name: "Mac mini".into(),
            connected: true,
            supported,
            runs,
            policy,
            home: "/Users/me".into(),
        }
    }

    fn policy(access: Access, run: bool) -> Policy {
        Policy {
            access,
            run,
            ..Default::default()
        }
    }

    #[test]
    fn a_path_inside_the_home_reads_from_tilde() {
        assert_eq!(place_path("/Users/me", "/Users/me"), "~");
        assert_eq!(place_path("/Users/me/", "/Users/me/"), "~");
        assert_eq!(
            place_path("/Users/me/storefront", "/Users/me"),
            "~/storefront"
        );
        assert_eq!(place_path("/Users/me/a/b", "/Users/me/"), "~/a/b");
    }

    #[test]
    fn a_path_outside_the_home_or_on_windows_stays_absolute() {
        assert_eq!(place_path("/Users/meg/app", "/Users/me"), "/Users/meg/app");
        assert_eq!(place_path("/srv/app", "/home/me"), "/srv/app");
        assert_eq!(place_path("/srv/app", ""), "/srv/app");
        assert_eq!(place_path("/srv/app", "/"), "/srv/app");
        assert_eq!(
            place_path(r"C:\Users\me\app", r"C:\Users\me"),
            r"C:\Users\me\app"
        );
    }

    #[test]
    fn access_says_only_what_that_computers_lpm_can_do() {
        let says = |p: Policy, supported: bool, runs: bool| access(&computer(p, supported, runs));
        assert_eq!(
            says(policy(Access::Read, true), true, true),
            "commands · copy from it"
        );
        assert_eq!(
            says(policy(Access::Write, false), true, true),
            "copy both ways"
        );
        assert_eq!(says(policy(Access::Off, true), true, true), "commands");
        assert_eq!(says(policy(Access::Write, true), false, true), "commands");
        assert_eq!(
            says(policy(Access::Write, true), true, false),
            "copy both ways"
        );
        assert_eq!(
            says(policy(Access::Off, false), true, true),
            "off · turn on in Connections"
        );
        assert_eq!(
            says(policy(Access::Read, true), false, false),
            "off · turn on in Connections"
        );
    }

    #[test]
    fn a_computer_whose_name_another_shares_is_reached_by_its_slug() {
        let twin = |slug: &str, name: &str| Computer {
            slug: slug.into(),
            name: name.into(),
            ..computer(policy(Access::Read, true), true, true)
        };
        let all = [twin("c2a0e3b1", "Mac mini"), twin("9f8e7d6c", "Mac-mini")];
        let projects = [json!({ "name": "app", "root": "/Users/me/app" })];
        let got = mention_computer(&all[1], peerclient::reach_name(&all[1], &all), &projects);
        assert_eq!(got.name, "Mac-mini");
        let inserts: Vec<&str> = got.places.iter().map(|p| p.insert.as_str()).collect();
        assert_eq!(
            inserts,
            [
                format!("9f8e7d6c:~/app{REACH_NOTE}"),
                format!("9f8e7d6c:~{REACH_NOTE}")
            ]
        );
        assert_eq!(got.places[0].path, "9f8e7d6c:~/app");
    }

    #[test]
    fn its_projects_come_first_then_its_home_folder() {
        let c = computer(policy(Access::Read, true), true, true);
        let projects = vec![
            json!({ "name": "storefront", "root": "/Users/me/storefront" }),
            json!({ "name": "box", "root": "/srv/box", "isRemote": true }),
            json!({ "name": "api", "label": "API", "root": "/opt/api" }),
            json!({ "name": "rootless" }),
        ];
        let got = serde_json::to_value(mention_computer(&c, "Mac mini", &projects)).unwrap();
        assert_eq!(
            got,
            json!({
                "name": "Mac mini",
                "slug": "c2a0e3b1",
                "access": "commands · copy from it",
                "places": [
                    { "label": "storefront", "path": "Mac mini:~/storefront",
                      "insert": format!("Mac mini:~/storefront{REACH_NOTE}") },
                    { "label": "API", "path": "Mac mini:/opt/api",
                      "insert": format!("Mac mini:/opt/api{REACH_NOTE}") },
                    { "label": "Home folder", "path": "Mac mini:~",
                      "insert": format!("Mac mini:~{REACH_NOTE}") },
                ],
            })
        );
    }
}
