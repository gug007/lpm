// One service pane: a shell on a pty, plus the screen its output draws.
//
// A pane is a REPL, not a spawned command. lpm types a shell line into it and
// can type another one later — that is what makes "stop this service, then
// start it again in the same pane" work, and it is the contract stop/restart in
// services.rs is written against. So the shell outlives every service it runs,
// and only tearing the pane down ends it.
use crate::sessionproto::PaneSpec;
use crate::termgrid::{Grid, HISTORY_LIMIT};
use crate::termvt::Parser;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::io::{Read, Write};
use std::path::Path;
use std::sync::{Arc, Mutex};

/// tmux opened lpm's detached sessions at 200x50 rather than the default 80x24,
/// and every service log the UI renders has been wrapped at column 200 ever
/// since — `capture-pane -J` then re-joins it. Keeping the geometry keeps the
/// captures identical.
const COLS: u16 = 200;
const ROWS: u16 = 50;

/// A command line has to be typed into a shell one byte at a time; past this it
/// is not a command but a payload that would sit in the pty buffer with nothing
/// on the far side draining it. tmux refused the same input at its exec
/// boundary, so callers already handle the error.
const MAX_COMMAND: usize = 1024 * 1024;

pub struct Pane {
    pub id: String,
    pub service: String,
    pub pid: i32,
    grid: Mutex<Grid>,
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    child: Mutex<Box<dyn Child + Send + Sync>>,
}

impl Pane {
    /// Open a pane and type its command into it. `on_exit` runs when the shell
    /// itself ends (the pane is gone at that point, the way tmux destroys a
    /// pane whose process exited).
    pub fn open(
        id: String,
        spec: &PaneSpec,
        on_exit: impl FnOnce(String) + Send + 'static,
    ) -> Result<Arc<Pane>, String> {
        let pair = native_pty_system()
            .openpty(PtySize {
                rows: ROWS,
                cols: COLS,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("open pty: {e}"))?;

        let mut builder = CommandBuilder::new(crate::sys::login_shell());
        // A login shell, because tmux ran panes as login shells too (an empty
        // default-command means "login shell from default-shell") — dropping it
        // would silently take nvm/rbenv/asdf off PATH for every service.
        builder.arg("-l");
        builder.cwd(spawn_dir(&spec.dir));
        // Same locale guard the app's own terminals get: a Finder-launched .app
        // inherits no LANG/LC_*, and a shell that decides it is not UTF-8 puts
        // mojibake into the screen model this pane's logs are read from.
        if crate::pty::env_lacks_locale(std::env::vars()) {
            builder.env("LC_CTYPE", "UTF-8");
        }
        for (k, v) in std::env::vars() {
            builder.env(k, v);
        }
        // The daemon can descend from a shell inside someone's tmux; these panes
        // are not tmux panes, and a leaked TMUX changes how TUIs behave.
        builder.env_remove("TMUX");
        builder.env_remove("TMUX_PANE");
        builder.env("TERM", "xterm-256color");

        let child = pair
            .slave
            .spawn_command(builder)
            .map_err(|e| format!("spawn shell: {e}"))?;
        drop(pair.slave); // the child owns it now; holding it would defer EOF
        let pid = child.process_id().unwrap_or_default() as i32;
        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("pty reader: {e}"))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("pty writer: {e}"))?;

        let pane = Arc::new(Pane {
            id,
            service: spec.service.clone(),
            pid,
            grid: Mutex::new(Grid::new(COLS as usize, ROWS as usize)),
            master: Mutex::new(pair.master),
            writer: Mutex::new(writer),
            child: Mutex::new(child),
        });
        pane.clone().read_loop(reader, on_exit);
        if !spec.command.is_empty() {
            if let Err(error) = pane.send(&spec.command) {
                // The reader thread holds a clone of this Arc, so returning here
                // without ending the shell would keep the pane — its pty, its
                // process, its fds — alive with nothing left holding a handle to
                // it. Closing makes the reader see EOF, reap the child and let
                // its clone go.
                pane.close();
                return Err(error);
            }
        }
        Ok(pane)
    }

    /// Drain the pty into the pane's screen until the shell exits, then reap the
    /// child so it never lingers as a zombie.
    fn read_loop(self: Arc<Self>, mut reader: Box<dyn Read + Send>, on_exit: impl FnOnce(String) + Send + 'static) {
        std::thread::spawn(move || {
            let mut parser = Parser::default();
            let mut buf = vec![0u8; 16 * 1024];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        let mut grid = self.grid.lock().unwrap();
                        parser.feed(&buf[..n], &mut grid);
                    }
                }
            }
            let _ = self.child.lock().unwrap().wait();
            on_exit(self.id.clone());
        });
    }

    /// Type a line into the shell. Always literal: tmux's `send-keys` without
    /// `-l` resolved its argument as a key NAME first, so a service whose
    /// command happened to be `Enter` or `Escape` was sent as that keypress.
    pub fn send(&self, line: &str) -> Result<(), String> {
        if line.len() > MAX_COMMAND {
            return Err(format!(
                "command is too long to run in a pane ({} bytes)",
                line.len()
            ));
        }
        let mut writer = self.writer.lock().unwrap();
        writer
            .write_all(line.as_bytes())
            .and_then(|_| writer.write_all(b"\n"))
            .and_then(|_| writer.flush())
            .map_err(|e| format!("write to pane {}: {e}", self.id))
    }

    /// Interrupt whatever the pane is running and clear it, leaving the shell
    /// to take the next command.
    ///
    /// tmux typed a literal ^C and let the tty line discipline deliver SIGINT
    /// to the foreground process group. Signalling that group ourselves is the
    /// same delivery with one hazard removed: a ^C that lands in the window
    /// before the shell has installed its own handler kills the shell outright,
    /// and the shell is the one thing in a pane that must survive a stop.
    pub fn interrupt(&self) -> Result<(), String> {
        self.signal_foreground(libc::SIGINT);
        let mut grid = self.grid.lock().unwrap();
        grid.reset();
        grid.clear_history();
        Ok(())
    }

    /// Signal the pane's foreground job, never the pane's shell. Normally the
    /// tty names it: an interactive shell puts each job in its own process
    /// group and hands that group the terminal. A shell running without job
    /// control leaves its job in its own group, so there the only way to reach
    /// the job without hitting the shell is to signal its descendants.
    fn signal_foreground(&self, signal: i32) {
        let foreground = self
            .master
            .lock()
            .unwrap()
            .process_group_leader()
            .filter(|pgid| *pgid > 1 && *pgid != self.pid);
        if let Some(pgid) = foreground {
            unsafe { libc::killpg(pgid, signal) };
            return;
        }
        for pid in crate::proctree::trees(&[self.pid])
            .into_iter()
            .filter(|pid| *pid != self.pid && *pid > 1)
        {
            unsafe {
                libc::kill(-pid, signal); // a descendant that leads its own group
                libc::kill(pid, signal);
            }
        }
    }

    pub fn capture(&self, history: usize) -> String {
        self.grid
            .lock()
            .unwrap()
            .capture(history.min(HISTORY_LIMIT))
    }

    pub fn title(&self) -> String {
        self.grid.lock().unwrap().title.clone()
    }

    /// The pid of whatever currently has the pty's foreground process group —
    /// the job whose name and cwd `lpm project` shows as the pane's. Falls back
    /// to the shell when nothing is in the foreground.
    pub fn foreground_pid(&self) -> i32 {
        self.master
            .lock()
            .unwrap()
            .process_group_leader()
            .filter(|p| *p > 0)
            .unwrap_or(self.pid)
    }

    /// Close the pty. The caller reaps the process tree, snapshotting every
    /// pane's descendants BEFORE any of them is closed — once a shell dies its
    /// children reparent away and drop out of the walk.
    pub fn close(&self) {
        let _ = self.child.lock().unwrap().kill();
    }
}

/// A shell will not start in a directory that does not exist. tmux fell back to
/// "." in that case and let the `cd` inside the pane command be the real
/// working-directory decision; so do we.
fn spawn_dir(dir: &str) -> String {
    if !dir.is_empty() && Path::new(dir).is_dir() {
        dir.to_string()
    } else {
        ".".to_string()
    }
}
