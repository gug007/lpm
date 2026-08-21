// Escape-sequence decoder for service panes. Feeds a termgrid::Grid from the
// raw PTY byte stream: the subset of ECMA-48 / DEC that dev servers, build
// watchers and progress renderers actually emit, plus enough of the rest to
// consume it silently rather than print it as garbage.
//
// tmux's `capture-pane -p` (no `-e`) returns TEXT — colours and other styling
// are dropped — so SGR and friends are parsed only to be discarded. The one
// non-drawing sequence we keep is OSC 0/2, the title a pane reports, which
// `lpm project` renders as `pane_title`.
use crate::termgrid::Grid;

#[derive(Clone, Copy, PartialEq)]
enum State {
    Ground,
    Esc,
    EscIntermediate,
    Csi,
    Osc,
    OscEsc,
    String, // DCS/APC/PM/SOS — consumed until ST
    StringEsc,
}

/// Real sequences use a handful of parameters; a stream of semicolons is not a
/// sequence, it is a way to grow a vec forever. Extra fields are parsed and
/// dropped, which is what a terminal does with them anyway.
const MAX_PARAMS: usize = 32;

pub struct Parser {
    state: State,
    params: Vec<u16>,
    /// A parameter still being accumulated (None when the field is empty, which
    /// is how a default value is expressed).
    current: Option<u16>,
    private: Option<u8>,
    /// Raw bytes: an OSC payload is UTF-8 (a title can carry any text), and
    /// pushing each byte as a char would decode it as Latin-1.
    osc: Vec<u8>,
    utf8: Utf8,
}

/// Incremental UTF-8 decoder: PTY reads split multibyte characters at arbitrary
/// byte boundaries, so continuation bytes have to survive across chunks.
#[derive(Default)]
struct Utf8 {
    buf: [u8; 4],
    len: usize,
    need: usize,
}

impl Default for Parser {
    fn default() -> Self {
        Parser {
            state: State::Ground,
            params: Vec::new(),
            current: None,
            private: None,
            osc: Vec::new(),
            utf8: Utf8::default(),
        }
    }
}

impl Parser {
    pub fn feed(&mut self, bytes: &[u8], grid: &mut Grid) {
        for &b in bytes {
            self.byte(b, grid);
        }
    }

    fn byte(&mut self, b: u8, grid: &mut Grid) {
        match self.state {
            State::Ground => self.ground(b, grid),
            State::Esc => self.esc(b, grid),
            State::EscIntermediate => self.state = State::Ground,
            State::Csi => self.csi(b, grid),
            State::Osc | State::OscEsc => self.osc(b, grid),
            State::String | State::StringEsc => self.string(b),
        }
    }

    // ---- ground ---------------------------------------------------------------

    fn ground(&mut self, b: u8, grid: &mut Grid) {
        if self.utf8.need > 0 {
            if b & 0xC0 == 0x80 {
                self.utf8.buf[self.utf8.len] = b;
                self.utf8.len += 1;
                self.utf8.need -= 1;
                if self.utf8.need == 0 {
                    let text = String::from_utf8_lossy(&self.utf8.buf[..self.utf8.len]).into_owned();
                    self.utf8.len = 0;
                    for ch in text.chars() {
                        print_char(ch, grid);
                    }
                }
                return;
            }
            // Truncated sequence: emit the replacement tmux would show, then
            // reprocess this byte as a fresh one.
            self.utf8.len = 0;
            self.utf8.need = 0;
            print_char('\u{FFFD}', grid);
        }
        match b {
            0x1B => self.escape(),
            0x00..=0x1F | 0x7F => control(b, grid),
            0x20..=0x7E => print_char(b as char, grid),
            _ => {
                self.utf8.need = match b {
                    0xC2..=0xDF => 1,
                    0xE0..=0xEF => 2,
                    0xF0..=0xF4 => 3,
                    _ => {
                        print_char('\u{FFFD}', grid);
                        return;
                    }
                };
                self.utf8.buf[0] = b;
                self.utf8.len = 1;
            }
        }
    }

    fn escape(&mut self) {
        self.state = State::Esc;
        self.params.clear();
        self.current = None;
        self.private = None;
    }

    // ---- ESC ------------------------------------------------------------------

    fn esc(&mut self, b: u8, grid: &mut Grid) {
        self.state = State::Ground;
        match b {
            b'[' => {
                self.state = State::Csi;
                self.params.clear();
                self.current = None;
                self.private = None;
            }
            b']' => {
                self.state = State::Osc;
                self.osc.clear();
            }
            b'P' | b'X' | b'^' | b'_' => self.state = State::String,
            b'7' => grid.save_cursor(),
            b'8' => grid.restore_cursor(),
            b'D' => grid.line_feed(),
            b'E' => {
                grid.cursor_col = 0;
                grid.line_feed();
            }
            b'M' => grid.reverse_index(),
            b'c' => grid.reset(),
            // Charset designators and similar take one more byte we ignore.
            b'(' | b')' | b'*' | b'+' | b'-' | b'.' | b'/' | b'#' | b'%' | b' ' => {
                self.state = State::EscIntermediate
            }
            _ => {}
        }
    }

    // ---- CSI ------------------------------------------------------------------

    fn csi(&mut self, b: u8, grid: &mut Grid) {
        match b {
            b'0'..=b'9' => {
                let d = u16::from(b - b'0');
                let n = self.current.unwrap_or(0);
                self.current = Some(n.saturating_mul(10).saturating_add(d));
            }
            // Sub-parameters (SGR 38:2:...) never change geometry; fold them in
            // as separators so the final byte still dispatches correctly.
            b';' | b':' => self.push_param(),
            b'?' | b'>' | b'<' | b'=' | b'!' => self.private = Some(b),
            0x20..=0x2F => {} // intermediates
            0x40..=0x7E => {
                self.push_param();
                self.dispatch(b, grid);
                self.state = State::Ground;
            }
            // A fresh ESC abandons the sequence in progress rather than being
            // eaten by it — otherwise a CSI truncated mid-write (two children
            // sharing the pane's pty, a process killed part-way through) makes
            // the NEXT sequence print as literal text.
            0x1B => self.escape(),
            // A C0 embedded in a sequence executes where it appears, and the
            // sequence carries on around it.
            0x00..=0x1F => control(b, grid),
            _ => self.state = State::Ground,
        }
    }

    fn push_param(&mut self) {
        let value = self.current.take().unwrap_or(0);
        if self.params.len() < MAX_PARAMS {
            self.params.push(value);
        }
    }

    /// `n`th parameter, defaulting when absent or zero — the ECMA-48 convention
    /// where a missing count means 1.
    fn arg(&self, n: usize, default: u16) -> u16 {
        match self.params.get(n) {
            Some(0) | None => default,
            Some(v) => *v,
        }
    }

    fn dispatch(&mut self, final_byte: u8, grid: &mut Grid) {
        let one = self.arg(0, 1) as usize;
        let raw = *self.params.first().unwrap_or(&0);
        match final_byte {
            b'A' => grid.cursor_up(one),
            b'B' | b'e' => grid.cursor_down(one),
            b'C' | b'a' => grid.cursor_right(one),
            b'D' => grid.cursor_left(one),
            b'E' => {
                grid.cursor_down(one);
                grid.cursor_col = 0;
            }
            b'F' => {
                grid.cursor_up(one);
                grid.cursor_col = 0;
            }
            b'G' | b'`' => grid.move_to(grid.cursor_row, one - 1),
            b'H' | b'f' => {
                let row = self.arg(0, 1) as usize - 1;
                let col = self.arg(1, 1) as usize - 1;
                grid.move_to(row, col);
            }
            b'd' => grid.move_to(one - 1, grid.cursor_col),
            b'J' => grid.erase_in_display(raw),
            b'K' => grid.erase_in_line(raw),
            b'L' => grid.insert_lines(one),
            b'M' => grid.delete_lines(one),
            b'@' => grid.insert_chars(one),
            b'P' => grid.delete_chars(one),
            b'X' => grid.erase_chars(one),
            b'S' => grid.scroll_up(one),
            b'T' => grid.scroll_down(one),
            b'r' => {
                let top = self.arg(0, 1) as usize - 1;
                let bottom = self.arg(1, grid.rows as u16) as usize - 1;
                grid.set_scroll_region(top, bottom);
            }
            b's' => grid.save_cursor(),
            b'u' => grid.restore_cursor(),
            b'h' | b'l' => self.mode(final_byte == b'h', grid),
            _ => {} // SGR (m), device reports, cursor styling: nothing to draw
        }
    }

    fn mode(&self, set: bool, grid: &mut Grid) {
        if self.private != Some(b'?') {
            return;
        }
        for &p in &self.params {
            match p {
                7 => grid.autowrap = set,
                47 | 1047 | 1049 => {
                    if set {
                        grid.enter_alt_screen();
                    } else {
                        grid.leave_alt_screen();
                    }
                }
                _ => {}
            }
        }
    }

    // ---- OSC / string sequences ------------------------------------------------

    fn osc(&mut self, b: u8, grid: &mut Grid) {
        if self.state == State::OscEsc {
            self.state = State::Ground;
            if b == b'\\' {
                self.finish_osc(grid);
            }
            return;
        }
        match b {
            0x07 => {
                self.finish_osc(grid);
                self.state = State::Ground;
            }
            0x1B => self.state = State::OscEsc,
            _ => {
                if self.osc.len() < 4096 {
                    self.osc.push(b);
                }
            }
        }
    }

    /// OSC 0 (icon + title) and OSC 2 (title) are what a shell writes to name
    /// its pane; everything else here is for someone other than us.
    fn finish_osc(&mut self, grid: &mut Grid) {
        let payload = String::from_utf8_lossy(&self.osc);
        if let Some((code, text)) = payload.split_once(';') {
            if code == "0" || code == "2" {
                grid.title = text.to_string();
            }
        }
        self.osc.clear();
    }

    fn string(&mut self, b: u8) {
        if self.state == State::StringEsc {
            self.state = if b == b'\\' { State::Ground } else { State::String };
            return;
        }
        match b {
            0x07 => self.state = State::Ground,
            0x1B => self.state = State::StringEsc,
            _ => {}
        }
    }
}

/// Execute a C0 control. Shared by the ground state and the sequence states,
/// because a control inside a sequence is still a control.
fn control(b: u8, grid: &mut Grid) {
    match b {
        0x08 => grid.cursor_left(1),             // BS
        0x09 => tab(grid),                       // HT
        0x0A..=0x0C => grid.line_feed(), // LF/VT/FF
        0x0D => {
            grid.cursor_col = 0;
            grid.wrap_pending = false;
        }
        _ => {} // BEL, the remaining C0s and DEL draw nothing
    }
}

fn tab(grid: &mut Grid) {
    let next = ((grid.cursor_col / 8) + 1) * 8;
    grid.move_to(grid.cursor_row, next.min(grid.cols - 1));
}

fn print_char(ch: char, grid: &mut Grid) {
    let width = char_width(ch);
    if width == 0 {
        grid.combine(ch); // belongs to the glyph already placed, not a cell of its own
        return;
    }
    grid.put(ch, width);
}

/// Cell width. Full Unicode width tables are a library of their own; these are
/// the ranges that actually reach a service pane — CJK text and the emoji dev
/// servers print in their banners — and everything else is one cell.
fn char_width(ch: char) -> usize {
    let c = ch as u32;
    match c {
        0x0300..=0x036F | 0x200B..=0x200F | 0xFE00..=0xFE0F | 0xFEFF => 0,
        0x1100..=0x115F
        | 0x2E80..=0x303E
        | 0x3041..=0x33FF
        | 0x3400..=0x4DBF
        | 0x4E00..=0x9FFF
        | 0xA000..=0xA4CF
        | 0xAC00..=0xD7A3
        | 0xF900..=0xFAFF
        | 0xFE30..=0xFE6F
        | 0xFF00..=0xFF60
        | 0xFFE0..=0xFFE6
        | 0x1F300..=0x1F64F
        | 0x1F900..=0x1F9FF
        | 0x20000..=0x3FFFD => 2,
        _ => 1,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::termgrid::Grid;

    /// Drive a fresh grid with `input` and return what a capture of the whole
    /// buffer would produce, trimmed the way sessions::capture_pane trims it.
    fn render(cols: usize, rows: usize, input: &[u8]) -> String {
        let mut grid = Grid::new(cols, rows);
        let mut parser = Parser::default();
        parser.feed(input, &mut grid);
        grid.capture(1000).trim().to_string()
    }

    #[test]
    fn plain_lines_come_back_as_lines() {
        assert_eq!(render(20, 5, b"one\r\ntwo\r\nthree"), "one\ntwo\nthree");
    }

    #[test]
    fn a_wrapped_line_is_rejoined() {
        // The pane is 8 columns wide; the text is one 12-character logical
        // line. tmux's `-J` put it back together and so must this.
        assert_eq!(render(8, 4, b"abcdefghijkl"), "abcdefghijkl");
    }

    #[test]
    fn a_line_ending_exactly_at_the_margin_does_not_gain_a_blank_row() {
        assert_eq!(render(4, 4, b"abcd\r\nxy"), "abcd\nxy");
    }

    #[test]
    fn carriage_return_overwrites_in_place() {
        // How every progress bar redraws itself. The capture must show the
        // final state, not the history of it.
        assert_eq!(render(20, 4, b"10%\r100%"), "100%");
    }

    #[test]
    fn erase_to_end_of_line_clears_what_the_cursor_left_behind() {
        // Without EL handling the shorter redraw leaves "0%" trailing.
        assert_eq!(render(20, 4, b"working 100%\rdone\x1b[K"), "done");
    }

    #[test]
    fn clear_screen_empties_the_visible_rows() {
        assert_eq!(render(20, 4, b"noise\r\n\x1b[2J\x1b[Hclean"), "clean");
    }

    #[test]
    fn cursor_up_rewrites_the_row_above() {
        // A spinner that redraws its own line after printing below it.
        assert_eq!(
            render(20, 5, b"step one\r\nstep two\x1b[1A\rstep ONE\x1b[K"),
            "step ONE\nstep two"
        );
    }

    #[test]
    fn rows_that_scroll_off_are_kept_as_history() {
        let out = render(20, 3, b"a\r\nb\r\nc\r\nd\r\ne");
        assert_eq!(out, "a\nb\nc\nd\ne");
    }

    #[test]
    fn capture_returns_the_requested_history_plus_the_whole_screen() {
        let mut grid = Grid::new(20, 3);
        let mut parser = Parser::default();
        for i in 0..10 {
            parser.feed(format!("line{i}\r\n").as_bytes(), &mut grid);
        }
        // One line of history, plus all three screen rows — the last of which
        // is the blank row the cursor sits on. That is the same "you can get
        // back more than you asked for" shape tmux's `-S -<n>` had, which is
        // why callers tail the result themselves.
        assert_eq!(grid.capture(1), "line7\nline8\nline9\n");
    }

    #[test]
    fn the_alternate_screen_never_becomes_history() {
        // A full-screen program's redraws are not scrollback: entering the alt
        // screen, filling it, and leaving must restore what was there before.
        let out = render(
            20,
            3,
            b"real output\r\n\x1b[?1049h\x1b[2J\x1b[Hfull screen\r\nmore\r\nand more\r\n\x1b[?1049l",
        );
        assert_eq!(out, "real output");
    }

    #[test]
    fn an_osc_title_is_captured_and_never_printed() {
        let mut grid = Grid::new(20, 3);
        let mut parser = Parser::default();
        parser.feed(b"\x1b]0;npm run dev\x07ready", &mut grid);
        assert_eq!(grid.title, "npm run dev");
        assert_eq!(grid.capture(10).trim(), "ready");
    }

    #[test]
    fn styling_is_dropped_the_way_capture_pane_dropped_it() {
        // `capture-pane -p` without `-e` returns text, never escape sequences.
        assert_eq!(render(20, 3, b"\x1b[32mok\x1b[0m done"), "ok done");
    }

    #[test]
    fn a_multibyte_character_split_across_reads_survives() {
        let mut grid = Grid::new(20, 3);
        let mut parser = Parser::default();
        let bytes = "✓ built".as_bytes();
        parser.feed(&bytes[..1], &mut grid); // first byte of the checkmark
        parser.feed(&bytes[1..], &mut grid);
        assert_eq!(grid.capture(10).trim(), "✓ built");
    }

    /// The parser is fed whatever a service prints, so nothing it can be handed
    /// may panic. A grid one cell wide and one row tall is the shape most likely
    /// to walk off the end of a row or a screen.
    #[test]
    fn no_byte_sequence_can_panic_the_parser() {
        let mut seed: u64 = 0x243F_6A88_85A3_08D3;
        let mut rand = move || {
            seed ^= seed << 13;
            seed ^= seed >> 7;
            seed ^= seed << 17;
            seed
        };
        // Bias towards the bytes that steer the parser, so the random runs are
        // mostly well-formed sequences with hostile parameters rather than noise.
        let interesting: &[u8] = b"\x1b[](){}0123456789;:?><=!ABCDEFGHJKLMPSTXdfhlmrsu\x07\x08\x09\x0a\x0d\x0c\\ \xc2\xe0\xf0\x80";
        for (cols, rows) in [(1, 1), (2, 1), (1, 3), (8, 3), (200, 50)] {
            let mut grid = Grid::new(cols, rows);
            let mut parser = Parser::default();
            for _ in 0..2_000 {
                let n = (rand() % 64) as usize;
                let chunk: Vec<u8> = (0..n)
                    .map(|_| {
                        let r = rand();
                        if r % 4 == 0 {
                            (r >> 8) as u8
                        } else {
                            interesting[(r >> 8) as usize % interesting.len()]
                        }
                    })
                    .collect();
                parser.feed(&chunk, &mut grid);
                let _ = grid.capture(50); // capture must survive any state too
            }
        }
    }

    #[test]
    fn a_combining_mark_stays_on_the_character_it_modifies() {
        // macOS hands out decomposed text in file paths, so a dev server that
        // prints one must not have its accents silently deleted.
        assert_eq!(render(20, 3, "Cafe\u{301}/build".as_bytes()), "Cafe\u{301}/build");
        assert_eq!(render(20, 3, "e\u{301}tat".as_bytes()), "e\u{301}tat");
    }

    #[test]
    fn an_esc_abandons_a_truncated_sequence_instead_of_printing_it() {
        // Two children sharing one pty, or a process killed part-way through a
        // write, leaves a CSI cut short. The sequence that follows must still
        // run rather than being drawn as text.
        assert_eq!(render(20, 3, b"abc\r\x1b[3\x1b[Kz"), "z");
        assert_eq!(render(40, 3, b"start \x1b[3\x1b[32mgreen\x1b[0m end"), "start green end");
    }

    #[test]
    fn a_control_inside_a_sequence_still_executes() {
        // ESC [ 3 <LF> m b: the line feed happens where it appears, the
        // sequence resumes and ends at its final byte `m`, and `b` is ordinary
        // text again. Swallowing the LF would put both characters on one line.
        // `b` lands in column 1 because a bare LF moves down without returning
        // the carriage, which is what leaves the leading space.
        assert_eq!(render(20, 3, b"a\x1b[3\nmb"), "a\n b");
    }

    #[test]
    fn a_non_ascii_osc_title_is_decoded_as_utf8() {
        let mut grid = Grid::new(20, 3);
        let mut parser = Parser::default();
        parser.feed("\x1b]0;café ✓\x07".as_bytes(), &mut grid);
        assert_eq!(grid.title, "café ✓");
    }

    #[test]
    fn a_scroll_region_redraw_does_not_leak_into_history() {
        // A pager holding a status line at the bottom scrolls only part of the
        // screen; those rows are in-place redraws, not output that scrolled by.
        let mut grid = Grid::new(20, 4);
        let mut parser = Parser::default();
        parser.feed(b"\x1b[1;3r\x1b[Ha\r\nb\r\nc\r\nd\r\ne", &mut grid);
        assert!(
            !grid.capture(100).contains("\na\n"),
            "region rows must not be retired into scrollback"
        );
    }
}

