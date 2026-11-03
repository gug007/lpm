//! `lpm update` — check for and install lpm updates through the running app,
//! with the same check and install as its Update button. Without `--now` an
//! install waits until no agent is mid-turn; run by an agent, that includes the
//! agent itself, so the install follows the end of its turn.
//!
//! The session daemon that runs services outlives an update, so services stay
//! on the build they started on until they are restarted onto the new one:
//! `--check` says when that is, and `--restart-services` does it.

use crate::config::Ctx;
use crate::control;
use crate::error::RunError;
use crate::job::value_text as text;
use crate::statussock;
use crate::style::Style;
use crate::util::print_json;
use serde_json::{json, Value};
use std::io::IsTerminal;
use std::time::{Duration, Instant};

/// How long a restarting app has to answer again.
const RESTART_WAIT: Duration = Duration::from_secs(120);
/// A release check or a restart of every service outlasts a control round trip.
const SLOW_REPLY: Duration = Duration::from_secs(300);

pub struct Args {
    pub check: bool,
    pub now: bool,
    pub stable: bool,
    pub cancel: bool,
    pub restart_services: bool,
    pub json: bool,
}

pub fn run(ctx: &Ctx, args: Args) -> Result<(), RunError> {
    control::require_app(ctx)?;
    if args.cancel {
        cancel(ctx, args.json)
    } else if args.restart_services {
        restart_services(ctx, args.json)
    } else if args.check {
        check(ctx, args.json)
    } else {
        install(ctx, args.now, args.stable, args.json)
    }
}

fn slow_json(ctx: &Ctx, line: &str) -> Result<Value, RunError> {
    control::parse_json(&control::send_within(ctx, line, SLOW_REPLY)?)
}

fn print_waiting(scheduled: &Value) {
    println!(
        "lpm {} installs once nothing is busy: {}.",
        text(scheduled, "version"),
        text(scheduled, "waiting")
    );
}

fn flag(v: &Value, key: &str) -> bool {
    v.get(key).and_then(Value::as_bool).unwrap_or(false)
}

fn check(ctx: &Ctx, json: bool) -> Result<(), RunError> {
    let info = slow_json(ctx, "update_check")?;
    // A failed release check still answers what this machine knows by itself.
    let failed = match text(&info, "error") {
        "" => None,
        error => Some(RunError::Internal(format!(
            "couldn't check for a new version: {error}"
        ))),
    };
    if json {
        print_json(&info);
        return failed.map_or(Ok(()), Err);
    }
    let style = Style {
        on: std::io::stdout().is_terminal(),
    };
    let current = text(&info, "currentVersion");
    let channel = match text(&info, "channel") {
        "beta" => "Beta",
        _ => "Stable",
    };
    if failed.is_some() {
        println!("lpm {current}");
    } else {
        println!(
            "lpm {current} {}",
            style.dim(&format!("· {channel} channel"))
        );
        if flag(&info, "updateAvail") {
            println!(
                "{} {} — `lpm update` installs it.",
                style.green("Update available:"),
                text(&info, "latestVersion")
            );
        } else {
            println!("lpm is up to date.");
        }
    }
    if flag(&info, "rollbackAvail") && channel == "Stable" {
        println!(
            "This is a Beta build. `lpm update --stable` installs the latest stable release, {}.",
            text(&info, "stableVersion")
        );
    }
    if let Some(scheduled) = info.get("scheduled").filter(|s| !s.is_null()) {
        print_waiting(scheduled);
    }
    let services = &info["services"];
    if !flag(services, "current") {
        let build = match text(services, "version") {
            "" => "an older lpm".to_string(),
            v => format!("lpm {v}"),
        };
        println!(
            "{} Services still run on {build}. `lpm update --restart-services` restarts them on {current}.",
            style.yellow("!")
        );
    }
    failed.map_or(Ok(()), Err)
}

/// What the app has said so far about an install it is running.
#[derive(Default)]
struct Progress {
    quiet: bool,
    version: String,
    installing: bool,
    shown_pct: Option<i64>,
}

impl Progress {
    fn line(&mut self, payload: &str) {
        let mut words = payload.split_whitespace();
        match (words.next(), words.next()) {
            (Some("start"), Some(version)) => {
                self.version = version.to_string();
                self.say(&format!("Installing lpm {version}…"));
            }
            (Some("downloading"), Some(pct)) => {
                let pct: i64 = pct.parse().unwrap_or(0);
                if self.shown_pct.is_none_or(|shown| pct >= shown + 10) {
                    self.shown_pct = Some(pct);
                    self.say(&format!("  downloading {pct}%"));
                }
            }
            (Some("installing"), _) => {
                self.installing = true;
                self.say("  installing — lpm restarts in a moment");
            }
            _ => {}
        }
    }

    fn say(&self, text: &str) {
        if !self.quiet {
            eprintln!("{text}");
        }
    }
}

fn install(ctx: &Ctx, now: bool, stable: bool, json: bool) -> Result<(), RunError> {
    let mut line = "update_install".to_string();
    if now {
        line.push_str(" --now");
    }
    if stable {
        line.push_str(" --stable");
    }
    let mut progress = Progress {
        quiet: json,
        ..Default::default()
    };
    let reply = match statussock::request_lines(&ctx.socket_path(), &line, |p| progress.line(p)) {
        Ok(reply) => reply,
        // The app quits to swap itself for the new build, and the connection
        // goes with it: the install finishing, not failing.
        Err(_) if progress.installing => return finished(ctx, &progress.version, json),
        Err(e) => return Err(RunError::Internal(e)),
    };
    let value = control::parse_json(&control::app_reply(reply)?)?;
    if json {
        print_json(&value);
        return Ok(());
    }
    let version = text(&value, "version");
    match text(&value, "state") {
        "current" => println!("lpm {version} is up to date."),
        "scheduled" => {
            print_waiting(&value);
            println!("`lpm update --now` installs it anyway; `lpm update --cancel` calls it off.");
        }
        "cancelled" => println!("The update to lpm {version} was cancelled."),
        _ => println!("{value}"),
    }
    Ok(())
}

/// Wait for the relaunched app to answer, so the caller knows it is back.
fn finished(ctx: &Ctx, version: &str, json: bool) -> Result<(), RunError> {
    let socket = ctx.socket_path();
    let deadline = Instant::now() + RESTART_WAIT;
    let mut gone = false;
    while Instant::now() < deadline {
        let up = statussock::ping(&socket);
        gone |= !up;
        if gone && up {
            if json {
                print_json(&json!({ "state": "installed", "version": version }));
            } else {
                println!("lpm {version} is installed and running.");
            }
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    Err(RunError::Internal(format!(
        "lpm {version} was installed, but the app hasn't come back yet — open it to finish"
    )))
}

fn cancel(ctx: &Ctx, json: bool) -> Result<(), RunError> {
    let value = control::parse_json(&control::send_command(ctx, "update_cancel")?)?;
    if json {
        print_json(&value);
    } else if flag(&value, "cancelled") {
        println!("Update cancelled.");
    } else {
        println!("No update was waiting or downloading.");
    }
    Ok(())
}

fn restart_services(ctx: &Ctx, json: bool) -> Result<(), RunError> {
    let build = control::parse_json(&control::send_command(ctx, "services_build")?)?;
    if flag(&build, "current") {
        if json {
            print_json(&json!({ "ok": true, "restarted": false, "services": build }));
        } else if flag(&build, "running") {
            println!("Services already run on this lpm.");
        } else {
            println!("No services are running.");
        }
        return Ok(());
    }
    let value = slow_json(ctx, "restart_services")?;
    if json {
        print_json(&json!({ "ok": true, "restarted": true, "services": value["services"] }));
    } else {
        println!("Services restarted on this lpm.");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn progress_follows_the_install_to_its_restart() {
        let mut progress = Progress {
            quiet: true,
            ..Default::default()
        };
        progress.line("start 0.7.32");
        progress.line("downloading 40");
        assert!(!progress.installing);
        progress.line("installing");
        assert_eq!(progress.version, "0.7.32");
        assert!(progress.installing);
    }

    #[test]
    fn download_progress_is_shown_in_tenths() {
        let mut progress = Progress {
            quiet: true,
            ..Default::default()
        };
        for pct in [0, 3, 9, 10, 15, 21] {
            progress.line(&format!("downloading {pct}"));
        }
        assert_eq!(progress.shown_pct, Some(21));
    }
}
