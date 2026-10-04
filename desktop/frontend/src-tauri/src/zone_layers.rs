//! Zone layers: named sub-groups a zone declares under `layers:`. Like zones,
//! a layer is placement only; each field falls back file by file.

use std::collections::{BTreeMap, BTreeSet};

use serde::Serialize;
use serde_norway::Value as Yaml;

use crate::config::sorted_by_position;

#[derive(Clone, Debug, Default)]
pub(crate) struct LayerEntry {
    label: Option<String>,
    position: Option<f64>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct LayerInfo {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position: Option<f64>,
}

pub(crate) fn layers_of(value: &Yaml) -> BTreeMap<String, LayerEntry> {
    let Some(layers) = value.get("layers").and_then(Yaml::as_mapping) else {
        return BTreeMap::new();
    };
    layers
        .iter()
        .filter_map(|(key, layer)| {
            let name = key.as_str()?;
            if name.is_empty() || name.contains([':', '/']) {
                return None;
            }
            let entry = LayerEntry {
                label: layer
                    .get("label")
                    .and_then(Yaml::as_str)
                    .map(str::to_string),
                position: layer.get("position").and_then(Yaml::as_f64),
            };
            Some((name.to_string(), entry))
        })
        .collect()
}

/// Declarations come highest precedence first.
pub(crate) fn merge_zone_layers(declared: &[&BTreeMap<String, LayerEntry>]) -> Vec<LayerInfo> {
    let keys: BTreeSet<&String> = declared.iter().flat_map(|layers| layers.keys()).collect();
    let layers: BTreeMap<String, LayerInfo> = keys
        .into_iter()
        .map(|key| {
            let entries: Vec<&LayerEntry> = declared
                .iter()
                .filter_map(|layers| layers.get(key))
                .collect();
            let info = LayerInfo {
                name: key.clone(),
                label: entries
                    .iter()
                    .find_map(|layer| layer.label.clone().filter(|label| !label.is_empty())),
                position: entries.iter().find_map(|layer| layer.position),
            };
            (key.clone(), info)
        })
        .collect();
    sorted_by_position(layers, |layer| layer.position)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(yaml: &str) -> BTreeMap<String, LayerEntry> {
        layers_of(&serde_norway::from_str(yaml).unwrap())
    }

    #[test]
    fn layers_merge_per_key_field_by_field() {
        let high = file("layers:\n  web:\n    position: 1\n");
        let low = file("layers:\n  mobile:\n    label: Mobile\n    position: 2\n  web:\n    label: Web\n    position: 5\n");
        assert_eq!(
            merge_zone_layers(&[&high, &low]),
            vec![
                LayerInfo {
                    name: "web".into(),
                    label: Some("Web".into()),
                    position: Some(1.0)
                },
                LayerInfo {
                    name: "mobile".into(),
                    label: Some("Mobile".into()),
                    position: Some(2.0)
                },
            ]
        );
    }

    #[test]
    fn an_empty_label_falls_through_to_the_next_file() {
        let high = file("layers:\n  web:\n    label: \"\"\n");
        let low = file("layers:\n  web:\n    label: Web\n");
        let merged = merge_zone_layers(&[&high, &low]);
        assert_eq!(merged[0].label.as_deref(), Some("Web"));
    }

    #[test]
    fn layers_sort_by_position_then_key_and_skip_bad_keys() {
        let layers =
            file("layers:\n  b: {}\n  a: {}\n  c:\n    position: 1\n  x/y: {}\n  p:q: {}\n");
        let merged = merge_zone_layers(&[&layers]);
        let names: Vec<&str> = merged.iter().map(|l| l.name.as_str()).collect();
        assert_eq!(names, vec!["c", "a", "b"]);
    }

    #[test]
    fn a_layer_serializes_name_label_and_position() {
        let layer = LayerInfo {
            name: "web".into(),
            label: None,
            position: Some(2.0),
        };
        assert_eq!(
            serde_json::to_value(&layer).unwrap(),
            serde_json::json!({ "name": "web", "position": 2.0 })
        );
    }
}
