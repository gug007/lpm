// The terminal modes a program switches on once and never announces again,
// followed as its output streams past.
//
// A replay is only the tail of a terminal's output. A full-screen program enters
// the alternate screen and turns on mouse reporting at startup, and those bytes
// scrolled out of the tail long ago — so a viewer rebuilt from the tail sits on
// the normal screen while the program draws as if it owned the alternate one. In
// xterm.js that is enough to break the mouse: plain clicks on the normal screen
// select text instead of reaching the program, while the wheel still scrolls it.
// `prelude` puts the modes back ahead of the replay.
//
// The mouse modes follow xterm.js, the emulator every viewer runs: the last
// tracking mode set wins, and resetting any one of them turns tracking off.

const MAX_PARAMS: usize = 16;

#[derive(Clone, Copy, Default, PartialEq)]
enum Scan {
    #[default]
    Ground,
    Esc,
    Csi,
    Private,
}

#[derive(Default)]
pub struct Modes {
    scan: Scan,
    params: Vec<u16>,
    param: u16,
    alt_screen: bool,
    // `None` until the stream has touched the mode; the inner value is its state.
    mouse_tracking: Option<Option<u16>>,
    mouse_encoding: Option<Option<u16>>,
    flags: Vec<(u16, bool)>,
}

impl Modes {
    pub fn feed(&mut self, bytes: &[u8]) {
        for &b in bytes {
            self.step(b);
        }
    }

    fn step(&mut self, b: u8) {
        self.scan = match (self.scan, b) {
            (_, 0x1b) => Scan::Esc,
            (Scan::Esc, b'[') => Scan::Csi,
            (Scan::Csi, b'?') => {
                self.params.clear();
                self.param = 0;
                Scan::Private
            }
            (Scan::Private, b'0'..=b'9') => {
                self.param = self
                    .param
                    .saturating_mul(10)
                    .saturating_add((b - b'0') as u16);
                Scan::Private
            }
            (Scan::Private, b';') => {
                self.end_param();
                Scan::Private
            }
            (Scan::Private, b'h' | b'l') => {
                self.end_param();
                let set = b == b'h';
                for mode in std::mem::take(&mut self.params) {
                    self.apply(mode, set);
                }
                Scan::Ground
            }
            _ => Scan::Ground,
        };
    }

    fn end_param(&mut self) {
        if self.params.len() < MAX_PARAMS {
            self.params.push(self.param);
        }
        self.param = 0;
    }

    fn apply(&mut self, mode: u16, set: bool) {
        match mode {
            47 | 1047 | 1049 => self.alt_screen = set,
            9 | 1000 | 1002 | 1003 => self.mouse_tracking = Some(set.then_some(mode)),
            1006 | 1016 => self.mouse_encoding = Some(set.then_some(mode)),
            1 | 25 | 1004 | 2004 => match self.flags.iter_mut().find(|(m, _)| *m == mode) {
                Some(flag) => flag.1 = set,
                None => self.flags.push((mode, set)),
            },
            _ => {}
        }
    }

    /// The sequences that restore these modes on a screen just cleared back to
    /// the normal buffer, ahead of the replayed tail. Only modes the stream has
    /// touched are named, so a viewer whose emulator survived also drops a mode
    /// the program turned off while it was away.
    pub fn prelude(&self) -> String {
        let mut out = String::new();
        if self.alt_screen {
            out.push_str("\x1b[?1049h");
        }
        match self.mouse_tracking {
            Some(Some(mode)) => out.push_str(&format!("\x1b[?{mode}h")),
            Some(None) => out.push_str("\x1b[?1000l"),
            None => {}
        }
        match self.mouse_encoding {
            Some(Some(mode)) => out.push_str(&format!("\x1b[?{mode}h")),
            Some(None) => out.push_str("\x1b[?1006l"),
            None => {}
        }
        for (mode, set) in &self.flags {
            out.push_str(&format!("\x1b[?{mode}{}", if *set { 'h' } else { 'l' }));
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::Modes;

    fn modes_after(chunks: &[&str]) -> Modes {
        let mut modes = Modes::default();
        for chunk in chunks {
            modes.feed(chunk.as_bytes());
        }
        modes
    }

    // Claude Code's fullscreen renderer announces all of this once, at startup.
    #[test]
    fn a_fullscreen_program_gets_its_screen_and_mouse_back() {
        let modes = modes_after(&[
            "\x1b[?1049h\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h\x1b[?2004h",
            "frame after frame of redraws",
        ]);
        assert_eq!(
            modes.prelude(),
            "\x1b[?1049h\x1b[?1003h\x1b[?1006h\x1b[?2004h"
        );
    }

    #[test]
    fn a_plain_shell_needs_nothing_restored() {
        assert_eq!(modes_after(&["$ ls\r\nfile\r\n$ "]).prelude(), "");
    }

    #[test]
    fn a_sequence_split_across_chunks_still_counts() {
        let modes = modes_after(&["text\x1b[?10", "49h more"]);
        assert_eq!(modes.prelude(), "\x1b[?1049h");
    }

    #[test]
    fn several_modes_in_one_sequence_all_apply() {
        let modes = modes_after(&["\x1b[?1049;1003;1006h"]);
        assert_eq!(modes.prelude(), "\x1b[?1049h\x1b[?1003h\x1b[?1006h");
    }

    // The program exited back to the shell: a viewer that still has the old modes
    // on must be told to drop them, or clicks at the prompt type escape codes.
    #[test]
    fn modes_a_program_turned_off_are_reset() {
        let modes = modes_after(&[
            "\x1b[?1049h\x1b[?1003h\x1b[?1006h\x1b[?25l",
            "\x1b[?1003l\x1b[?1006l\x1b[?25h\x1b[?1049l$ ",
        ]);
        assert_eq!(modes.prelude(), "\x1b[?1000l\x1b[?1006l\x1b[?25h");
    }

    // xterm.js keeps one tracking mode, not a flag per mode: resetting any of them
    // turns tracking off, whichever was set last.
    #[test]
    fn resetting_any_tracking_mode_turns_the_mouse_off() {
        let modes = modes_after(&["\x1b[?1003h\x1b[?1000l"]);
        assert_eq!(modes.prelude(), "\x1b[?1000l");
    }

    #[test]
    fn other_sequences_leave_the_modes_alone() {
        let modes = modes_after(&["\x1b[1049h\x1b[?1049$p\x1b[>1u\x1b[?u\x1b]0;title\x07\x1b[2J"]);
        assert_eq!(modes.prelude(), "");
    }
}
