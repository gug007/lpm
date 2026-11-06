// What a run is doing and where, for the views that show it. The check and the
// copy can take minutes, and until the run's own process exists it has no
// output to show.
use super::*;

const CHECK: &str = "check";
const COPY: &str = "copy";

fn steps() -> &'static Mutex<HashMap<String, &'static str>> {
    static STEPS: OnceLock<Mutex<HashMap<String, &'static str>>> = OnceLock::new();
    STEPS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// The step a run starts on, set before the run announces itself so that
/// announcement shows it.
pub(super) fn begin(key: &str, job: &JobResolved) {
    let copies = job.duplicate.enabled && !split_key(key).0.is_empty();
    let first = if job.check.is_empty() {
        copies.then_some(COPY)
    } else {
        Some(CHECK)
    };
    if let Some(step) = first {
        steps().lock().unwrap().insert(key.to_string(), step);
    }
}

/// The copy starting, announced only when a check came before it.
pub(super) fn copying(app: &AppHandle, key: &str) {
    if steps().lock().unwrap().insert(key.to_string(), COPY) != Some(COPY) {
        refresh_rows(app, key);
    }
}

pub(super) fn end(key: &str) {
    steps().lock().unwrap().remove(key);
}

/// Adds what a live run is up to onto the job's row.
pub(super) fn add_row_fields(row: &mut Value, key: &str, st: &JobState) {
    if running_since(key).is_none() {
        return;
    }
    if let Some(step) = steps().lock().unwrap().get(key) {
        row["runningStep"] = json!(step);
    }
    let Some(run) = &st.active_run else {
        return;
    };
    if let Some(copy) = &run.copy {
        row["runningIn"] = json!(copy);
        row["runningInName"] = json!(config::project_display_name(copy));
    }
    let project = split_key(key).0;
    if takeover::can_take_over(project, run) {
        row["takeOverIn"] = json!(project);
    }
}
