// The lpm agent skills, installed on a machine lpm only reaches over ssh.
//
// Two kinds of machine already get them: a Mac, from the Settings button, and a
// Linux host, which installs them itself on every start. An ssh project is the
// third and was the one left out — its agents run on the far side, read the far
// side's skill dirs, and nothing here had ever written to them. `/lpm-memory` on
// such a box answered "Unknown command" no matter how current the Mac was, and
// the host row's "Reinstall skills there" could not help: it installs on a
// *paired host*, which an ssh remote is not.
//
// Modelled on the remote status hooks next door in hooks.rs — same trigger (a
// remote terminal spawning), same best-effort once-per-host-per-run guard, same
// remote write primitive — because it is the same problem: a machine that runs
// lpm's agents but does not run lpm.
use crate::config::SshSettings;
use crate::skill_install::{HOST_OPT_OUT, REMOVED_SKILL_FILES, SKILL_FILES, SKILL_TARGET_DIRS};

/// Where the stamp below lives, relative to the remote home.
const STAMP_PATH: &str = ".lpm/skills-stamp";

/// A content fingerprint of the whole bundle, so the common case — a host that
/// is already current — costs one ssh round trip instead of thirteen writes.
/// FNV-1a rather than a hash crate: this is a cache key, and it has to mean the
/// same thing to the older lpm that wrote the stamp we are comparing against.
fn bundle_stamp() -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    let mut feed = |s: &str| {
        for b in s.as_bytes() {
            h ^= u64::from(*b);
            h = h.wrapping_mul(0x1000_0000_01b3);
        }
    };
    for f in SKILL_FILES {
        feed(f.rel_path);
        feed(f.content);
    }
    for rel in REMOVED_SKILL_FILES {
        feed(rel);
    }
    format!("{h:016x}")
}

/// What the far side had to say about its skills.
#[derive(Debug, PartialEq)]
enum RemoteState {
    /// The operator put the opt-out marker in place. Nothing to do, ever.
    OptedOut,
    /// Every file is present and the stamp matches the bundle we carry.
    Current,
    /// Something is missing or out of date — write the lot.
    Stale,
    /// The host could not be reached, or answered something we don't understand.
    /// Distinct from Stale so a network blip is retried rather than recorded.
    Unknown,
}

/// One script that answers all of it: opt-out first, then every file's presence,
/// then the stamp. Presence is checked as well as the stamp because a stamp
/// alone would call a host current after someone deleted a skill by hand.
fn probe_script(stamp: &str) -> String {
    let mut s = format!("if [ -e \"$HOME/.lpm/{HOST_OPT_OUT}\" ]; then echo optout; exit 0; fi\n");
    for dir in SKILL_TARGET_DIRS {
        for f in SKILL_FILES {
            s.push_str(&format!(
                "[ -f \"$HOME/{dir}/{}\" ] || {{ echo stale; exit 0; }}\n",
                f.rel_path
            ));
        }
    }
    s.push_str(&format!(
        "[ \"$(cat \"$HOME/{STAMP_PATH}\" 2>/dev/null)\" = \"{stamp}\" ] && echo current || echo stale\n"
    ));
    s
}

fn probe(ssh: &SshSettings, stamp: &str) -> RemoteState {
    let out = crate::sshexec::remote_command(ssh, "", "bash", &["-lc", &probe_script(stamp)], &[])
        .output();
    let Ok(out) = out else {
        return RemoteState::Unknown;
    };
    if !out.status.success() {
        return RemoteState::Unknown;
    }
    // The last line, not the whole of stdout: a login shell may have printed a
    // banner of its own before our script ever ran.
    match String::from_utf8_lossy(&out.stdout)
        .lines()
        .last()
        .map(str::trim)
    {
        Some("optout") => RemoteState::OptedOut,
        Some("current") => RemoteState::Current,
        Some("stale") => RemoteState::Stale,
        _ => RemoteState::Unknown,
    }
}

/// `rm -f` for the files a past bundle installed and this one no longer has, in
/// one call. Ours are fixed literals, so the quoting here has nothing to escape.
fn prune_script() -> String {
    let mut s = String::new();
    for dir in SKILL_TARGET_DIRS {
        for rel in REMOVED_SKILL_FILES {
            s.push_str(&format!("rm -f \"$HOME/{dir}/{rel}\"\n"));
        }
    }
    s.push_str("exit 0\n");
    s
}

fn remote_path_expr(dir: &str, rel: &str) -> String {
    format!("\"$HOME/{dir}/{rel}\"")
}

/// Best-effort install of the bundled skills on the REMOTE host. Returns whether
/// the host is now installed — opting out counts, since there is nothing left to
/// try; an unreachable host or any failed write does not, so the caller retries
/// on the next spawn.
pub fn install_remote_agent_skills(ssh: &SshSettings) -> bool {
    let stamp = bundle_stamp();
    match probe(ssh, &stamp) {
        RemoteState::OptedOut | RemoteState::Current => return true,
        RemoteState::Unknown => return false,
        RemoteState::Stale => {}
    }

    let pruned = crate::sshexec::remote_command(ssh, "", "bash", &["-lc", &prune_script()], &[])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    let mut ok = pruned;
    for dir in SKILL_TARGET_DIRS {
        for f in SKILL_FILES {
            ok = crate::hooks::write_remote_file(
                ssh,
                &remote_path_expr(dir, f.rel_path),
                f.content.as_bytes(),
            ) && ok;
        }
    }
    // Last, and only on a clean run: the stamp is the claim that everything
    // above is on disk, so a partial install must not be able to make it.
    if !ok {
        return false;
    }
    crate::hooks::write_remote_file(ssh, &format!("\"$HOME/{STAMP_PATH}\""), stamp.as_bytes())
}

#[derive(Default)]
struct SkillInstallState {
    done: std::collections::HashSet<String>,
    in_flight: std::collections::HashSet<String>,
}

fn install_state() -> &'static std::sync::Mutex<SkillInstallState> {
    static STATE: std::sync::OnceLock<std::sync::Mutex<SkillInstallState>> =
        std::sync::OnceLock::new();
    STATE.get_or_init(Default::default)
}

/// Install the remote skills once per host per app run (best-effort, off-thread).
/// Called on every remote terminal spawn; the host is recorded only after a
/// fully successful pass, so a host that was briefly unreachable is retried on
/// the next one. The in-flight guard keeps concurrent spawns from running two
/// installs for one host at once.
pub fn install_remote_agent_skills_once(ssh: &SshSettings) {
    let key = format!("{}@{}:{}", ssh.user, ssh.host, ssh.port);
    {
        let mut st = install_state().lock().unwrap();
        if st.done.contains(&key) || !st.in_flight.insert(key.clone()) {
            return;
        }
    }
    let ssh = ssh.clone();
    std::thread::spawn(move || {
        let ok = install_remote_agent_skills(&ssh);
        let mut st = install_state().lock().unwrap();
        st.in_flight.remove(&key);
        if ok {
            st.done.insert(key);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stamp_is_stable_and_hex() {
        let a = bundle_stamp();
        assert_eq!(a, bundle_stamp());
        assert_eq!(a.len(), 16);
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn probe_checks_every_file_in_both_dirs() {
        let s = probe_script("abc");
        for dir in SKILL_TARGET_DIRS {
            for f in SKILL_FILES {
                assert!(
                    s.contains(&format!("\"$HOME/{dir}/{}\"", f.rel_path)),
                    "{dir}/{} not probed",
                    f.rel_path
                );
            }
        }
    }

    #[test]
    fn probe_covers_memory_skill() {
        // The skill whose absence on an ssh remote is what this module exists
        // for — a bundle that stopped shipping it should fail here loudly.
        assert!(probe_script("abc").contains("lpm-memory/SKILL.md"));
    }

    #[test]
    fn probe_answers_opt_out_before_anything_else() {
        let s = probe_script("abc");
        let optout = s.find(HOST_OPT_OUT).expect("opt-out marker not checked");
        let first_file = s.find("lpm-config/SKILL.md").unwrap();
        assert!(optout < first_file);
    }

    #[test]
    fn probe_compares_the_stamp_it_was_given() {
        assert!(probe_script("deadbeef").contains("= \"deadbeef\""));
    }

    #[test]
    fn prune_removes_replaced_files_from_both_dirs() {
        let s = prune_script();
        for dir in SKILL_TARGET_DIRS {
            for rel in REMOVED_SKILL_FILES {
                assert!(s.contains(&format!("rm -f \"$HOME/{dir}/{rel}\"")));
            }
        }
    }

    // Nothing removed is not an error: the script must still exit 0 so an
    // otherwise healthy install isn't failed by an empty prune.
    #[test]
    fn prune_script_always_succeeds() {
        assert!(prune_script().ends_with("exit 0\n"));
    }

    #[test]
    fn path_expr_is_home_relative_and_quoted() {
        assert_eq!(
            remote_path_expr(".claude/skills", "lpm-memory/SKILL.md"),
            "\"$HOME/.claude/skills/lpm-memory/SKILL.md\""
        );
    }

    // The remote layout has to be the local one, or an agent on the far side
    // looks somewhere lpm never writes — the whole bug this module fixes.
    #[test]
    fn target_dirs_match_the_local_ones() {
        assert_eq!(SKILL_TARGET_DIRS, &[".claude/skills", ".agents/skills"]);
    }
}
