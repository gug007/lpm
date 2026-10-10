// Splitting a config sync into WebSocket-sized messages. A pull or a push used to
// travel as one message, and tungstenite refuses any frame over 16 MiB, so a big
// enough sync dropped the connection and failed the same way on every retry.
// The client splits its pushes here; the host caps each fetch reply and names what
// it left out under `more`, which the client asks for next. See PEER_PROTOCOL.md.
use serde_json::{json, Value};

/// Serialized item bytes per message, well under the receiver's 16 MiB frame limit.
const BATCH_BYTES: usize = 4 << 20;
/// An item bigger than this can't be sent at all, so it is reported instead of
/// taking the connection down. Leaves room for the frame's own envelope.
const MAX_ITEM_BYTES: usize = 12 << 20;

/// Split items, given their serialized sizes, into consecutive batches of indices:
/// none empty, none over the budget unless one item alone is. Also returns the
/// indices of items too large to send.
pub fn group(sizes: &[usize]) -> (Vec<Vec<usize>>, Vec<usize>) {
    group_with(sizes, BATCH_BYTES, MAX_ITEM_BYTES)
}

fn group_with(sizes: &[usize], budget: usize, max_item: usize) -> (Vec<Vec<usize>>, Vec<usize>) {
    let mut batches: Vec<Vec<usize>> = Vec::new();
    let mut too_large = Vec::new();
    let mut used = 0;
    for (i, &size) in sizes.iter().enumerate() {
        if size > max_item {
            too_large.push(i);
            continue;
        }
        match batches.last_mut() {
            Some(batch) if used + size <= budget => batch.push(i),
            _ => {
                batches.push(vec![i]);
                used = 0;
            }
        }
        used += size;
    }
    (batches, too_large)
}

pub fn too_large_error(label: &str, size: usize) -> String {
    format!("{label}: too large to sync ({} MB)", size >> 20)
}

/// The host's reply to one `syncFetch`: the requested items that fit one message,
/// the rest under `more` in request order, and an error for each item too large to
/// send. An unreadable item is skipped, as before. An older client ignores `more`
/// and gets the rest on later runs, as each part it applied stops differing.
pub fn fetch_reply(requested: &[Value]) -> Value {
    fetch_reply_with(
        requested,
        |kind, name| {
            crate::peersync::read_item(kind, name)
                .ok()
                .and_then(|w| serde_json::to_value(w).ok())
        },
        BATCH_BYTES,
        MAX_ITEM_BYTES,
    )
}

fn fetch_reply_with(
    requested: &[Value],
    read: impl Fn(&str, &str) -> Option<Value>,
    budget: usize,
    max_item: usize,
) -> Value {
    let found: Vec<(&Value, Value)> = requested
        .iter()
        .filter_map(|req| {
            let field = |k: &str| req.get(k).and_then(Value::as_str).unwrap_or_default();
            read(field("kind"), field("name")).map(|item| (req, item))
        })
        .collect();
    let sizes: Vec<usize> = found
        .iter()
        .map(|(_, item)| item.to_string().len())
        .collect();
    let (batches, too_large) = group_with(&sizes, budget, max_item);
    let mut batches = batches.into_iter();
    let items: Vec<Value> = batches
        .next()
        .unwrap_or_default()
        .into_iter()
        .map(|i| found[i].1.clone())
        .collect();
    let more: Vec<Value> = batches.flatten().map(|i| found[i].0.clone()).collect();
    let errors: Vec<String> = too_large
        .into_iter()
        .map(|i| too_large_error(&label(found[i].0), sizes[i]))
        .collect();
    json!({ "items": items, "more": more, "errors": errors })
}

fn label(req: &Value) -> String {
    let field = |k: &str| req.get(k).and_then(Value::as_str).unwrap_or_default();
    format!("{}/{}", field("kind"), field("name"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn small_items_share_one_batch() {
        let (batches, too_large) = group_with(&[10, 20, 30], 100, 200);
        assert_eq!(batches, vec![vec![0, 1, 2]]);
        assert!(too_large.is_empty());
    }

    #[test]
    fn a_batch_closes_before_it_would_pass_the_budget() {
        let (batches, _) = group_with(&[60, 30, 20, 100, 5], 100, 200);
        assert_eq!(batches, vec![vec![0, 1], vec![2], vec![3], vec![4]]);
    }

    #[test]
    fn an_item_over_the_budget_travels_alone() {
        let (batches, too_large) = group_with(&[10, 150, 10], 100, 200);
        assert_eq!(batches, vec![vec![0], vec![1], vec![2]]);
        assert!(too_large.is_empty());
    }

    #[test]
    fn an_item_over_the_limit_is_left_out_without_splitting_its_neighbours() {
        let (batches, too_large) = group_with(&[10, 500, 20], 100, 200);
        assert_eq!(batches, vec![vec![0, 2]]);
        assert_eq!(too_large, vec![1]);
    }

    #[test]
    fn nothing_to_send_is_no_batches() {
        assert_eq!(group_with(&[], 100, 200), (Vec::new(), Vec::new()));
    }

    #[test]
    fn the_real_limits_stay_under_the_frame_limit() {
        let frame_limit = 16 << 20;
        assert!(BATCH_BYTES < frame_limit && MAX_ITEM_BYTES < frame_limit);
        assert!(BATCH_BYTES <= MAX_ITEM_BYTES);
    }

    fn req(name: &str) -> Value {
        json!({ "kind": "global", "name": name })
    }

    fn read_fake(_kind: &str, name: &str) -> Option<Value> {
        let size = match name {
            "missing" => return None,
            "huge" => 500,
            _ => 40,
        };
        Some(json!({ "name": name, "content": "x".repeat(size) }))
    }

    fn names(v: &Value, key: &str) -> Vec<String> {
        v[key]
            .as_array()
            .unwrap()
            .iter()
            .map(|x| x["name"].as_str().unwrap().to_string())
            .collect()
    }

    #[test]
    fn a_fetch_reply_sends_what_fits_and_defers_the_rest_in_order() {
        let requested = [req("a"), req("b"), req("c"), req("d")];
        let reply = fetch_reply_with(&requested, read_fake, 150, 400);
        assert_eq!(names(&reply, "items"), ["a", "b"]);
        assert_eq!(names(&reply, "more"), ["c", "d"]);
        // Deferred entries are the original requests, ready to send back as-is.
        assert_eq!(reply["more"][0], req("c"));
        assert!(reply["errors"].as_array().unwrap().is_empty());
    }

    #[test]
    fn a_fetch_reply_reports_an_oversized_item_and_skips_an_unreadable_one() {
        let requested = [req("a"), req("huge"), req("missing"), req("b")];
        let reply = fetch_reply_with(&requested, read_fake, 1000, 400);
        assert_eq!(names(&reply, "items"), ["a", "b"]);
        assert!(names(&reply, "more").is_empty());
        let errors = reply["errors"].as_array().unwrap();
        assert_eq!(errors.len(), 1);
        assert!(errors[0]
            .as_str()
            .unwrap()
            .starts_with("global/huge: too large"));
    }
}
