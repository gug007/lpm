// Which services of a start wait for their dependencies to be ready, and when
// each one goes. Pure: readiness.rs feeds it probe results and acts on what it
// returns, so the ordering rules are testable without panes or sockets.
//
// A service waits while any service it depends on is still waiting, or has a
// ready check that hasn't passed. A check that times out (or a dependency that
// exits first) releases its dependents anyway, so a start can never hang: they
// launch as they would have without the check, and the late service is shown
// as not ready until it passes.
use crate::readyspec::ReadyCheck;
use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant};

/// How long a check that timed out keeps being probed, so its "not ready"
/// clears once the service does come up. After that it stays "not ready"
/// until the service restarts.
pub const LATE_LIMIT: Duration = Duration::from_secs(600);

#[derive(Clone, Debug)]
pub struct Node {
    pub name: String,
    pub deps: Vec<String>,
    pub check: Option<ReadyCheck>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ProbeResult {
    Pass,
    Wait,
    /// The service's command ended before its check passed.
    Ended,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Phase {
    /// Not launched: these dependencies aren't ready yet.
    Waiting(Vec<String>),
    /// Launched; its ready check hasn't passed.
    Starting,
    /// Its check timed out; dependents went ahead.
    NotReady(String),
}

#[derive(Clone, Debug, PartialEq)]
enum State {
    Pending,
    Checking(Instant),
    Ready,
    Late(Instant, String),
    /// Still not ready after LATE_LIMIT: no longer probed, still shown.
    GaveUp(String),
    Released,
}

pub struct Plan {
    nodes: Vec<Node>,
    states: HashMap<String, State>,
}

#[derive(Debug, Default, PartialEq)]
pub struct Step {
    pub launch: Vec<String>,
    pub changed: bool,
    pub done: bool,
}

impl Plan {
    /// `batch` is the start's services in dependency order; `running` the ones
    /// already up, whose checks still gate a dependent being added beside them.
    /// None when no check is involved, which leaves the start exactly as it was.
    pub fn new(
        batch: &[String],
        running: &[String],
        deps_of: impl Fn(&str) -> Vec<String>,
        check_of: impl Fn(&str) -> Option<ReadyCheck>,
        now: Instant,
    ) -> Option<Plan> {
        let in_batch: HashSet<&str> = batch.iter().map(String::as_str).collect();
        let mut nodes = Vec::new();
        let mut states = HashMap::new();
        let mut seen = HashSet::new();
        for name in batch {
            for dep in deps_of(name) {
                let outside = !in_batch.contains(dep.as_str()) && running.contains(&dep);
                if outside && seen.insert(dep.clone()) {
                    if let Some(check) = check_of(&dep) {
                        states.insert(dep.clone(), State::Checking(now));
                        nodes.push(Node {
                            deps: Vec::new(),
                            name: dep,
                            check: Some(check),
                        });
                    }
                }
            }
        }
        if nodes.is_empty() && batch.iter().all(|name| check_of(name).is_none()) {
            return None;
        }
        let gated: HashSet<String> = nodes.iter().map(|n| n.name.clone()).collect();
        let mut deferred: HashSet<String> = HashSet::new();
        for name in batch {
            let deps = deps_of(name);
            let check = check_of(name);
            let waits = deps.iter().any(|d| {
                gated.contains(d)
                    || deferred.contains(d)
                    || (in_batch.contains(d.as_str()) && check_of(d).is_some())
            });
            let state = if waits {
                deferred.insert(name.clone());
                State::Pending
            } else if check.is_some() {
                State::Checking(now)
            } else {
                State::Ready
            };
            if seen.insert(name.clone()) {
                states.insert(name.clone(), state);
                nodes.push(Node {
                    name: name.clone(),
                    deps,
                    check,
                });
            }
        }
        Some(Plan { nodes, states })
    }

    /// Services whose pane opens idle, to have their line typed in once their
    /// dependencies are ready.
    pub fn deferred(&self) -> HashSet<String> {
        self.states
            .iter()
            .filter(|(_, s)| **s == State::Pending)
            .map(|(n, _)| n.clone())
            .collect()
    }

    pub fn names(&self) -> Vec<String> {
        self.nodes.iter().map(|n| n.name.clone()).collect()
    }

    /// Nodes whose check should be probed this tick.
    pub fn probing(&self) -> Vec<&Node> {
        self.nodes
            .iter()
            .filter(|n| {
                matches!(
                    self.states.get(&n.name),
                    Some(State::Checking(_) | State::Late(..))
                )
            })
            .collect()
    }

    /// Every check still probed has already timed out, so probing can slow.
    pub fn only_late(&self) -> bool {
        let mut probing = self
            .states
            .values()
            .filter(|s| matches!(s, State::Checking(_) | State::Late(..)));
        probing.clone().next().is_some() && probing.all(|s| matches!(s, State::Late(..)))
    }

    fn released(&self, name: &str) -> bool {
        !matches!(
            self.states.get(name),
            Some(State::Pending | State::Checking(_))
        )
    }

    pub fn step(&mut self, now: Instant, results: &HashMap<String, ProbeResult>) -> Step {
        let mut step = Step::default();
        for node in &self.nodes {
            let Some(state) = self.states.get(&node.name).cloned() else {
                continue;
            };
            let result = results
                .get(&node.name)
                .copied()
                .unwrap_or(ProbeResult::Wait);
            let next = match (&state, result) {
                (State::Checking(_) | State::Late(..), ProbeResult::Pass) => State::Ready,
                (State::Checking(_) | State::Late(..), ProbeResult::Ended) => State::Released,
                (State::Checking(since), ProbeResult::Wait) => {
                    let timeout = node.check.as_ref().map(|c| c.timeout).unwrap_or_default();
                    if now.duration_since(*since) >= timeout {
                        State::Late(*since, format!("Not ready after {}s", timeout.as_secs()))
                    } else {
                        state.clone()
                    }
                }
                (State::Late(since, reason), ProbeResult::Wait) => {
                    let timeout = node.check.as_ref().map(|c| c.timeout).unwrap_or_default();
                    if now.duration_since(*since) >= timeout + LATE_LIMIT {
                        State::GaveUp(reason.clone())
                    } else {
                        state.clone()
                    }
                }
                _ => state.clone(),
            };
            if next != state {
                step.changed = true;
                self.states.insert(node.name.clone(), next);
            }
        }
        for i in 0..self.nodes.len() {
            let node = &self.nodes[i];
            if self.states.get(&node.name) != Some(&State::Pending) {
                continue;
            }
            if node.deps.iter().all(|d| self.released(d)) {
                let next = if node.check.is_some() {
                    State::Checking(now)
                } else {
                    State::Ready
                };
                let name = node.name.clone();
                self.states.insert(name.clone(), next);
                step.launch.push(name);
                step.changed = true;
            }
        }
        step.done = self
            .states
            .values()
            .all(|s| matches!(s, State::Ready | State::Released | State::GaveUp(_)));
        step
    }

    /// What each service still in play shows; ready ones are absent.
    pub fn phases(&self) -> HashMap<String, Phase> {
        let mut out = HashMap::new();
        for node in &self.nodes {
            let phase = match self.states.get(&node.name) {
                Some(State::Pending) => Phase::Waiting(
                    node.deps
                        .iter()
                        .filter(|d| !self.released(d))
                        .cloned()
                        .collect(),
                ),
                Some(State::Checking(_)) => Phase::Starting,
                Some(State::Late(_, reason) | State::GaveUp(reason)) => {
                    Phase::NotReady(reason.clone())
                }
                _ => continue,
            };
            out.insert(node.name.clone(), phase);
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::readyspec::Probe;

    fn check(secs: u64) -> Option<ReadyCheck> {
        Some(ReadyCheck {
            probe: Probe::Port(4000),
            timeout: Duration::from_secs(secs),
        })
    }

    fn names(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    // db <- api (ready: 30s) <- web, worker independent.
    fn plan(now: Instant) -> Plan {
        Plan::new(
            &names(&["db", "api", "web", "worker"]),
            &[],
            |n| match n {
                "api" => names(&["db"]),
                "web" => names(&["api"]),
                _ => Vec::new(),
            },
            |n| if n == "api" { check(30) } else { None },
            now,
        )
        .unwrap()
    }

    fn results(list: &[(&str, ProbeResult)]) -> HashMap<String, ProbeResult> {
        list.iter().map(|(n, r)| (n.to_string(), *r)).collect()
    }

    #[test]
    fn no_checks_means_no_plan() {
        let plan = Plan::new(
            &names(&["db", "web"]),
            &[],
            |n| if n == "web" { names(&["db"]) } else { vec![] },
            |_| None,
            Instant::now(),
        );
        assert!(plan.is_none());
    }

    #[test]
    fn only_dependents_of_a_checked_service_wait() {
        let plan = plan(Instant::now());
        assert_eq!(plan.deferred(), ["web".to_string()].into_iter().collect());
        let phases = plan.phases();
        assert_eq!(phases.get("api"), Some(&Phase::Starting));
        assert_eq!(phases.get("web"), Some(&Phase::Waiting(names(&["api"]))));
        assert!(!phases.contains_key("worker"));
    }

    #[test]
    fn a_passing_check_launches_its_dependents() {
        let now = Instant::now();
        let mut plan = plan(now);
        let step = plan.step(now, &results(&[("api", ProbeResult::Wait)]));
        assert!(step.launch.is_empty() && !step.done);
        let step = plan.step(now, &results(&[("api", ProbeResult::Pass)]));
        assert_eq!(step.launch, names(&["web"]));
        assert!(step.done && plan.phases().is_empty());
    }

    #[test]
    fn a_timeout_releases_dependents_and_keeps_probing() {
        let now = Instant::now();
        let mut plan = plan(now);
        let late = now + Duration::from_secs(31);
        let step = plan.step(late, &results(&[("api", ProbeResult::Wait)]));
        assert_eq!(step.launch, names(&["web"]));
        assert!(!step.done);
        assert_eq!(
            plan.phases().get("api"),
            Some(&Phase::NotReady("Not ready after 30s".into()))
        );
        assert_eq!(plan.probing().len(), 1);
        let step = plan.step(late, &results(&[("api", ProbeResult::Pass)]));
        assert!(step.done && step.changed);
    }

    #[test]
    fn late_probing_gives_up_eventually() {
        let now = Instant::now();
        let mut plan = plan(now);
        plan.step(now + Duration::from_secs(31), &HashMap::new());
        assert!(plan.only_late());
        let step = plan.step(now + Duration::from_secs(30) + LATE_LIMIT, &HashMap::new());
        assert!(step.done);
        assert!(plan.probing().is_empty());
        assert_eq!(
            plan.phases().get("api"),
            Some(&Phase::NotReady("Not ready after 30s".into()))
        );
    }

    #[test]
    fn a_dependency_that_exits_releases_its_dependents() {
        let now = Instant::now();
        let mut plan = plan(now);
        let step = plan.step(now, &results(&[("api", ProbeResult::Ended)]));
        assert_eq!(step.launch, names(&["web"]));
        assert!(step.done);
    }

    #[test]
    fn a_chain_waits_through_an_unchecked_middle() {
        let now = Instant::now();
        let mut plan = Plan::new(
            &names(&["db", "api", "web"]),
            &[],
            |n| match n {
                "api" => names(&["db"]),
                "web" => names(&["api"]),
                _ => vec![],
            },
            |n| if n == "db" { check(10) } else { None },
            now,
        )
        .unwrap();
        assert_eq!(plan.deferred().len(), 2);
        let step = plan.step(now, &results(&[("db", ProbeResult::Pass)]));
        assert_eq!(step.launch, names(&["api", "web"]));
        assert!(step.done);
    }

    #[test]
    fn a_running_checked_dependency_gates_a_service_added_beside_it() {
        let now = Instant::now();
        let mut plan = Plan::new(
            &names(&["web"]),
            &names(&["api"]),
            |n| if n == "web" { names(&["api"]) } else { vec![] },
            |n| if n == "api" { check(30) } else { None },
            now,
        )
        .unwrap();
        assert_eq!(plan.deferred(), ["web".to_string()].into_iter().collect());
        let step = plan.step(now, &results(&[("api", ProbeResult::Pass)]));
        assert_eq!(step.launch, names(&["web"]));
    }
}
