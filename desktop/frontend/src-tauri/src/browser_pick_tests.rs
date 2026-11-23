use super::*;

fn answer(payload: serde_json::Value) -> String {
    serde_json::to_string(&payload.to_string()).unwrap()
}

fn element() -> serde_json::Value {
    serde_json::json!({
        "kind": "element",
        "url": "http://localhost:3000/pricing",
        "title": "Pricing",
        "tag": "button",
        "selector": "main > button.plan-cta",
        "text": "Choose Team",
        "html": "<button class=\"plan-cta\">",
        "component": { "framework": "React", "names": ["PlanCard", "PricingPage"], "file": "src/PlanCard.tsx", "line": 42 },
        "rect": { "x": 100.0, "y": 200.0, "width": 180.0, "height": 32.0 },
        "viewport": { "width": 1280.0, "height": 800.0, "scrollX": 0.0, "scrollY": 300.0 },
    })
}

fn picked(raw: &str) -> BrowserPick {
    match read_answer(raw) {
        Answer::Picked(pick) => *pick,
        other => panic!("expected a pick, got {other:?}"),
    }
}

#[test]
fn nothing_yet_reads_as_waiting_on_both_engines() {
    assert_eq!(read_answer(""), Answer::Waiting);
    assert_eq!(read_answer("null"), Answer::Waiting);
    assert_eq!(read_answer("  "), Answer::Waiting);
}

#[test]
fn a_page_without_the_picker_reads_as_gone() {
    assert_eq!(read_answer("\"gone\""), Answer::Gone);
}

#[test]
fn escape_reads_as_cancelled() {
    assert_eq!(
        read_answer(&answer(serde_json::json!({ "cancel": true }))),
        Answer::Cancelled
    );
}

#[test]
fn an_element_pick_comes_through() {
    let pick = picked(&answer(element()));
    assert_eq!(pick.kind, PickKind::Element);
    assert_eq!(pick.url, "http://localhost:3000/pricing");
    assert_eq!(pick.selector.as_deref(), Some("main > button.plan-cta"));
    let component = pick.component.unwrap();
    assert_eq!(component.names, vec!["PlanCard", "PricingPage"]);
    assert_eq!(component.line, Some(42));
    assert_eq!(pick.viewport.scroll_y, 300.0);
}

#[test]
fn an_area_pick_needs_no_element_fields() {
    let pick = picked(&answer(serde_json::json!({
        "kind": "area",
        "url": "http://localhost:3000/",
        "rect": { "x": 10.0, "y": 10.0, "width": 300.0, "height": 120.0 },
        "viewport": { "width": 1280.0, "height": 800.0 },
    })));
    assert_eq!(pick.kind, PickKind::Area);
    assert_eq!(pick.tag, None);
    assert_eq!(pick.viewport.scroll_x, 0.0);
}

#[test]
fn the_page_cannot_supply_the_picture() {
    let mut forged = element();
    forged["image"] = serde_json::json!("iVBORforged");
    assert_eq!(picked(&answer(forged)).image, None);
}

#[test]
fn long_page_text_is_cut_and_blank_text_dropped() {
    let mut long = element();
    long["text"] = serde_json::json!("x".repeat(500));
    long["html"] = serde_json::json!("   ");
    long["component"]["names"] = serde_json::json!(["A", "B", "C", "D", "E"]);
    let pick = picked(&answer(long));
    assert_eq!(pick.text.unwrap().chars().count(), 161);
    assert_eq!(pick.html, None);
    assert_eq!(pick.component.unwrap().names.len(), 3);
}

#[test]
fn malformed_or_oversized_answers_end_the_pick() {
    assert_eq!(
        read_answer(&answer(serde_json::json!({ "kind": "element" }))),
        Answer::Cancelled
    );
    let mut bad = element();
    bad["rect"]["width"] = serde_json::json!(-5.0);
    assert_eq!(read_answer(&answer(bad)), Answer::Cancelled);
    let huge = serde_json::to_string(&"x".repeat(MAX_ANSWER + 1)).unwrap();
    assert_eq!(read_answer(&huge), Answer::Cancelled);
}

#[test]
fn the_picture_is_padded_and_kept_on_screen() {
    let pick = picked(&answer(element()));
    let clip = clip_for(&pick).unwrap();
    assert_eq!(
        (clip.x, clip.y, clip.width, clip.height),
        (94.0, 194.0, 192.0, 44.0)
    );
    assert_eq!(clip.scroll_y, 300.0);

    let mut edge = element();
    edge["rect"] = serde_json::json!({ "x": -50.0, "y": 780.0, "width": 200.0, "height": 100.0 });
    let clip = clip_for(&picked(&answer(edge))).unwrap();
    assert_eq!(
        (clip.x, clip.y, clip.width, clip.height),
        (0.0, 774.0, 156.0, 26.0)
    );

    let mut off = element();
    off["rect"] = serde_json::json!({ "x": 2000.0, "y": 10.0, "width": 50.0, "height": 50.0 });
    assert!(clip_for(&picked(&answer(off))).is_none());
}

#[test]
fn a_new_pick_on_a_tab_ends_the_one_before() {
    let first = begin("tab-test");
    let second = begin("tab-test");
    assert!(first.load(Ordering::Relaxed));
    assert!(!second.load(Ordering::Relaxed));
    end("tab-test", &first);
    cancel_pick("tab-test");
    assert!(second.load(Ordering::Relaxed));
}

#[test]
fn the_key_lands_in_the_script_as_a_string() {
    let key = serde_json::to_string("__lpmPick_abc").unwrap();
    let script = SCRIPT.replace(KEY_SLOT, &key);
    assert!(script.contains("const KEY = \"__lpmPick_abc\";"));
    assert!(!script.contains(KEY_SLOT));
}
