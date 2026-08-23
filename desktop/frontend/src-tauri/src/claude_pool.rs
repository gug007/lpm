// Balanced pool of Claude accounts for projects that don't pin one.
//
// Membership is the `pooled` flag on accounts.json entries. A project whose
// `claudeAccount` key is absent everywhere resolves through here: the spawn
// path `claim`s an account and persists the assignment, and every read path
// (transcripts, Resume, titles) sees the same assignment via `assigned`, so
// what lpm reads always matches what the terminal was actually launched under.
//
// Selection spends the account whose weekly window resets soonest relative to
// what it has left — score = remaining% / hours-to-reset — because quota left
// unspent at a reset is simply lost, and with staggered reset days this evens
// both accounts out against their own clocks. Accounts at >=99% of either
// window are skipped while that reset is still ahead. Without full quota data
// (the limits feed is opt-in and push-only) the pool falls back to fewest live
// agents, then plain alternation.
//
// Assignments are sticky while the project has live terminals, so an open
// conversation never has its transcript dir switched out from under it; an
// idle project re-evaluates on its next spawn, which is what rotates work off
// a walled or signed-out account. The state file is machine-local by design —
// account ids mean nothing on a peer Mac.

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

use crate::agent_limits::{LimitWindow, ProviderLimits};

const WALL_PERCENT: f64 = 99.0;

fn pool_path() -> PathBuf {
    crate::config::lpm_dir().join("claude-pool.json")
}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct PoolState {
    #[serde(default)]
    assignments: BTreeMap<String, Assignment>,
    #[serde(default)]
    last_account: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Assignment {
    account: String,
    assigned_at: i64,
}

fn load_state(path: &Path) -> PoolState {
    std::fs::read(path)
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

fn save_state(path: &Path, s: &PoolState) {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let Ok(data) = serde_json::to_vec_pretty(s) else {
        return;
    };
    let _ = crate::fsatomic::write(path, &data, crate::fsatomic::Mode::Preserve(0o644));
}

// ---- read side ---------------------------------------------------------------

type Stamp = Option<(SystemTime, u64)>;

fn stamp(path: &Path) -> Stamp {
    std::fs::metadata(path)
        .ok()
        .and_then(|m| Some((m.modified().ok()?, m.len())))
}

// mtime+len-gated caches: `assigned` sits on the polling paths (tab titles,
// session listings), which must stay at a stat per call rather than a full
// read+parse. Keyed on the stamp, not in-process writes, so a second lpm
// instance's writes are still picked up.
static ASSIGNMENTS: Mutex<Option<(Stamp, BTreeMap<String, String>)>> = Mutex::new(None);
static ACCOUNT_IDS: Mutex<Option<(Stamp, HashSet<String>)>> = Mutex::new(None);

fn cached_assignment(project: &str) -> Option<String> {
    let path = pool_path();
    let st = stamp(&path);
    let mut guard = ASSIGNMENTS.lock().unwrap();
    if let Some((cached, map)) = &*guard {
        if *cached == st {
            return map.get(project).cloned();
        }
    }
    let map: BTreeMap<String, String> = load_state(&path)
        .assignments
        .into_iter()
        .map(|(p, a)| (p, a.account))
        .collect();
    let out = map.get(project).cloned();
    *guard = Some((st, map));
    out
}

fn account_exists(id: &str) -> bool {
    let path = crate::config::accounts_path();
    let st = stamp(&path);
    let mut guard = ACCOUNT_IDS.lock().unwrap();
    if let Some((cached, ids)) = &*guard {
        if *cached == st {
            return ids.contains(id);
        }
    }
    let ids: HashSet<String> =
        crate::config::claude_account_ids(&crate::config::load_claude_accounts())
            .into_iter()
            .collect();
    let out = ids.contains(id);
    *guard = Some((st, ids));
    out
}

/// The persisted pool assignment for `project`, if that account still exists.
/// Pure read — this is what `effective_claude_account` falls through to, so
/// spawn, transcript resolution and session listings all agree. Validated
/// against the accounts list (not the pooled subset): a project whose account
/// was un-pooled mid-run must keep resolving it until an idle re-claim moves
/// it, or its open terminals' transcripts would vanish from every listing.
pub fn assigned(project: &str) -> Option<String> {
    let account = cached_assignment(project)?;
    account_exists(&account).then_some(account)
}

// ---- spawn side --------------------------------------------------------------

/// Spawn-time (re-)assignment for `project`; a no-op for pinned or remote
/// projects. `live_projects` is the live PTY session count per project.
pub fn claim(project: &str, live_projects: &HashMap<String, usize>) {
    if !crate::config::project_uses_pool(project) {
        return;
    }
    let accounts = crate::config::load_claude_accounts();
    let candidates: Vec<String> = pooled_ids(&accounts)
        .into_iter()
        .filter(|id| crate::config::account_signin_status(id).0)
        .collect();
    let existing: HashSet<String> = crate::config::project_names().into_iter().collect();
    let limits = crate::agent_limits::load_persisted();
    let now_s = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    claim_in(
        &pool_path(),
        project,
        live_projects,
        &candidates,
        &existing,
        &limits,
        now_s,
    );
}

fn pooled_ids(accounts: &serde_json::Value) -> Vec<String> {
    accounts
        .get("accounts")
        .and_then(serde_json::Value::as_array)
        .map(|list| {
            list.iter()
                .filter(|a| a.get("pooled").and_then(serde_json::Value::as_bool) == Some(true))
                .filter_map(|a| a.get("id").and_then(serde_json::Value::as_str))
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn claim_in(
    path: &Path,
    project: &str,
    live_projects: &HashMap<String, usize>,
    candidates: &[String],
    existing_projects: &HashSet<String>,
    limits: &HashMap<String, ProviderLimits>,
    now_s: i64,
) -> Option<String> {
    let mut state = load_state(path);
    let before = state.assignments.len();
    // Deleted projects would otherwise hold assignments (and skew the live
    // attribution) forever; pruning lazily here beats hooking every removal
    // path. The reserved global project has no YAML but is a valid holder.
    state.assignments.retain(|p, _| {
        p == project
            || p == crate::config::RESERVED_PROJECT_NAME
            || existing_projects.contains(p)
    });
    let pruned = state.assignments.len() != before;

    if candidates.is_empty() {
        let removed = state.assignments.remove(project).is_some();
        if removed || pruned {
            save_state(path, &state);
        }
        return None;
    }

    if let Some(a) = state.assignments.get(project) {
        let live_here = live_projects.get(project).copied().unwrap_or(0);
        if live_here > 0 && candidates.iter().any(|c| c == &a.account) {
            let account = a.account.clone();
            if pruned {
                save_state(path, &state);
            }
            return Some(account);
        }
    }

    let mut live_by_account: HashMap<&str, usize> = HashMap::new();
    for (p, a) in &state.assignments {
        if p != project {
            if let Some(n) = live_projects.get(p) {
                *live_by_account.entry(a.account.as_str()).or_default() += n;
            }
        }
    }
    let cands: Vec<Candidate> = candidates
        .iter()
        .map(|id| {
            let l = limits.get(&format!("claude:{id}"));
            Candidate {
                id: id.clone(),
                live: live_by_account.get(id.as_str()).copied().unwrap_or(0),
                five_hour: l.and_then(|l| l.five_hour.clone()),
                weekly: l.and_then(|l| l.weekly.clone()),
            }
        })
        .collect();
    let picked = select(&cands, &state.last_account, now_s)?.id.clone();
    state.assignments.insert(
        project.to_string(),
        Assignment {
            account: picked.clone(),
            assigned_at: now_s * 1000,
        },
    );
    state.last_account = picked.clone();
    save_state(path, &state);
    Some(picked)
}

/// Purge a removed account from assignments and the cursor, so nothing dangles
/// into a Scrub (silent main-login fallback) at the next resolve.
pub fn forget_account(id: &str) {
    forget_account_in(&pool_path(), id);
}

fn forget_account_in(path: &Path, id: &str) {
    let mut state = load_state(path);
    let before = state.assignments.len();
    state.assignments.retain(|_, a| a.account != id);
    let cursor_hit = state.last_account == id;
    if cursor_hit {
        state.last_account.clear();
    }
    if state.assignments.len() != before || cursor_hit {
        save_state(path, &state);
    }
}

// ---- selection ---------------------------------------------------------------

struct Candidate {
    id: String,
    live: usize,
    five_hour: Option<LimitWindow>,
    weekly: Option<LimitWindow>,
}

fn walled(w: &Option<LimitWindow>, now_s: i64) -> bool {
    w.as_ref()
        .is_some_and(|w| w.used_percent >= WALL_PERCENT && w.resets_at > now_s)
}

/// remaining% per hour until the weekly reset — the sustainable spend rate.
/// None when the window is missing or already reset (a reading from a previous
/// window says nothing about this one).
fn weekly_rate(c: &Candidate, now_s: i64) -> Option<f64> {
    let w = c.weekly.as_ref()?;
    if w.resets_at <= now_s {
        return None;
    }
    let hours = ((w.resets_at - now_s) as f64 / 3600.0).max(0.01);
    Some((100.0 - w.used_percent).max(0.0) / hours)
}

fn select<'a>(cands: &'a [Candidate], last: &str, now_s: i64) -> Option<&'a Candidate> {
    if cands.is_empty() {
        return None;
    }
    let open: Vec<&Candidate> = cands
        .iter()
        .filter(|c| !walled(&c.five_hour, now_s) && !walled(&c.weekly, now_s))
        .collect();
    // Every candidate walled: still assign (among all) rather than refusing to
    // spawn — the terminal must open even if the agent inside it has to wait.
    let pool = if open.is_empty() {
        cands.iter().collect::<Vec<_>>()
    } else {
        open
    };
    // The rate score only ranks when every contender reports a live weekly
    // window; with mixed data it would systematically dodge whichever account
    // happens to have reported.
    let rates: Option<Vec<f64>> = pool.iter().map(|c| weekly_rate(c, now_s)).collect();
    let contenders = match rates {
        Some(rates) => {
            let max = rates.iter().cloned().fold(f64::MIN, f64::max);
            pool.into_iter()
                .zip(rates)
                .filter(|(_, r)| max - r < 1e-9)
                .map(|(c, _)| c)
                .collect::<Vec<_>>()
        }
        None => pool,
    };
    let min_live = contenders.iter().map(|c| c.live).min().unwrap();
    let tied: Vec<&Candidate> = contenders
        .into_iter()
        .filter(|c| c.live == min_live)
        .collect();
    Some(next_after(&tied, last))
}

/// Cursor step: the tied candidate after the last-used account, wrapping, so
/// score/load ties alternate instead of piling onto one account.
fn next_after<'a>(tied: &[&'a Candidate], last: &str) -> &'a Candidate {
    match tied.iter().position(|c| c.id == last) {
        Some(i) => tied[(i + 1) % tied.len()],
        None => tied[0],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn win(used: f64, resets_at: i64) -> Option<LimitWindow> {
        Some(LimitWindow {
            used_percent: used,
            resets_at,
        })
    }

    fn limits(
        entries: &[(&str, Option<LimitWindow>, Option<LimitWindow>)],
    ) -> HashMap<String, ProviderLimits> {
        entries
            .iter()
            .map(|(id, five, weekly)| {
                (
                    format!("claude:{id}"),
                    ProviderLimits {
                        provider: "claude".into(),
                        account_id: Some(id.to_string()),
                        five_hour: five.clone(),
                        weekly: weekly.clone(),
                        ..Default::default()
                    },
                )
            })
            .collect()
    }

    fn ids(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    const NOW: i64 = 1_000_000;
    const H: i64 = 3600;

    fn claim_at(
        path: &Path,
        project: &str,
        live: &[(&str, usize)],
        candidates: &[&str],
        existing: &[&str],
        lim: &HashMap<String, ProviderLimits>,
    ) -> Option<String> {
        let live: HashMap<String, usize> =
            live.iter().map(|(p, n)| (p.to_string(), *n)).collect();
        let existing: HashSet<String> = existing.iter().map(|s| s.to_string()).collect();
        claim_in(path, project, &live, &ids(candidates), &existing, lim, NOW)
    }

    #[test]
    fn staggered_weekly_prefers_sooner_reset() {
        // A: 70% used, resets in 18h -> 30/18 = 1.67%/h spendable.
        // B: 45% used, resets in 66h -> 55/66 = 0.83%/h.
        // A's remaining quota expires first; unspent = lost, so spend A.
        let lim = limits(&[
            ("a", None, win(70.0, NOW + 18 * H)),
            ("b", None, win(45.0, NOW + 66 * H)),
        ]);
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("pool.json");
        assert_eq!(
            claim_at(&path, "p1", &[], &["a", "b"], &["p1"], &lim),
            Some("a".into())
        );
    }

    #[test]
    fn five_hour_wall_skips_account() {
        let lim = limits(&[
            ("a", win(99.5, NOW + 2 * H), win(70.0, NOW + 18 * H)),
            ("b", None, win(45.0, NOW + 66 * H)),
        ]);
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("pool.json");
        assert_eq!(
            claim_at(&path, "p1", &[], &["a", "b"], &["p1"], &lim),
            Some("b".into())
        );
    }

    #[test]
    fn expired_wall_reading_does_not_skip() {
        // A walled reading whose reset is already behind us is from a previous
        // window and says nothing about this one.
        let lim = limits(&[
            ("a", win(99.5, NOW - H), win(70.0, NOW + 18 * H)),
            ("b", None, win(45.0, NOW + 66 * H)),
        ]);
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("pool.json");
        assert_eq!(
            claim_at(&path, "p1", &[], &["a", "b"], &["p1"], &lim),
            Some("a".into())
        );
    }

    #[test]
    fn all_walled_still_assigns() {
        let lim = limits(&[
            ("a", win(100.0, NOW + H), win(70.0, NOW + 18 * H)),
            ("b", win(99.0, NOW + H), win(45.0, NOW + 66 * H)),
        ]);
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("pool.json");
        assert!(claim_at(&path, "p1", &[], &["a", "b"], &["p1"], &lim).is_some());
    }

    #[test]
    fn sticky_while_project_has_live_sessions() {
        let lim = limits(&[
            ("a", None, win(10.0, NOW + 18 * H)),
            ("b", None, win(90.0, NOW + 66 * H)),
        ]);
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("pool.json");
        assert_eq!(
            claim_at(&path, "p1", &[], &["a", "b"], &["p1"], &lim),
            Some("a".into())
        );
        // A second terminal while the first is live stays on "a" even though a
        // fresh evaluation would also pick "a"; force the contrast by walling it.
        let walled = limits(&[
            ("a", win(100.0, NOW + H), win(10.0, NOW + 18 * H)),
            ("b", None, win(90.0, NOW + 66 * H)),
        ]);
        assert_eq!(
            claim_at(&path, "p1", &[("p1", 1)], &["a", "b"], &["p1"], &walled),
            Some("a".into())
        );
        // Idle again: the wall now moves the project.
        assert_eq!(
            claim_at(&path, "p1", &[], &["a", "b"], &["p1"], &walled),
            Some("b".into())
        );
    }

    #[test]
    fn no_quota_data_alternates() {
        let lim = HashMap::new();
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("pool.json");
        let projects = ["p1", "p2", "p3"];
        let existing = ["p1", "p2", "p3"];
        let got: Vec<String> = projects
            .iter()
            .filter_map(|p| claim_at(&path, p, &[], &["a", "b"], &existing, &lim))
            .collect();
        assert_eq!(got, vec!["a", "b", "a"]);
    }

    #[test]
    fn live_load_beats_cursor() {
        let lim = HashMap::new();
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("pool.json");
        let existing = ["p1", "p2"];
        assert_eq!(
            claim_at(&path, "p1", &[], &["a", "b"], &existing, &lim),
            Some("a".into())
        );
        // p1 now runs 3 agents on "a"; a fresh project must land on "b" even
        // though plain alternation from lastAccount="a" would also say "b" —
        // check the load path by making the cursor argue for "a".
        let mut state = load_state(&path);
        state.last_account = "b".into();
        save_state(&path, &state);
        assert_eq!(
            claim_at(&path, "p2", &[("p1", 3)], &["a", "b"], &existing, &lim),
            Some("b".into())
        );
    }

    #[test]
    fn no_candidates_clears_assignment() {
        let lim = HashMap::new();
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("pool.json");
        claim_at(&path, "p1", &[], &["a"], &["p1"], &lim);
        assert_eq!(claim_at(&path, "p1", &[], &[], &["p1"], &lim), None);
        assert!(load_state(&path).assignments.is_empty());
    }

    #[test]
    fn dead_projects_pruned_on_claim() {
        let lim = HashMap::new();
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("pool.json");
        claim_at(&path, "gone", &[], &["a"], &["gone"], &lim);
        claim_at(&path, "p1", &[], &["a"], &["p1"], &lim);
        let state = load_state(&path);
        assert!(state.assignments.contains_key("p1"));
        assert!(!state.assignments.contains_key("gone"));
    }

    #[test]
    fn forget_account_purges_assignments_and_cursor() {
        let lim = HashMap::new();
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("pool.json");
        claim_at(&path, "p1", &[], &["a"], &["p1"], &lim);
        forget_account_in(&path, "a");
        let state = load_state(&path);
        assert!(state.assignments.is_empty());
        assert!(state.last_account.is_empty());
    }

    #[test]
    fn pooled_ids_reads_flag() {
        let v = serde_json::json!({"accounts": [
            {"id": "a", "label": "A", "pooled": true},
            {"id": "b", "label": "B"},
            {"id": "c", "label": "C", "pooled": false},
        ]});
        assert_eq!(pooled_ids(&v), vec!["a".to_string()]);
    }
}
