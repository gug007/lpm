use super::*;

fn mark(leader: ProcId, seen: &[ProcId]) -> Mark {
    Mark {
        id: 0,
        leader,
        seen: seen.iter().copied().collect(),
        swept: None,
        ended: None,
        horizon: None,
    }
}

fn ended(leader: ProcId, horizon: u64) -> Mark {
    Mark {
        ended: Some(Instant::now()),
        horizon: Some(horizon),
        ..mark(leader, &[])
    }
}

fn table(rows: &[(u32, u32, u64)]) -> Table {
    rows.iter()
        .map(|&(pid, ppid, start)| (pid, (ppid, start)))
        .collect()
}

fn gone(_: u32) -> bool {
    false
}

#[test]
fn only_answering_replying_pairing_and_starting_tasks_are_refused() {
    for verb in [
        "answer_job_question",
        "dismiss_job_question",
        "send_job_followup",
        "remote_pair",
        "peer_pair",
        "run_task",
    ] {
        assert!(refused(verb), "{verb}");
    }
    for verb in [
        "job_ask",
        "job_ask_wait",
        "set_status",
        "list_jobs",
        "run_job",
        "ping",
    ] {
        assert!(!refused(verb), "{verb}");
    }
}

#[test]
fn a_refusal_reads_as_an_error_to_each_verbs_cli() {
    assert!(refusal("remote_pair").starts_with("ERROR: "));
    assert!(refusal("peer_pair").starts_with("ERROR: "));
    let reply: serde_json::Value = serde_json::from_str(&refusal("answer_job_question")).unwrap();
    assert_eq!(reply["ok"], false);
    assert!(reply["error"].as_str().unwrap().contains("Answer in lpm"));
    assert!(refusal("run_task").starts_with("ERROR: An automation run can't start tasks"));
    let reply: serde_json::Value = serde_json::from_str(&refusal("duplicate_project")).unwrap();
    assert_eq!(reply["ok"], false);
    assert!(reply["error"].as_str().unwrap().contains("lpm duplicate"));
}

#[test]
fn a_descendant_of_the_leader_belongs_and_a_stranger_does_not() {
    let t = table(&[(100, 1, 5), (200, 100, 6), (300, 200, 7), (400, 1, 8)]);
    let marks = [mark((100, 5), &[])];
    assert!(belongs(300, &t, &marks, Some(300), gone));
    assert!(!belongs(400, &t, &marks, Some(400), gone));
}

#[test]
fn a_process_still_in_the_runs_session_belongs_after_the_leader_is_gone() {
    let t = table(&[(300, 1, 7)]);
    assert!(belongs(300, &t, &[mark((100, 5), &[])], Some(100), gone));
    assert!(belongs(300, &t, &[ended((100, 5), 9)], Some(100), gone));
}

#[test]
fn a_session_led_by_someone_elses_live_process_is_not_the_runs() {
    // The leader's pid is alive but can't be read: a terminal's root-owned
    // login that happens to hold the pid an old run's leader had.
    let t = table(&[(300, 1, 7)]);
    assert!(!belongs(300, &t, &[ended((100, 5), 9)], Some(100), |_| true));
}

#[test]
fn a_session_started_after_the_run_ended_is_not_the_runs() {
    let t = table(&[(300, 1, 50)]);
    assert!(!belongs(300, &t, &[ended((100, 5), 9)], Some(100), gone));
}

#[test]
fn a_process_seen_by_a_sweep_belongs_after_its_parents_are_gone() {
    let t = table(&[(300, 1, 7)]);
    assert!(belongs(300, &t, &[mark((100, 5), &[(300, 7)])], Some(300), gone));
}

#[test]
fn a_pid_reused_by_a_stranger_is_not_the_run() {
    let marks = [mark((100, 5), &[(300, 7)])];
    // Pid 100 now leads someone else's session, started later.
    let t = table(&[(100, 1, 9), (200, 100, 10)]);
    assert!(!belongs(200, &t, &marks, Some(100), gone));
    // Pid 300 now names another process.
    let t = table(&[(300, 1, 12)]);
    assert!(!belongs(300, &t, &marks, Some(300), gone));
}

#[test]
fn a_parent_born_after_its_child_breaks_the_chain() {
    let t = table(&[(100, 1, 50), (200, 100, 6)]);
    assert!(!belongs(200, &t, &[mark((100, 5), &[])], Some(200), gone));
}

#[test]
fn a_sweep_never_follows_a_pid_someone_else_got_later() {
    // Seen (300, 7) died; a stranger's shell got pid 300 and has children.
    let mut m = mark((100, 5), &[(300, 7)]);
    let t = table(&[(300, 1, 20), (400, 300, 21), (500, 400, 22)]);
    note_descendants(&mut m, &t);
    assert!(m.seen.is_empty());
    assert!(!belongs(400, &t, &[m], Some(400), gone));
}

#[test]
fn a_sweep_follows_the_live_run_and_forgets_what_ended() {
    let mut m = mark((100, 5), &[(900, 3)]);
    let t = table(&[(100, 1, 5), (200, 100, 6), (300, 200, 7), (400, 1, 8)]);
    note_descendants(&mut m, &t);
    assert_eq!(m.seen, HashSet::from([(200, 6), (300, 7)]));
}

#[test]
fn a_caller_the_kernel_did_not_name_counts_as_a_run_on_unix() {
    assert_eq!(from_run(None), cfg!(unix));
}

#[cfg(unix)]
mod live {
    use super::super::*;
    use std::process::Command;

    fn detached(script: &str) -> std::process::Child {
        let mut cmd = Command::new("sh");
        cmd.args(["-c", script]);
        crate::osproc::detach(&mut cmd).spawn().unwrap()
    }

    fn child_of(pid: u32) -> Option<u32> {
        crate::osproc::process_starts()
            .into_iter()
            .find(|&(_, ppid, _)| ppid == pid)
            .map(|(child, _, _)| child)
    }

    fn wait_for(f: impl Fn() -> Option<u32>) -> u32 {
        for _ in 0..100 {
            if let Some(v) = f() {
                return v;
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        panic!("timed out");
    }

    #[test]
    fn a_runs_child_in_a_new_session_belongs_and_this_process_does_not() {
        let mut leader = detached("perl -MPOSIX -e 'POSIX::setsid(); sleep 30' & wait");
        let watch = watch(leader.id());
        let escaped = wait_for(|| child_of(leader.id()));
        watch.sweep();
        assert!(from_run(Some(escaped)));
        assert!(!from_run(Some(std::process::id())));
        crate::osproc::kill(escaped);
        let _ = leader.kill();
        let _ = leader.wait();
    }

    #[test]
    fn a_leftover_seen_while_the_run_lived_still_belongs_once_it_ended() {
        let mut leader = detached("perl -MPOSIX -e 'POSIX::setsid(); sleep 30' & sleep 1");
        let watch = watch(leader.id());
        let leftover = wait_for(|| child_of(leader.id()));
        watch.sweep();
        let _ = leader.wait();
        drop(watch);
        assert!(from_run(Some(leftover)));
        crate::osproc::kill(leftover);
    }
}
