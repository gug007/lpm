//! Dynamic action labels. A label may hold `{{…}}` variables and `$(…)`
//! commands (label_template.rs). Labels render when projects are listed, from
//! cached values only: local git facts come from label_git.rs, command output
//! and SSH git queries from label_probes.rs, whose ticker emits
//! `projects-changed` whenever a value or a rendered age moves so every window
//! and phone redraws.

use crate::config::{self, ActionInfo, SshSettings};
use crate::label_git::{self, TagOrder};
use crate::label_probes;
use crate::label_template::{is_dynamic, render, Part, Var};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const DEFAULT_EVERY: Duration = Duration::from_secs(60);
const MIN_EVERY: Duration = Duration::from_secs(5);
const STALE: Duration = Duration::from_secs(600);
const BRANCH_SCRIPT: &str = "git symbolic-ref --short -q HEAD || git rev-parse --short HEAD";

/// Where a project's labels resolve: its file name, its root (the SSH host's
/// directory for a remote project) and its SSH settings when it is remote.
pub struct Ctx<'a> {
    pub project: &'a str,
    pub root: &'a str,
    pub ssh: Option<&'a SshSettings>,
    /// Commands from the repo's `.lpm.yml` not yet allowed: they read as empty
    /// and never run.
    pub held: &'a BTreeSet<String>,
}

pub(crate) fn format_age(secs: i64) -> String {
    let (n, unit) = match secs.max(0) {
        s if s < 60 => return "just now".into(),
        s if s < 3600 => (s / 60, "m"),
        s if s < 86_400 => (s / 3600, "h"),
        s if s < 604_800 => (s / 86_400, "d"),
        s if s < 2_592_000 => (s / 604_800, "w"),
        s if s < 31_536_000 => (s / 2_592_000, "mo"),
        s => (s / 31_536_000, "y"),
    };
    format!("{n}{unit} ago")
}

/// `labelRefresh`, how often an action's `$(…)` commands run: seconds, or a
/// number with `s`, `m` or `h`. Missing or unreadable means a minute; anything
/// under five seconds is raised to five.
pub(crate) fn parse_every(s: &str) -> Duration {
    crate::interval::parse_secs(s).map_or(DEFAULT_EVERY, |secs| {
        Duration::from_secs(secs).max(MIN_EVERY)
    })
}

pub fn apply(ctx: &Ctx, actions: &mut [ActionInfo]) {
    for a in actions.iter_mut() {
        apply_one(ctx, a);
        apply(ctx, &mut a.children);
    }
}

/// Every label an action shows renders here: its button, its emoji (the first
/// word of what it renders to), and the questions and choices it asks before
/// running. Each keeps the text as written in a `config_*` twin, so an edit
/// form saves the template, not today's value.
fn apply_one(ctx: &Ctx, a: &mut ActionInfo) {
    let owner = Owner {
        ctx,
        action: &a.name,
        cwd: &a.cwd,
        env: &a.env,
        every: parse_every(&a.label_refresh),
    };
    if a.label_refresh_on_change && ctx.ssh.is_none() {
        crate::label_watch::watch(ctx.project, &a.name, ctx.root);
    }
    if let Some(label) = owner.finish(&a.label, key_of(&a.name), false) {
        a.config_label = std::mem::replace(&mut a.label, label);
    }
    if let Some(markup) = owner.finish(&a.label_svg, "", true) {
        a.label_svg = markup;
    }
    if let Some(emoji) = owner.finish(&a.emoji, "", false) {
        let emoji = emoji
            .split_whitespace()
            .next()
            .unwrap_or_default()
            .to_string();
        if emoji != a.emoji {
            a.config_emoji = Some(std::mem::replace(&mut a.emoji, emoji));
        }
    }
    for input in a.inputs.iter_mut() {
        if let Some(label) = owner.finish(&input.label, &input.key, false) {
            input.config_label = std::mem::replace(&mut input.label, label);
        }
        for option in input.options.iter_mut() {
            if let Some(label) = owner.finish(&option.label, &option.value, false) {
                option.config_label = std::mem::replace(&mut option.label, label);
            }
        }
    }
}

/// The action a label belongs to: its commands run in its cwd with its env on
/// its `labelRefresh` interval, and hovering its button runs them again.
struct Owner<'a, 'c> {
    ctx: &'a Ctx<'c>,
    action: &'a str,
    cwd: &'a str,
    env: &'a BTreeMap<String, String>,
    every: Duration,
}

impl Owner<'_, '_> {
    /// The text to show, or None when it reads as written. A `whole` template
    /// (a `labelSvg`) keeps all its commands print, not their first line.
    fn finish(&self, template: &str, fallback: &str, whole: bool) -> Option<String> {
        if !is_dynamic(template) {
            return None;
        }
        let rendered = render(template, |part| match part {
            Part::Var(var) => resolve(self.ctx, var),
            Part::Cmd(cmd) if self.ctx.held.contains(*cmd) => String::new(),
            Part::Cmd(cmd) => label_probes::read_command(
                self.ctx,
                self.action,
                self.cwd,
                self.env,
                cmd,
                self.every,
                whole,
            ),
        });
        let rendered = if rendered.trim().is_empty() {
            fallback.to_string()
        } else {
            rendered
        };
        (rendered != template).then_some(rendered)
    }
}

fn key_of(id: &str) -> &str {
    id.rsplit(':').next().unwrap_or(id)
}

fn resolve(ctx: &Ctx, var: &Var) -> String {
    match var {
        Var::Project => config::project_display_name(ctx.project),
        Var::Branch => match ctx.ssh {
            Some(ssh) => label_probes::read_remote(ctx.project, ssh, ctx.root, BRANCH_SCRIPT),
            None => label_git::branch(ctx.root).unwrap_or_default(),
        },
        Var::Tag(pattern) => tag(ctx, pattern, TagOrder::Newest)
            .map(|(name, _)| name)
            .unwrap_or_default(),
        Var::TagAge(pattern) => tag(ctx, pattern, TagOrder::Newest)
            .map(|(_, at)| age_of(format!("{}|{}|{pattern}", host_of(ctx), ctx.root), at))
            .unwrap_or_default(),
        Var::Next(bump, pattern) => tag(ctx, pattern, TagOrder::Highest)
            .and_then(|(name, _)| label_git::next_version(&name, *bump))
            .unwrap_or_default(),
    }
}

fn tag(ctx: &Ctx, pattern: &str, order: TagOrder) -> Option<(String, i64)> {
    match ctx.ssh {
        Some(ssh) => {
            let script = label_git::tag_args(pattern, order)
                .iter()
                .map(|a| config::shell_quote(a))
                .collect::<Vec<_>>()
                .join(" ");
            let out =
                label_probes::read_remote(ctx.project, ssh, ctx.root, &format!("git {script}"));
            label_git::parse_tag(&out)
        }
        None => label_git::tag(ctx.root, pattern, order),
    }
}

fn host_of(ctx: &Ctx) -> String {
    ctx.ssh
        .map(|s| format!("{}@{}:{}", s.user, s.host, s.port))
        .unwrap_or_default()
}

struct Age {
    at: i64,
    text: String,
    seen: Instant,
}

fn ages() -> &'static Mutex<HashMap<String, Age>> {
    static AGES: OnceLock<Mutex<HashMap<String, Age>>> = OnceLock::new();
    AGES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// The age text for `at`, remembered so the ticker can tell when it next reads
/// differently ("5m ago" → "6m ago"). Only the ticker moves the remembered text,
/// so a listing in between doesn't swallow the change before phones hear of it.
fn age_of(key: String, at: i64) -> String {
    let text = format_age(now_unix() - at);
    let mut ages = ages().lock().unwrap();
    let entry = ages.entry(key).or_insert_with(|| Age {
        at,
        text: text.clone(),
        seen: Instant::now(),
    });
    if entry.at != at {
        entry.at = at;
        entry.text = text.clone();
    }
    entry.seen = Instant::now();
    text
}

/// Whether any rendered age now reads differently.
pub(crate) fn ages_moved() -> bool {
    let now = now_unix();
    let mut ages = ages().lock().unwrap();
    ages.retain(|_, a| a.seen.elapsed() < STALE);
    let mut moved = false;
    for age in ages.values_mut() {
        let text = format_age(now - age.at);
        if text != age.text {
            age.text = text;
            moved = true;
        }
    }
    moved
}

#[cfg(test)]
#[path = "action_labels_tests.rs"]
mod tests;
