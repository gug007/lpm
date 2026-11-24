//! The repository's open issues for the phone's "@" menu, and the one it picks.
//! Both run `gh` or `glab`, so they answer on a worker through the out-queue.
use serde_json::{json, Value};
use std::sync::mpsc::SyncSender;

/// The phone may send `gitIssues` and `gitIssue`.
pub const FEATURE: &str = "gitIssues";

pub(super) fn handle(out: &SyncSender<String>, t: &str, v: &Value) {
    let (out, verb, v) = (out.clone(), t.to_string(), v.clone());
    std::thread::spawn(move || {
        let _ = out.try_send(reply(&verb, &v).to_string());
    });
}

fn reply(verb: &str, v: &Value) -> Value {
    let project = v["project"].as_str().unwrap_or_default();
    let number = v["number"].as_u64().unwrap_or(0);
    let answer = crate::config::project_root(project).and_then(|(root, _)| match verb {
        "gitIssue" => crate::issues::read_issue(root, number).map(|issue| json!({ "issue": issue })),
        _ => crate::issues::open_issues(root, v["fresh"].as_bool())
            .map(|issues| json!({ "issues": issues })),
    });
    let mut reply = match answer {
        Ok(mut body) => {
            body["ok"] = json!(true);
            body
        }
        Err(error) => json!({ "ok": false, "error": error }),
    };
    reply["t"] = json!(verb);
    reply["project"] = json!(project);
    if verb == "gitIssue" {
        reply["number"] = json!(number);
    }
    if let Some(req) = v.get("reqId").filter(|r| !r.is_null()) {
        reply["reqId"] = req.clone();
    }
    reply
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_failure_names_the_request_it_answers() {
        let missing = json!({ "project": "lpm-no-such-project", "number": 431, "reqId": "a" });
        let r = reply("gitIssue", &missing);
        assert_eq!(r["t"], "gitIssue");
        assert_eq!(r["ok"], false);
        assert_eq!(r["number"], 431);
        assert_eq!(r["reqId"], "a");
        assert_eq!(r["project"], "lpm-no-such-project");
        assert!(reply("gitIssues", &missing).get("number").is_none());
    }
}
