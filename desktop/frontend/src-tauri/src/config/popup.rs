//! An action's `popup`: a page shown in a card while the pointer rests on its
//! button, or on a long press on the phone. One key names the page's format
//! (`html` today) and `data`, `title`, `size` and `refresh` beside it mean the
//! same for every format. A popup the config gets wrong never costs its action:
//! it reads as a `problem`, which the card shows in place of the page.
use super::SshSettings;
use crate::interval::parse_secs;
use serde::{Deserialize, Deserializer};
use serde_norway::{Mapping, Value};
use std::collections::{BTreeMap, BTreeSet};

/// Every format a popup may name. Those this build can't show yet still count,
/// so a config written for a newer lpm says so instead of reading as a mistake.
const FORMATS: &[&str] = &["html", "widgets", "vega", "markdown", "image", "terminal", "url"];
pub(crate) const SHOWN: &[&str] = &["html"];

const DEFAULT_SIZE: (u32, u32) = (360, 220);
const WIDTH: (u32, u32) = (200, 720);
const HEIGHT: (u32, u32) = (80, 560);
const MIN_REFRESH_SECS: u64 = 5;
const DEFAULT_CACHE_SECS: u64 = 30;
const MIN_CACHE_SECS: u64 = 5;

#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) enum PopupData {
    #[default]
    None,
    /// A file, or a `$(command)` whose output is the data.
    Source(String),
    /// Data written in the config itself.
    Inline(serde_json::Value),
}

#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct PopupDef {
    pub format: String,
    pub source: String,
    pub data: PopupData,
    pub title: String,
    pub width: u32,
    pub height: u32,
    /// Seconds between refreshes while the card is open; 0 runs it only on open.
    pub refresh: u64,
    /// Seconds a result counts as current: opening the card within them runs
    /// nothing, and later it shows the saved result while running again.
    pub cache: u64,
    pub problem: String,
}

impl PopupDef {
    /// The commands behind the page and the data.
    pub(crate) fn commands(&self) -> impl Iterator<Item = &str> {
        let data = match &self.data {
            PopupData::Source(source) => Some(source.as_str()),
            _ => None,
        };
        std::iter::once(self.source.as_str())
            .chain(data)
            .filter_map(command_of)
    }
}

/// The command in `$(command)` when that's the whole value.
pub(crate) fn command_of(source: &str) -> Option<&str> {
    let source = source.trim();
    source
        .strip_prefix("$(")
        .and_then(|rest| rest.strip_suffix(')'))
        .map(str::trim)
        .filter(|cmd| !cmd.is_empty())
}

/// What the button needs before the card opens.
#[derive(serde::Serialize, Clone, Debug, PartialEq)]
pub struct PopupInfo {
    pub format: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub title: String,
    pub width: u32,
    pub height: u32,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub problem: String,
}

impl From<&PopupDef> for PopupInfo {
    fn from(def: &PopupDef) -> Self {
        Self {
            format: def.format.clone(),
            title: def.title.clone(),
            width: def.width,
            height: def.height,
            problem: def.problem.clone(),
        }
    }
}

pub(super) fn lenient<'de, D: Deserializer<'de>>(d: D) -> Result<Option<PopupDef>, D::Error> {
    Ok(parse(&Value::deserialize(d)?))
}

pub(crate) fn parse(value: &Value) -> Option<PopupDef> {
    match value {
        Value::Null => None,
        Value::String(s) if s.trim().is_empty() => None,
        Value::String(s) => Some(short_form(s.trim())),
        Value::Mapping(map) => Some(from_map(map)),
        _ => Some(problem(
            "expected a page's file name, or a map with `html` and the popup's settings",
        )),
    }
}

fn short_form(source: &str) -> PopupDef {
    match format_of(source) {
        Some(format) => PopupDef {
            format: format.into(),
            source: source.into(),
            ..sized(DEFAULT_SIZE)
        },
        None => problem(format!(
            "can't tell what {source:?} is; name its format, as in `html: {source}`"
        )),
    }
}

fn format_of(source: &str) -> Option<&'static str> {
    let lower = source.to_ascii_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        return Some("url");
    }
    let by_ending = [
        (".html", "html"),
        (".htm", "html"),
        (".vl.json", "vega"),
        (".md", "markdown"),
        (".png", "image"),
        (".jpg", "image"),
        (".jpeg", "image"),
        (".gif", "image"),
        (".svg", "image"),
        (".webp", "image"),
    ];
    by_ending
        .iter()
        .find(|(ending, _)| lower.ends_with(ending))
        .map(|(_, format)| *format)
}

fn from_map(map: &Mapping) -> PopupDef {
    let named: Vec<&str> = FORMATS
        .iter()
        .copied()
        .filter(|format| map.contains_key(*format))
        .collect();
    let format = match named.as_slice() {
        [format] => *format,
        [] => return problem("needs a format key, as in `html: scripts/stars/popup.html`"),
        many => {
            return problem(format!(
                "names {} formats ({}); keep one",
                many.len(),
                many.join(", ")
            ))
        }
    };
    let Some(source) = text(map, format).filter(|s| !s.trim().is_empty()) else {
        return problem(format!(
            "`{format}` needs a page: a file name, the page itself, or $(a command that prints it)"
        ));
    };
    PopupDef {
        format: format.into(),
        source: source.trim().into(),
        data: data(map.get("data")),
        title: text(map, "title").unwrap_or_default().trim().into(),
        refresh: text(map, "refresh").map(|r| parse_refresh(&r)).unwrap_or(0),
        cache: text(map, "cache").and_then(|c| parse_secs(&c)).map_or(DEFAULT_CACHE_SECS, |s| {
            s.max(MIN_CACHE_SECS)
        }),
        ..sized(text(map, "size").and_then(|s| parse_size(&s)).unwrap_or(DEFAULT_SIZE))
    }
}

fn text(map: &Mapping, key: &str) -> Option<String> {
    match map.get(key)? {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

fn data(value: Option<&Value>) -> PopupData {
    match value {
        None | Some(Value::Null) => PopupData::None,
        Some(Value::String(s)) if s.trim().is_empty() => PopupData::None,
        Some(Value::String(s)) => PopupData::Source(s.trim().into()),
        Some(other) => PopupData::Inline(serde_json::to_value(other).unwrap_or_default()),
    }
}

/// `380x220`, held to what fits beside a button.
fn parse_size(size: &str) -> Option<(u32, u32)> {
    let lower = size.trim().to_lowercase();
    let (w, h) = lower.split_once('x').or_else(|| lower.split_once('×'))?;
    let w: u32 = w.trim().parse().ok()?;
    let h: u32 = h.trim().parse().ok()?;
    Some((w.clamp(WIDTH.0, WIDTH.1), h.clamp(HEIGHT.0, HEIGHT.1)))
}

/// `open` (or nothing) runs the commands only as the card opens; a number of
/// seconds, or one with `s`, `m` or `h`, runs them again on that interval while
/// it's open, five seconds at the least.
fn parse_refresh(refresh: &str) -> u64 {
    match parse_secs(refresh) {
        Some(0) | None => 0,
        Some(secs) => secs.max(MIN_REFRESH_SECS),
    }
}

fn sized((width, height): (u32, u32)) -> PopupDef {
    PopupDef {
        width,
        height,
        cache: DEFAULT_CACHE_SECS,
        ..Default::default()
    }
}

fn problem(message: impl std::fmt::Display) -> PopupDef {
    PopupDef {
        problem: format!("This popup's config {message}."),
        ..sized(DEFAULT_SIZE)
    }
}

/// Where an action's popup comes from: its definition, and the folder, env and
/// host its commands run with, the same as its label's commands.
pub(crate) struct PopupSite {
    pub def: PopupDef,
    pub cwd: String,
    pub env: BTreeMap<String, String>,
    pub root: String,
    pub ssh: Option<SshSettings>,
    /// Commands from the repo's `.lpm.yml` not yet allowed.
    pub held: BTreeSet<String>,
}

pub(crate) fn popup_site(project: &str, action: &str) -> Result<PopupSite, String> {
    let map = super::resolve_action_map(project);
    let act = super::lookup_action(&map, action)
        .ok_or_else(|| format!("There's no action {action:?} in this project."))?;
    let def = act
        .popup
        .clone()
        .ok_or_else(|| "This action has no popup.".to_string())?;
    let (root, ssh, held) = if project == super::RESERVED_PROJECT_NAME {
        (super::global_root(), None, BTreeSet::new())
    } else {
        let yaml = super::parse_project_yaml(project)?;
        let ssh = yaml.ssh.clone().unwrap_or_default();
        let root = super::frontend_root(&yaml.root, &ssh);
        let held = super::repo_trust::held(&root, ssh.is_remote());
        (root, ssh.is_remote().then_some(ssh), held)
    };
    Ok(PopupSite {
        def,
        cwd: act.cwd,
        env: act.env,
        root,
        ssh,
        held,
    })
}

#[cfg(test)]
#[path = "popup_tests.rs"]
mod tests;
