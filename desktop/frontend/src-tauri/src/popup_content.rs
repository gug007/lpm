//! What an action's popup shows: its page and the data its command printed,
//! made where the project lives for this Mac's card, a paired Mac's card, or
//! lpm Link. Nothing a popup gets wrong is an error to the caller: a page that
//! can't be made, or data that can't be read, comes back as words the card
//! shows. Only a missing project or action is an error.
use crate::config::popup::{command_of, popup_site, PopupData, PopupSite, SHOWN};
use crate::action_exec::{action_place, size_words};
use crate::popup_cache;
use crate::popup_run;
use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeMap;
use std::time::{Duration, Instant};

const MAX_PAGE: usize = 1536 * 1024;
const MAX_DATA: usize = 1024 * 1024;

#[derive(Serialize, Clone, Default, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PopupContent {
    pub refresh: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub html: Option<String>,
    /// The page's file when it's on the machine that made it, so the desktop
    /// can load the page's own scripts and styles from beside it.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file: Option<String>,
    pub data: Value,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub text: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub data_error: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub error: String,
    /// When this page and data were made, in Unix milliseconds.
    pub updated_at: i64,
    /// Older than the config's `cache`: show it, and ask again with `fresh`.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub stale: bool,
    /// Why the last run failed, while the last good result is shown instead.
    #[serde(skip_serializing_if = "String::is_empty")]
    pub refresh_error: String,
}

impl PopupContent {
    /// Why this run failed, empty when it didn't.
    pub(crate) fn failure(&self) -> &str {
        if self.error.is_empty() {
            &self.data_error
        } else {
            &self.error
        }
    }
}

#[tauri::command(async)]
pub fn action_popup(
    project_name: String,
    action_name: String,
    fresh: bool,
) -> Result<PopupContent, String> {
    content(&project_name, &action_name, fresh)
}

/// The popup of `action` in `project`. Opening a card shows what it showed
/// last, marked `stale` once older than the config's `cache`, and the caller
/// then asks again with `fresh`, which runs the commands. A run that fails
/// keeps the last good result on show, with the failure beside it. Two asks at
/// once share one run.
pub(crate) fn content(project: &str, action: &str, fresh: bool) -> Result<PopupContent, String> {
    let site = popup_site(project, action)?;
    let key = format!("{project}\n{action}");
    let config = fingerprint(&site);
    if !fresh {
        if let Some((age, mut saved)) = popup_cache::get(&key, config) {
            saved.stale = age >= Duration::from_secs(site.def.cache);
            return Ok(saved);
        }
    }
    let asked = Instant::now();
    let turn = popup_cache::turn(&key);
    let _turn = turn.lock().unwrap_or_else(|e| e.into_inner());
    let last = popup_cache::get(&key, config);
    if let Some((age, saved)) = &last {
        if *age < asked.elapsed() {
            return Ok(saved.clone());
        }
    }
    let made = make(project, action, &site);
    let kept = popup_cache::keep_last_good(last.map(|(_, saved)| saved), made);
    popup_cache::remember(key, config, kept.clone());
    Ok(kept)
}

/// Which config a saved result was made from, so an edit makes it again.
fn fingerprint(site: &PopupSite) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    format!("{:?}{}{:?}{}{:?}", site.def, site.cwd, site.env, site.root, site.held).hash(&mut hasher);
    hasher.finish()
}

fn make(project: &str, action: &str, site: &PopupSite) -> PopupContent {
    let def = &site.def;
    let mut out = PopupContent {
        refresh: def.refresh,
        updated_at: crate::status::now_millis(),
        ..Default::default()
    };
    if !def.problem.is_empty() {
        out.error = def.problem.clone();
        return out;
    }
    if def.commands().any(|command| site.held.contains(command)) {
        out.error = "This popup runs commands from the repo's .lpm.yml, which wait until you allow them in lpm.".into();
        return out;
    }
    if !SHOWN.contains(&def.format.as_str()) {
        out.error = format!(
            "This version of lpm can't show `{}` popups yet. Update lpm to see it.",
            def.format
        );
        return out;
    }
    let runner = Runner::new(project, action, site);
    let (page, data) = std::thread::scope(|scope| {
        let data = scope.spawn(|| runner.data(&def.data));
        let page = runner.page(&def.source);
        (page, data.join().unwrap_or_else(|_| Err("The data command stopped.".into())))
    });
    match page {
        Ok((html, file)) => {
            out.html = Some(html);
            out.file = file;
        }
        Err(e) => {
            out.error = e;
            return out;
        }
    }
    match data {
        Ok((data, text)) => {
            out.data = data;
            out.text = text;
        }
        Err(e) => out.data_error = e,
    }
    out
}

struct Runner<'a> {
    site: &'a PopupSite,
    dir: String,
    env: BTreeMap<String, String>,
}

impl<'a> Runner<'a> {
    fn new(project: &str, action: &str, site: &'a PopupSite) -> Self {
        let (dir, mut env) =
            action_place(project, &site.root, site.ssh.is_some(), &site.cwd, &site.env);
        env.insert("LPM_ACTION".into(), action.to_string());
        Self { site, dir, env }
    }

    fn run(&self, cmd: &str, max: usize) -> Result<String, String> {
        let script = crate::config::build_local_script(&self.env, cmd);
        popup_run::run(self.site.ssh.as_ref(), &self.dir, &script, max)
    }

    fn read(&self, path: &str, max: usize) -> Result<(String, Option<String>), String> {
        popup_run::read_file(self.site.ssh.as_ref(), &self.dir, path, max)
    }

    /// The page: what a `$(command)` prints, the page written in the config
    /// itself, or a file.
    fn page(&self, source: &str) -> Result<(String, Option<String>), String> {
        let (html, file) = if let Some(cmd) = command_of(source) {
            let html = self
                .run(cmd, MAX_PAGE)
                .map_err(|e| format!("The page's command {e}."))?;
            (html, None)
        } else if is_inline_page(source) {
            (source.to_string(), None)
        } else {
            self.read(source, MAX_PAGE)?
        };
        if html.trim().is_empty() {
            return Err("The page is empty.".into());
        }
        if html.len() > MAX_PAGE {
            return Err(format!(
                "The page is {}; a popup can be up to {}.",
                size_words(html.len()),
                size_words(MAX_PAGE)
            ));
        }
        Ok((html, file))
    }

    /// JSON when the output reads as JSON, else the output as text.
    fn data(&self, data: &PopupData) -> Result<(Value, String), String> {
        let printed = match data {
            PopupData::None => return Ok((Value::Null, String::new())),
            PopupData::Inline(value) => return Ok((value.clone(), String::new())),
            PopupData::Source(source) => match command_of(source) {
                Some(cmd) => self
                    .run(cmd, MAX_DATA)
                    .map_err(|e| format!("The data command {e}."))?,
                None => self.read(source, MAX_DATA)?.0,
            },
        };
        if printed.trim().is_empty() {
            return Ok((Value::Null, String::new()));
        }
        Ok(match serde_json::from_str(printed.trim()) {
            Ok(value) => (value, String::new()),
            Err(_) => (Value::Null, printed),
        })
    }
}

fn is_inline_page(source: &str) -> bool {
    source.contains('\n') || source.trim_start().starts_with('<')
}

#[cfg(test)]
#[path = "popup_content_tests.rs"]
mod tests;
