//! Zones: framed groups of buttons in the header or the footer. A zone is placement only — buttons
//! point at it with `display: <zone>`; their definitions stay wherever they
//! are declared.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_norway::Value as Yaml;

use crate::config::{global_path, peek_parent, project_path, project_root, sorted_by_position};
use crate::zone_layers::{layers_of, merge_zone_layers, LayerEntry, LayerInfo};

const RESERVED: &[&str] = &["", "header", "footer", "menu", "button"];

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ZoneSource {
    Project,
    Repo,
    Global,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ZoneDisplay {
    #[default]
    Header,
    Footer,
}

#[derive(Clone, Debug, Default)]
struct ZoneEntry {
    rows: Option<i64>,
    label: Option<String>,
    position: Option<f64>,
    display: Option<ZoneDisplay>,
    layers: BTreeMap<String, LayerEntry>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct ZoneInfo {
    pub name: String,
    pub label: String,
    pub rows: u8,
    pub display: ZoneDisplay,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position: Option<f64>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub layers: Vec<LayerInfo>,
    pub source: ZoneSource,
}

// Anything but header or footer counts as unset, so the next file's value (or
// the header) applies; `lpm config` reports it.
fn display_of(value: &Yaml) -> Option<ZoneDisplay> {
    match value.get("display").and_then(Yaml::as_str) {
        Some("header") => Some(ZoneDisplay::Header),
        Some("footer") => Some(ZoneDisplay::Footer),
        _ => None,
    }
}

fn entries_from_yaml(doc: &Yaml) -> BTreeMap<String, ZoneEntry> {
    let Some(zones) = doc.get("zones").and_then(Yaml::as_mapping) else {
        return BTreeMap::new();
    };
    zones
        .iter()
        .filter_map(|(key, value)| {
            let name = key.as_str()?;
            if RESERVED.contains(&name) || name.contains([':', '/']) {
                return None;
            }
            let entry = ZoneEntry {
                rows: value.get("rows").and_then(Yaml::as_i64),
                label: value
                    .get("label")
                    .and_then(Yaml::as_str)
                    .map(str::to_string),
                position: value.get("position").and_then(Yaml::as_f64),
                display: display_of(value),
                layers: layers_of(value),
            };
            Some((name.to_string(), entry))
        })
        .collect()
}

fn load_entries(path: &Path) -> BTreeMap<String, ZoneEntry> {
    std::fs::read(path)
        .ok()
        .and_then(|bytes| serde_norway::from_slice::<Yaml>(&bytes).ok())
        .map(|doc| entries_from_yaml(&doc))
        .unwrap_or_default()
}

/// Files come highest precedence first. A zone exists when some file
/// declares it with `rows`; every field falls back to the next file that
/// sets it, the rule actions follow.
fn merge_files(files: &[(ZoneSource, BTreeMap<String, ZoneEntry>)]) -> Vec<ZoneInfo> {
    let names: BTreeSet<&String> = files
        .iter()
        .flat_map(|(_, entries)| entries.keys())
        .collect();
    let mut zones: BTreeMap<String, ZoneInfo> = BTreeMap::new();
    for name in names {
        let found: Vec<(ZoneSource, &ZoneEntry)> = files
            .iter()
            .filter_map(|(source, entries)| entries.get(name).map(|entry| (*source, entry)))
            .collect();
        let Some((source, declared)) = found.iter().find(|(_, entry)| entry.rows.is_some()) else {
            continue;
        };
        let label = found
            .iter()
            .find_map(|(_, entry)| entry.label.clone().filter(|label| !label.is_empty()))
            .unwrap_or_else(|| name.clone());
        let zone = ZoneInfo {
            name: name.clone(),
            label,
            rows: declared.rows.unwrap_or(1).clamp(1, 3) as u8,
            display: found
                .iter()
                .find_map(|(_, entry)| entry.display)
                .unwrap_or_default(),
            position: found.iter().find_map(|(_, entry)| entry.position),
            layers: merge_zone_layers(
                &found
                    .iter()
                    .map(|(_, entry)| &entry.layers)
                    .collect::<Vec<_>>(),
            ),
            source: *source,
        };
        zones.insert(name.clone(), zone);
    }
    sorted_by_position(zones, |zone| zone.position)
}

/// The files that can declare zones, highest precedence first, as in
/// config::resolve_action_map: project > duplicate's parent > repo .lpm.yml
/// (local projects with a root only) > global.yml.
fn zone_files(
    project: PathBuf,
    parent: Option<PathBuf>,
    root: &str,
    is_remote: bool,
    global: PathBuf,
) -> Vec<(ZoneSource, PathBuf)> {
    let mut files = vec![(ZoneSource::Project, project)];
    if let Some(parent) = parent {
        files.push((ZoneSource::Project, parent));
    }
    if !is_remote && !root.is_empty() {
        files.push((ZoneSource::Repo, Path::new(root).join(".lpm.yml")));
    }
    files.push((ZoneSource::Global, global));
    files
}

/// The zones a project shows, merged across the files `zone_files` lists.
pub fn resolve_zones(file_name: &str) -> Vec<ZoneInfo> {
    let (root, is_remote) = project_root(file_name).unwrap_or_default();
    resolve_zones_with(
        file_name,
        peek_parent(file_name).as_deref(),
        &root,
        is_remote,
    )
}

/// `resolve_zones` for a caller that has already parsed the project file.
pub fn resolve_zones_with(
    file_name: &str,
    parent: Option<&str>,
    root: &str,
    is_remote: bool,
) -> Vec<ZoneInfo> {
    let files: Vec<_> = zone_files(
        project_path(file_name),
        parent.map(project_path),
        root,
        is_remote,
        global_path(),
    )
    .into_iter()
    .map(|(source, path)| (source, load_entries(&path)))
    .collect();
    merge_files(&files)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(yaml: &str) -> BTreeMap<String, ZoneEntry> {
        entries_from_yaml(&serde_norway::from_str(yaml).unwrap())
    }

    #[test]
    fn a_zone_needs_rows_somewhere_to_exist() {
        let zones = merge_files(&[(
            ZoneSource::Project,
            file("zones:\n  build:\n    position: 2\n"),
        )]);
        assert!(zones.is_empty());
    }

    #[test]
    fn fields_fall_back_file_by_file() {
        let zones = merge_files(&[
            (
                ZoneSource::Project,
                file("zones:\n  agents:\n    position: 4\n"),
            ),
            (
                ZoneSource::Global,
                file("zones:\n  agents:\n    rows: 2\n    label: Agents\n    position: 9\n"),
            ),
        ]);
        assert_eq!(
            zones,
            vec![ZoneInfo {
                name: "agents".into(),
                label: "Agents".into(),
                rows: 2,
                display: ZoneDisplay::Header,
                position: Some(4.0),
                layers: vec![],
                source: ZoneSource::Global,
            }]
        );
    }

    #[test]
    fn the_highest_declaring_file_is_the_source() {
        let zones = merge_files(&[
            (ZoneSource::Project, file("zones:\n  build:\n    rows: 3\n")),
            (ZoneSource::Global, file("zones:\n  build:\n    rows: 1\n")),
        ]);
        assert_eq!(zones[0].rows, 3);
        assert_eq!(zones[0].source, ZoneSource::Project);
    }

    #[test]
    fn rows_are_clamped_and_the_label_defaults_to_the_name() {
        let zones = merge_files(&[(
            ZoneSource::Project,
            file("zones:\n  a:\n    rows: 9\n  b:\n    rows: 0\n"),
        )]);
        let got: Vec<(&str, u8)> = zones.iter().map(|z| (z.label.as_str(), z.rows)).collect();
        assert_eq!(got, vec![("a", 3), ("b", 1)]);
    }

    #[test]
    fn reserved_and_colon_names_are_ignored() {
        let zones = merge_files(&[(
            ZoneSource::Project,
            file("zones:\n  header:\n    rows: 1\n  a:b:\n    rows: 1\n"),
        )]);
        assert!(zones.is_empty());
    }

    #[test]
    fn zones_sort_by_position_then_name() {
        let zones = merge_files(&[(
            ZoneSource::Project,
            file("zones:\n  c:\n    rows: 1\n  b:\n    rows: 1\n    position: 2\n  a:\n    rows: 1\n    position: 2\n  d:\n    rows: 1\n    position: 1\n"),
        )]);
        let names: Vec<&str> = zones.iter().map(|z| z.name.as_str()).collect();
        assert_eq!(names, vec!["d", "a", "b", "c"]);
    }

    #[test]
    fn a_file_without_zones_has_none() {
        assert!(file("actions:\n  test: npm test\n").is_empty());
    }

    #[test]
    fn serializes_for_the_frontend() {
        let zone = ZoneInfo {
            name: "build".into(),
            label: "Build".into(),
            rows: 2,
            display: ZoneDisplay::Footer,
            position: None,
            layers: vec![],
            source: ZoneSource::Repo,
        };
        assert_eq!(
            serde_json::to_value(&zone).unwrap(),
            serde_json::json!({ "name": "build", "label": "Build", "rows": 2, "display": "footer", "source": "repo" })
        );
    }

    #[test]
    fn a_zone_sits_in_the_header_unless_a_file_says_footer() {
        let zones = merge_files(&[
            (
                ZoneSource::Project,
                file(
                    "zones:\n  deploy:\n    position: 1\n  build:\n    rows: 1\n    position: 2\n",
                ),
            ),
            (
                ZoneSource::Global,
                file("zones:\n  deploy:\n    rows: 2\n    display: footer\n"),
            ),
        ]);
        let got: Vec<(&str, ZoneDisplay)> =
            zones.iter().map(|z| (z.name.as_str(), z.display)).collect();
        assert_eq!(
            got,
            vec![
                ("deploy", ZoneDisplay::Footer),
                ("build", ZoneDisplay::Header)
            ]
        );
    }

    #[test]
    fn a_higher_file_moves_a_zone_to_the_other_row() {
        let zones = merge_files(&[
            (
                ZoneSource::Project,
                file("zones:\n  deploy:\n    display: header\n"),
            ),
            (
                ZoneSource::Global,
                file("zones:\n  deploy:\n    rows: 2\n    display: footer\n"),
            ),
        ]);
        assert_eq!(
            (zones[0].display, zones[0].source),
            (ZoneDisplay::Header, ZoneSource::Global)
        );
    }

    fn order(parent: Option<&str>, root: &str, is_remote: bool) -> String {
        zone_files(
            PathBuf::from("/p/web.yml"),
            parent.map(|name| PathBuf::from(format!("/p/{name}.yml"))),
            root,
            is_remote,
            PathBuf::from("/global.yml"),
        )
        .iter()
        .map(|(source, path)| format!("{source:?}:{}", path.display()))
        .collect::<Vec<_>>()
        .join(" > ")
    }

    #[test]
    fn a_local_project_reads_its_file_then_the_repo_then_global() {
        assert_eq!(
            order(None, "/w", false),
            "Project:/p/web.yml > Repo:/w/.lpm.yml > Global:/global.yml"
        );
    }

    #[test]
    fn a_duplicate_reads_its_parent_right_after_its_own_file() {
        assert_eq!(
            order(Some("base"), "/w", false),
            "Project:/p/web.yml > Project:/p/base.yml > Repo:/w/.lpm.yml > Global:/global.yml"
        );
    }

    #[test]
    fn a_remote_project_has_no_repo_file() {
        assert_eq!(
            order(None, "/srv/app", true),
            "Project:/p/web.yml > Global:/global.yml"
        );
        assert_eq!(
            order(Some("base"), "/srv/app", true),
            "Project:/p/web.yml > Project:/p/base.yml > Global:/global.yml"
        );
    }

    #[test]
    fn an_empty_root_has_no_repo_file() {
        assert_eq!(
            order(Some("base"), "", false),
            "Project:/p/web.yml > Project:/p/base.yml > Global:/global.yml"
        );
    }

    #[test]
    fn a_project_with_nothing_else_reads_its_file_and_global() {
        assert_eq!(
            order(None, "", false),
            "Project:/p/web.yml > Global:/global.yml"
        );
    }

    #[test]
    fn an_unknown_display_falls_through_to_the_next_file() {
        let zones = merge_files(&[
            (
                ZoneSource::Project,
                file("zones:\n  deploy:\n    rows: 1\n    display: sidebar\n"),
            ),
            (
                ZoneSource::Global,
                file("zones:\n  deploy:\n    display: footer\n"),
            ),
        ]);
        assert_eq!(zones[0].display, ZoneDisplay::Footer);
    }

    #[test]
    fn a_zone_without_layers_serializes_without_the_key() {
        let zones = merge_files(&[(ZoneSource::Project, file("zones:\n  build:\n    rows: 1\n"))]);
        let json = serde_json::to_value(&zones[0]).unwrap();
        assert!(json.get("layers").is_none());
    }

    #[test]
    fn slash_in_a_zone_name_is_ignored() {
        let zones = merge_files(&[(ZoneSource::Project, file("zones:\n  a/b:\n    rows: 1\n"))]);
        assert!(zones.is_empty());
    }
}
