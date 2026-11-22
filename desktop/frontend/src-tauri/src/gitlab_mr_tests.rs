use super::*;

fn check(name: &str, state: &'static str, url: &str) -> PrCheck {
    PrCheck {
        name: name.into(),
        workflow: "test".into(),
        state,
        url: url.into(),
        commit: None,
    }
}

fn mr(json: &str) -> Mr {
    serde_json::from_str(json).unwrap()
}

#[test]
fn an_open_one_wins_over_newer_merged_ones_and_forks_never_answer() {
    let listed: Vec<Mr> = serde_json::from_str(
        r#"[
            {"iid":9,"state":"opened","source_project_id":7,"target_project_id":3},
            {"iid":8,"state":"merged","source_project_id":3,"target_project_id":3},
            {"iid":5,"state":"opened","source_project_id":3,"target_project_id":3}
        ]"#,
    )
    .unwrap();
    assert_eq!(pick(&listed).unwrap().iid, 5);
    let merged: Vec<Mr> = serde_json::from_str(
        r#"[{"iid":8,"state":"merged","source_project_id":3,"target_project_id":3},
            {"iid":4,"state":"closed","source_project_id":3,"target_project_id":3}]"#,
    )
    .unwrap();
    assert_eq!(pick(&merged).unwrap().iid, 8);
    assert!(pick(&[]).is_none());
}

#[test]
fn reads_a_merge_request_in_githubs_words() {
    let pr = info(
        mr(
            r#"{"iid":128,"web_url":"https://gitlab.acme.dev/t/app/-/merge_requests/128","state":"opened","title":"Draft: Add invoice rounding","draft":true,"sha":"9e7d031","target_branch":"main","detailed_merge_status":"draft_status"}"#,
        ),
        vec![],
    );
    assert_eq!(pr.number, 128);
    assert_eq!(pr.state, "OPEN");
    assert_eq!(pr.title, "Add invoice rounding");
    assert!(pr.is_draft);
    assert_eq!(pr.host, Some("gitlab"));
    assert_eq!(pr.merge.state, "DRAFT");
    assert_eq!(pr.merge.head, "9e7d031");
    assert_eq!(pr.merge.base, "main");
    let merged = info(mr(r#"{"iid":3,"state":"merged","title":"t"}"#), vec![]);
    assert_eq!(merged.state, "MERGED");
    assert_eq!(
        info(mr(r#"{"iid":3,"state":"locked"}"#), vec![]).state,
        "CLOSED"
    );
}

#[test]
fn merge_status_maps_to_what_the_card_and_phone_read() {
    let state = |json: &str, checks: Vec<PrCheck>| {
        let m = readiness(&mr(json), &checks);
        (m.mergeable, m.state, m.review)
    };
    let s = |a: &str, b: &str, c: &str| (a.to_string(), b.to_string(), c.to_string());
    assert_eq!(
        state(r#"{"detailed_merge_status":"mergeable"}"#, vec![]),
        s("MERGEABLE", "CLEAN", "")
    );
    assert_eq!(
        state(
            r#"{"detailed_merge_status":"mergeable"}"#,
            vec![check("rspec", "fail", "")]
        ),
        s("MERGEABLE", "UNSTABLE", "")
    );
    assert_eq!(
        state(r#"{"detailed_merge_status":"conflict"}"#, vec![]),
        s("CONFLICTING", "DIRTY", "")
    );
    assert_eq!(
        state(
            r#"{"detailed_merge_status":"mergeable","has_conflicts":true}"#,
            vec![]
        ),
        s("CONFLICTING", "DIRTY", "")
    );
    assert_eq!(
        state(r#"{"detailed_merge_status":"need_rebase"}"#, vec![]),
        s("MERGEABLE", "BEHIND", "")
    );
    assert_eq!(
        state(r#"{"detailed_merge_status":"not_approved"}"#, vec![]),
        s("MERGEABLE", "BLOCKED", "REVIEW_REQUIRED")
    );
    assert_eq!(
        state(r#"{"detailed_merge_status":"ci_still_running"}"#, vec![]),
        s("MERGEABLE", "BLOCKED", "")
    );
    assert_eq!(
        state(r#"{"detailed_merge_status":"checking"}"#, vec![]),
        s("UNKNOWN", "UNKNOWN", "")
    );
    assert_eq!(
        state(r#"{"merge_status":"can_be_merged"}"#, vec![]),
        s("MERGEABLE", "CLEAN", "")
    );
}

#[test]
fn the_fix_prompt_names_each_failing_job_and_its_trace() {
    let prompt = fix_prompt(
        128,
        "https://gitlab.com/t/a/-/merge_requests/128",
        &[
            check("rspec", "fail", "https://gitlab.com/t/a/-/jobs/21"),
            check("lint", "pass", "https://gitlab.com/t/a/-/jobs/22"),
        ],
    )
    .unwrap();
    assert!(prompt.starts_with("CI jobs are failing on merge request !128"));
    assert!(prompt.contains("- test › rspec — https://gitlab.com/t/a/-/jobs/21"));
    assert!(prompt.contains("`glab ci trace 21`"));
    assert!(!prompt.contains("lint"));
    assert!(fix_prompt(1, "", &[check("lint", "pass", "")]).is_none());
}

#[test]
fn creating_answers_the_new_merge_requests_url() {
    assert_eq!(
        created_url(r#"{"iid":12,"web_url":"https://gitlab.com/t/a/-/merge_requests/12"}"#),
        Some("https://gitlab.com/t/a/-/merge_requests/12".into())
    );
    assert_eq!(created_url("{}"), None);
}

#[test]
fn the_conflict_prompt_names_the_target() {
    let text = conflicts_prompt(7, "https://x/-/merge_requests/7", "main");
    assert!(text.starts_with("Merge request !7 (https://x/-/merge_requests/7) has conflicts"));
    assert!(text.contains("merge origin/main into this branch"));
}
