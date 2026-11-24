use super::*;

const LIST: &str = r#"[
    {"number": 431, "title": "Retry failed webhooks", "url": "https://github.com/o/r/issues/431",
     "author": {"login": "maria", "is_bot": false}, "labels": [{"name": "bug"}, {"name": "billing"}]},
    {"number": 12, "title": "  Two\nlines ", "url": "https://github.com/o/r/issues/12", "author": null, "labels": []}
]"#;

const VIEW: &str = r#"{
    "number": 431, "title": "Retry failed webhooks", "url": "https://github.com/o/r/issues/431",
    "body": "<!-- describe\nthe bug -->\r\nStripe gives up after ```one``` try.\r\n",
    "comments": [
        {"author": {"login": "dev"}, "body": "Back off\nfor a day."},
        {"author": null, "body": "  "}
    ]
}"#;

fn discussion(body: &str) -> Discussion {
    Discussion {
        number: 7,
        title: "T".into(),
        url: "https://x/7".into(),
        body: body.into(),
        comments: Vec::new(),
        reader: "gh issue view 7 --comments".into(),
    }
}

#[test]
fn lists_issues_with_the_branch_each_would_start() {
    let issues = parse_list(LIST).unwrap();
    assert_eq!(issues[0].labels, vec!["bug", "billing"]);
    assert_eq!(issues[0].author, "maria");
    assert_eq!(issues[0].branch, "431-retry-failed-webhooks");
    assert_eq!(issues[1].title, "Two lines");
    assert_eq!(issues[1].author, "");
}

#[test]
fn a_mention_is_the_issue_in_a_fence_nothing_inside_can_close() {
    let text = text_of(&parse_view(VIEW).unwrap());
    assert_eq!(
        text.mention,
        "Issue #431:\n````\n#431 Retry failed webhooks\nhttps://github.com/o/r/issues/431\n\n\
         Stripe gives up after ```one``` try.\n\nComments:\n- dev: Back off\n  for a day.\n````\n"
    );
}

#[test]
fn the_prompt_names_the_issue_first() {
    let text = text_of(&parse_view(VIEW).unwrap());
    assert!(text.prompt.starts_with(
        "Work on issue #431: Retry failed webhooks\nhttps://github.com/o/r/issues/431\n\nStripe"
    ));
    assert_eq!(text_of(&discussion("")).prompt, "Work on issue #7: T\nhttps://x/7");
}

#[test]
fn a_long_issue_is_cut_and_says_how_to_read_the_rest() {
    let text = text_of(&discussion(&"x".repeat(PROMPT_CHARS * 2)));
    assert!(text.prompt.ends_with("…\n\nRead the rest with `gh issue view 7 --comments`."));
    assert!(text.prompt.chars().count() < PROMPT_CHARS + 80);

    let lines = "line\n".repeat(MENTION_LINES + 5);
    let mention = text_of(&discussion(lines.trim_end())).mention;
    assert!(mention.contains("… 8 more lines left out"));
}
