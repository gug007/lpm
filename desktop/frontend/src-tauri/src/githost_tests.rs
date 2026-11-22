use super::*;

fn lab(host: &str, path: &str) -> Forge {
    Forge::GitLab(GitLabRepo {
        host: host.into(),
        path: path.into(),
    })
}

#[test]
fn reads_every_origin_spelling() {
    let cases = [
        ("git@gitlab.com:team/app.git", ("gitlab.com", "team/app")),
        (
            "https://gitlab.com/team/sub/app",
            ("gitlab.com", "team/sub/app"),
        ),
        (
            "https://user:secret@gitlab.com/team/app.git\n",
            ("gitlab.com", "team/app"),
        ),
        (
            "ssh://git@gitlab.acme.dev:2222/team/app.git",
            ("gitlab.acme.dev", "team/app"),
        ),
        (
            "https://code.acme.dev:8443/team/app/",
            ("code.acme.dev:8443", "team/app"),
        ),
    ];
    for (url, (host, path)) in cases {
        assert_eq!(origin_parts(url), Some((host.into(), path.into())), "{url}");
    }
    assert_eq!(origin_parts(""), None);
    assert_eq!(origin_parts("/Users/me/repo"), None);
    assert_eq!(origin_parts("file:///srv/repo.git"), None);
}

#[test]
fn github_and_unknown_hosts_stay_github() {
    let never = |_: &str| false;
    assert_eq!(forge_of_url("git@github.com:o/r.git", never), Forge::GitHub);
    assert_eq!(
        forge_of_url("https://github.acme.com/o/r", never),
        Forge::GitHub
    );
    assert_eq!(
        forge_of_url("https://code.acme.dev/o/r", never),
        Forge::GitHub
    );
    assert_eq!(forge_of_url("", never), Forge::GitHub);
    assert_eq!(
        forge_of_url("git@github.com:o/r.git", |_| true),
        Forge::GitHub
    );
}

#[test]
fn gitlab_by_name_or_by_glab_sign_in() {
    let never = |_: &str| false;
    assert_eq!(
        forge_of_url("git@gitlab.com:team/app.git", never),
        lab("gitlab.com", "team/app")
    );
    assert_eq!(
        forge_of_url("https://gitlab.acme.dev/team/app", never),
        lab("gitlab.acme.dev", "team/app")
    );
    assert_eq!(
        forge_of_url("git@code.acme.dev:team/app.git", |h| h == "code.acme.dev"),
        lab("code.acme.dev", "team/app")
    );
}

#[test]
fn the_api_names_a_project_by_its_encoded_path() {
    let repo = GitLabRepo {
        host: "gitlab.com".into(),
        path: "team/sub/app".into(),
    };
    assert_eq!(repo.api_project(), "team%2Fsub%2Fapp");
}

#[test]
fn finds_the_hosts_glab_signed_in_to() {
    let config = "git_protocol: ssh\n# comment\nhosts:\n    gitlab.com:\n        token: x\n        api_host: gitlab.com\n    \"code.acme.dev\":\n        token: y\nno_prompt: false\n";
    assert_eq!(hosts_in_config(config), vec!["gitlab.com", "code.acme.dev"]);
    assert!(hosts_in_config("editor: vim\n").is_empty());
}

#[test]
fn keeps_the_api_message_from_a_glab_error() {
    assert_eq!(
        tidy_error("glab: {\"message\":\"405 Method Not Allowed\"}"),
        "405 Method Not Allowed"
    );
    assert_eq!(
        tidy_error("{\"message\":[\"Another open merge request already exists for this source branch: !12\"]}"),
        "Another open merge request already exists for this source branch: !12"
    );
    assert_eq!(
        tidy_error("{\"message\":{\"title\":[\"can't be blank\"]}}"),
        "title can't be blank"
    );
    assert_eq!(tidy_error("glab: 404 Not Found"), "404 Not Found");
}
