//! The Talk button's planner: one spoken or typed sentence becomes a plan the
//! owner approves before anything runs. The AI CLI only sorts the sentence
//! into answers; every answer is checked here against what this machine has.
use crate::gitbringrun::string_of;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

const PROGRESS_EVENT: &str = "talk-plan-progress";
const LABEL_MAX: usize = 40;

#[derive(Debug, Clone, Deserialize)]
pub struct TalkProject {
    pub name: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub parent: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TalkAgent {
    pub id: String,
    #[serde(default)]
    pub label: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TalkPlace {
    Copy,
    Worktree,
    Here,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TalkPlan {
    pub project: String,
    #[serde(rename = "where")]
    pub place: TalkPlace,
    pub agent: String,
    pub prompt: String,
    #[serde(default)]
    pub label: String,
}

fn failed(error: impl Into<String>, unsupported: bool) -> Value {
    json!({ "ok": false, "error": error.into(), "unsupported": unsupported })
}

fn small_model(cli: &str) -> &'static str {
    if cli == "claude" {
        "haiku"
    } else {
        ""
    }
}

fn instruction(projects: &[TalkProject], agents: &[TalkAgent]) -> String {
    let project_lines: Vec<String> = projects
        .iter()
        .map(|p| {
            let mut line = format!("- {}", p.name);
            if !p.label.is_empty() && p.label != p.name {
                line.push_str(&format!(" (shown as \"{}\")", p.label));
            }
            if !p.parent.is_empty() {
                line.push_str(&format!(" (a copy of {})", p.parent));
            }
            line
        })
        .collect();
    let agent_lines: Vec<String> = agents
        .iter()
        .enumerate()
        .map(|(i, a)| {
            let default = if i == 0 { ", the default" } else { "" };
            format!("- {} ({}{default})", a.id, a.label)
        })
        .collect();
    format!(
        r#"You turn one spoken request into a plan for lpm, an app that runs AI coding agents in local projects. The request was dictated, so a project or agent name may be misheard: match it to the closest name below. Reply with one JSON object and nothing else. Do not run tools.

Fields:
- "project": the exact name of one project from the list, or null when none fits or more than one fits equally.
- "candidates": the project names that could be meant when "project" is null; otherwise [].
- "where": "copy" when the request asks for a duplicate or a separate copy of the project, "worktree" when it asks for a git worktree, otherwise "here".
- "agent": the id of one agent from the list; the default when none is named.
- "prompt": the task for the agent, in the speaker's words, without the parts that say which project, copy or agent. Do not solve, expand or look anything up.
- "label": for "copy" and "worktree", two or three plain words that name the task; otherwise "".
- "unsupported": null, or one short sentence when the request asks for anything other than giving an agent a task in a project (deleting, settings, several projects at once).

Projects:
{}

Agents:
{}"#,
        project_lines.join("\n"),
        agent_lines.join("\n"),
    )
}

fn text_of(v: &Value, key: &str) -> String {
    v.get(key)
        .and_then(Value::as_str)
        .map(|s| s.split_whitespace().collect::<Vec<_>>().join(" "))
        .unwrap_or_default()
}

fn match_project(said: &str, projects: &[TalkProject]) -> Option<String> {
    if said.is_empty() {
        return None;
    }
    let exact = projects.iter().find(|p| p.name == said);
    let loose = || {
        let lower = said.to_lowercase();
        let mut hits = projects
            .iter()
            .filter(|p| p.name.to_lowercase() == lower || p.label.to_lowercase() == lower);
        let first = hits.next()?;
        hits.next().is_none().then_some(first)
    };
    exact.or_else(loose).map(|p| p.name.clone())
}

/// The CLI's reply as a plan, or why there is none. Pure, so it is tested
/// without a CLI.
pub(crate) fn read_reply(raw: &str, projects: &[TalkProject], agents: &[TalkAgent]) -> Value {
    let answer = crate::aigen_split::json_object(raw).and_then(|s| serde_json::from_str::<Value>(s).ok());
    let Some(v) = answer else {
        return failed("The AI CLI didn't answer with a plan. Try again.", false);
    };
    let unsupported = text_of(&v, "unsupported");
    if !unsupported.is_empty() {
        return failed(unsupported, true);
    }
    let prompt = v
        .get("prompt")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default()
        .to_string();
    if prompt.is_empty() {
        return failed("I didn't catch what the agent should do. Say the task too.", false);
    }
    let project = match_project(&text_of(&v, "project"), projects).unwrap_or_default();
    let mut candidates: Vec<String> = Vec::new();
    if project.is_empty() {
        for said in v["candidates"].as_array().into_iter().flatten() {
            let name = said.as_str().and_then(|s| match_project(s, projects));
            if let Some(name) = name.filter(|n| !candidates.contains(n)) {
                candidates.push(name);
            }
        }
    }
    let place = match text_of(&v, "where").as_str() {
        "copy" | "duplicate" => TalkPlace::Copy,
        "worktree" => TalkPlace::Worktree,
        _ => TalkPlace::Here,
    };
    let said_agent = text_of(&v, "agent").to_lowercase();
    let agent = agents
        .iter()
        .find(|a| a.id.to_lowercase() == said_agent)
        .or(agents.first())
        .map(|a| a.id.clone())
        .unwrap_or_else(|| "claude".into());
    let label = if place == TalkPlace::Here {
        String::new()
    } else {
        text_of(&v, "label").chars().take(LABEL_MAX).collect::<String>().trim().to_string()
    };
    let plan = TalkPlan { project, place, agent, prompt, label };
    json!({ "ok": true, "plan": plan, "candidates": candidates })
}

pub(crate) fn plan(
    app: &AppHandle,
    text: &str,
    projects: &[TalkProject],
    agents: &[TalkAgent],
    gen_id: &str,
) -> Value {
    let text = text.trim();
    if text.is_empty() {
        return failed("Say or type what to do first.", false);
    }
    if projects.is_empty() {
        return failed("Add a project to lpm first.", false);
    }
    let cli = crate::jobs::default_ai_cli();
    let prompt = format!("{}\n\nRequest: {text}", instruction(projects, agents));
    let cwd = std::env::temp_dir();
    let answer = crate::aigen::run_ai(
        app,
        &cli,
        &cwd.to_string_lossy(),
        &prompt,
        crate::aigen::ropts(None, small_model(&cli).into(), String::new(), false, false),
        PROGRESS_EVENT,
        gen_id,
    );
    match answer {
        Ok(raw) => read_reply(&raw, projects, agents),
        Err(error) => failed(error, false),
    }
}

/// This machine's own projects and the agents its window offers: what a phone's
/// sentence is matched against.
pub(crate) fn local_context(app: &AppHandle) -> (Vec<TalkProject>, Vec<TalkAgent>) {
    let svc = app.state::<crate::services::ServiceState>();
    let projects = crate::config::list_projects(&svc.snapshot())
        .unwrap_or_default()
        .iter()
        .map(|p| TalkProject {
            name: string_of(p, "name"),
            label: string_of(p, "label"),
            parent: string_of(p, "parentName"),
        })
        .filter(|p| !p.name.is_empty())
        .collect();
    let agents = crate::remote_agents::agent_labels()
        .into_iter()
        .map(|(id, label)| TalkAgent { id, label })
        .collect();
    (projects, agents)
}

/// A plan a phone approved, checked again before the window runs it.
pub(crate) fn checked(v: &Value, projects: &[TalkProject], agents: &[TalkAgent]) -> Result<TalkPlan, String> {
    let plan: TalkPlan =
        serde_json::from_value(v.clone()).map_err(|_| "That plan can't be read.".to_string())?;
    if !projects.iter().any(|p| p.name == plan.project) {
        return Err("Pick a project for the plan first.".into());
    }
    if !agents.is_empty() && !agents.iter().any(|a| a.id == plan.agent) {
        return Err(format!("This {} doesn't offer that agent.", crate::sys::MACHINE));
    }
    if plan.prompt.trim().is_empty() {
        return Err("The plan has no prompt to send.".into());
    }
    Ok(plan)
}

#[tauri::command(async)]
pub fn talk_plan(
    app: AppHandle,
    text: String,
    projects: Vec<TalkProject>,
    agents: Vec<TalkAgent>,
    gen_id: String,
) -> Value {
    plan(&app, &text, &projects, &agents, &gen_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn projects() -> Vec<TalkProject> {
        ["glimpse", "glimpse-api", "saas-app"]
            .iter()
            .map(|n| TalkProject { name: n.to_string(), label: String::new(), parent: String::new() })
            .collect()
    }

    fn agents() -> Vec<TalkAgent> {
        [("claude", "Claude Code"), ("codex", "Codex")]
            .iter()
            .map(|(id, label)| TalkAgent { id: id.to_string(), label: label.to_string() })
            .collect()
    }

    #[test]
    fn a_reply_becomes_a_plan() {
        let raw = r#"```json
{"project": "glimpse", "candidates": [], "where": "copy", "agent": "claude", "prompt": "fix the latest github issue assigned to me", "label": "latest  issue", "unsupported": null}
```"#;
        let r = read_reply(raw, &projects(), &agents());
        assert_eq!(r["ok"], true);
        assert_eq!(r["plan"]["project"], "glimpse");
        assert_eq!(r["plan"]["where"], "copy");
        assert_eq!(r["plan"]["agent"], "claude");
        assert_eq!(r["plan"]["label"], "latest issue");
        assert_eq!(r["candidates"], json!([]));
    }

    #[test]
    fn an_unknown_project_is_asked_about() {
        let raw = r#"{"project": "glimps", "candidates": ["glimpse", "glimpse-api", "nope"], "where": "here", "agent": "cursor", "prompt": "add tests", "label": "tests"}"#;
        let r = read_reply(raw, &projects(), &agents());
        assert_eq!(r["plan"]["project"], "");
        assert_eq!(r["candidates"], json!(["glimpse", "glimpse-api"]));
        assert_eq!(r["plan"]["agent"], "claude");
        assert_eq!(r["plan"]["label"], "");
    }

    #[test]
    fn a_label_names_the_project_it_shows_as() {
        let mut list = projects();
        list[2].label = "Storefront".into();
        let raw = r#"{"project": "storefront", "where": "worktree", "agent": "CODEX", "prompt": "bump deps"}"#;
        let r = read_reply(raw, &list, &agents());
        assert_eq!(r["plan"]["project"], "saas-app");
        assert_eq!(r["plan"]["where"], "worktree");
        assert_eq!(r["plan"]["agent"], "codex");
    }

    #[test]
    fn what_a_plan_cannot_do_is_said() {
        let raw = r#"{"project": null, "prompt": "", "unsupported": "A plan can't delete projects."}"#;
        let r = read_reply(raw, &projects(), &agents());
        assert_eq!(r["ok"], false);
        assert_eq!(r["unsupported"], true);
        assert_eq!(r["error"], "A plan can't delete projects.");
        assert_eq!(read_reply("no json here", &projects(), &agents())["unsupported"], false);
    }

    #[test]
    fn an_approved_plan_is_checked_again() {
        let plan = json!({ "project": "glimpse", "where": "copy", "agent": "claude", "prompt": "fix it", "label": "fix" });
        assert!(checked(&plan, &projects(), &agents()).is_ok());
        let mut wrong = plan.clone();
        wrong["project"] = json!("elsewhere");
        assert!(checked(&wrong, &projects(), &agents()).is_err());
        let mut blank = plan.clone();
        blank["prompt"] = json!("  ");
        assert!(checked(&blank, &projects(), &agents()).is_err());
        let mut place = plan.clone();
        place["where"] = json!("elsewhere");
        assert!(checked(&place, &projects(), &agents()).is_err());
        let mut agent = plan;
        agent["agent"] = json!("cursor");
        assert!(checked(&agent, &projects(), &agents()).is_err());
        assert!(checked(&agent, &projects(), &[]).is_ok());
    }
}
