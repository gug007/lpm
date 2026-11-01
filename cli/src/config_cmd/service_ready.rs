use super::{Mapping, Report, Value};
use crate::ready::ReadySpec;

pub(super) fn validate_ready(map: &Mapping, path: &str, report: &mut Report) {
    let Some(value) = map.get(Value::String("ready".into())) else {
        return;
    };
    let field = format!("{path}.ready");
    let port = map
        .get(Value::String("port".into()))
        .and_then(Value::as_i64)
        .unwrap_or(0);
    let resolved = serde_norway::from_value::<ReadySpec>(value.clone())
        .map_err(|e| e.to_string())
        .and_then(|spec| spec.resolve(port));
    if let Err(error) = resolved {
        report.error(&field, error);
    }
}
