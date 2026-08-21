// Terminal screen model for service panes — the state `tmux capture-pane` used
// to hold for us. A pane's output is a byte stream; what the UI renders is the
// SCREEN that stream draws, so a raw byte ring can't answer "what does this
// pane look like now" (see ptyring.rs for why a replay only approximates it).
//
// The model is tmux's: a fixed rows x cols screen plus a scrollback of the rows
// that have scrolled off the top. Each row remembers whether it ended by
// WRAPPING rather than by a newline, which is what lets `capture` re-join it —
// the `-J` in `capture-pane -p -J`. Escape-sequence decoding lives in termvt.rs;
// this file is only the data model it drives.
use std::collections::VecDeque;

/// Scrollback depth. tmux's default `history-limit` is 2000, which silently
/// capped the CLI's `--lines` ceiling of 10_000; keeping the full 10_000 here
/// means a capture can always answer what it was asked for.
pub const HISTORY_LIMIT: usize = 10_000;

/// Placeholder written into the cell a double-width glyph spills into, so the
/// row's column arithmetic stays true without inventing a character.
const WIDE_CONTINUATION: char = '\0';

/// One screen row. `used` is one past the last column ever written, so trailing
/// cells that were never drawn are not emitted (tmux only writes out a line's
/// populated extent). `wrapped` marks a row whose text continues on the next.
#[derive(Clone)]
pub struct Row {
    cells: Vec<char>,
    used: usize,
    wrapped: bool,
    /// Combining marks attached to a cell, in the order they arrived. A cell is
    /// one `char`, but a grapheme can be several — "e" plus U+0301 is one cell
    /// showing "é", and macOS hands out decomposed text like that in file paths,
    /// so dropping the mark would quietly turn "Café" into "Cafe" in a log.
    /// Empty (and unallocated) for the rows that have none, which is nearly all.
    marks: Vec<(usize, char)>,
}

impl Row {
    fn blank(cols: usize) -> Self {
        Row {
            cells: vec![' '; cols],
            used: 0,
            wrapped: false,
            marks: Vec::new(),
        }
    }

    /// The row's populated extent. Continuation cells of a wide glyph are
    /// placeholders for width, not characters, so they never appear.
    fn text(&self) -> String {
        let mut out = String::with_capacity(self.used);
        for (col, ch) in self.cells[..self.used.min(self.cells.len())]
            .iter()
            .enumerate()
        {
            if *ch != WIDE_CONTINUATION {
                out.push(*ch);
            }
            if !self.marks.is_empty() {
                out.extend(self.marks.iter().filter(|(c, _)| *c == col).map(|(_, m)| m));
            }
        }
        out
    }

    /// Attach a combining mark to a cell, bounded so a stream of marks aimed at
    /// one cell cannot grow the row without limit.
    fn add_mark(&mut self, col: usize, mark: char) {
        const MAX_MARKS: usize = 8;
        if self.marks.iter().filter(|(c, _)| *c == col).count() < MAX_MARKS {
            self.marks.push((col, mark));
        }
    }

    fn clear_marks(&mut self, from: usize, to: usize) {
        self.marks.retain(|(col, _)| *col < from || *col >= to);
    }

    fn clear(&mut self) {
        self.cells.iter_mut().for_each(|c| *c = ' ');
        self.used = 0;
        self.wrapped = false;
        self.marks.clear();
    }
}

/// A pane's screen plus its scrollback. Cursor is (row, col) into the screen.
pub struct Grid {
    pub cols: usize,
    pub rows: usize,
    screen: Vec<Row>,
    scrollback: VecDeque<Row>,
    pub cursor_row: usize,
    pub cursor_col: usize,
    saved_cursor: (usize, usize),
    /// Inclusive scroll region (DECSTBM); defaults to the whole screen.
    scroll_top: usize,
    scroll_bottom: usize,
    /// Deferred autowrap: writing to the last column parks the cursor there and
    /// wraps only when the NEXT character arrives, so a line that ends exactly
    /// at the right margin doesn't leave a spurious blank row.
    pub wrap_pending: bool,
    pub autowrap: bool,
    /// Screen saved while the alternate screen is active. Alt-screen rows never
    /// enter the scrollback — a full-screen program's redraws are not history.
    alt_saved: Option<(Vec<Row>, usize, usize)>,
    /// (row, col) of the cell most recently drawn into — where a combining mark
    /// that arrives next belongs.
    last_drawn: Option<(usize, usize)>,
    pub title: String,
}

impl Grid {
    pub fn new(cols: usize, rows: usize) -> Self {
        let cols = cols.max(1);
        let rows = rows.max(1);
        Grid {
            cols,
            rows,
            screen: (0..rows).map(|_| Row::blank(cols)).collect(),
            scrollback: VecDeque::new(),
            cursor_row: 0,
            cursor_col: 0,
            saved_cursor: (0, 0),
            scroll_top: 0,
            scroll_bottom: rows - 1,
            wrap_pending: false,
            autowrap: true,
            alt_saved: None,
            last_drawn: None,
            title: String::new(),
        }
    }

    fn on_alt_screen(&self) -> bool {
        self.alt_saved.is_some()
    }

    // ---- writing -------------------------------------------------------------

    /// Put one character at the cursor, honouring deferred autowrap. `width` is
    /// the cell count (2 for wide glyphs, which claim the following cell).
    pub fn put(&mut self, ch: char, width: usize) {
        let cols = self.cols;
        let width = width.max(1).min(cols);
        if self.wrap_pending {
            self.screen[self.cursor_row].wrapped = true;
            self.cursor_col = 0;
            self.wrap_pending = false;
            self.line_feed();
        }
        if self.cursor_col + width > cols {
            if self.autowrap {
                self.screen[self.cursor_row].wrapped = true;
                self.cursor_col = 0;
                self.line_feed();
            } else {
                // Autowrap off: the glyph overwrites the last cell(s) in place.
                self.cursor_col = cols - width;
            }
        }
        let col = self.cursor_col;
        let row = &mut self.screen[self.cursor_row];
        row.cells[col] = ch;
        for pad in 1..width {
            row.cells[col + pad] = WIDE_CONTINUATION;
        }
        row.used = row.used.max(col + width);
        row.clear_marks(col, col + width);
        self.last_drawn = Some((self.cursor_row, col));
        if col + width >= cols {
            // Park on the last cell; the wrap happens when the next glyph lands.
            self.cursor_col = cols - 1;
            self.wrap_pending = self.autowrap;
        } else {
            self.cursor_col = col + width;
        }
    }

    /// Attach a zero-width combining mark to the cell just drawn. With nothing
    /// drawn yet there is nothing to combine with, and the mark is dropped —
    /// which is what a terminal does with a mark that opens a line.
    pub fn combine(&mut self, mark: char) {
        if let Some((row, col)) = self.last_drawn {
            self.screen[row].add_mark(col, mark);
        }
    }

    /// LF: advance a row, scrolling the region when already at its bottom.
    pub fn line_feed(&mut self) {
        self.wrap_pending = false;
        if self.cursor_row == self.scroll_bottom {
            self.scroll_up(1);
        } else if self.cursor_row + 1 < self.rows {
            self.cursor_row += 1;
        }
    }

    /// RI: back a row, scrolling the region down when already at its top.
    pub fn reverse_index(&mut self) {
        self.wrap_pending = false;
        if self.cursor_row == self.scroll_top {
            self.scroll_down(1);
        } else {
            self.cursor_row = self.cursor_row.saturating_sub(1);
        }
    }

    /// Roll the scroll region up by `n`, retiring rows into the scrollback only
    /// when the region is the whole screen — a partial region (a pager's status
    /// bar, a progress area) is in-place redraw, not history.
    pub fn scroll_up(&mut self, n: usize) {
        let whole = self.scroll_top == 0 && self.scroll_bottom + 1 == self.rows;
        let keep_history = whole && !self.on_alt_screen();
        for _ in 0..n.min(self.rows) {
            let row = self.screen.remove(self.scroll_top);
            if keep_history {
                self.scrollback.push_back(row);
                while self.scrollback.len() > HISTORY_LIMIT {
                    self.scrollback.pop_front();
                }
            }
            self.screen.insert(self.scroll_bottom, Row::blank(self.cols));
        }
    }

    pub fn scroll_down(&mut self, n: usize) {
        for _ in 0..n.min(self.rows) {
            self.screen.remove(self.scroll_bottom);
            self.screen.insert(self.scroll_top, Row::blank(self.cols));
        }
    }

    // ---- erasing -------------------------------------------------------------

    /// Erase within the cursor's row. `mode`: 0 to end, 1 to start, 2 all.
    pub fn erase_in_line(&mut self, mode: u16) {
        let col = self.cursor_col;
        let cols = self.cols;
        let row = &mut self.screen[self.cursor_row];
        let range = match mode {
            1 => 0..(col + 1).min(cols),
            2 => 0..cols,
            _ => col..cols,
        };
        for c in range.clone() {
            row.cells[c] = ' ';
        }
        row.clear_marks(range.start, range.end);
        row.wrapped = false;
        row.used = match mode {
            0 => row.used.min(col),
            _ => row.used,
        };
        if mode == 2 {
            row.used = 0;
        }
    }

    /// Erase within the screen. `mode`: 0 to end, 1 to start, 2 all,
    /// 3 all + scrollback.
    pub fn erase_in_display(&mut self, mode: u16) {
        match mode {
            1 => {
                for r in 0..self.cursor_row {
                    self.screen[r].clear();
                }
                self.erase_in_line(1);
            }
            2 | 3 => {
                for row in self.screen.iter_mut() {
                    row.clear();
                }
                if mode == 3 {
                    self.scrollback.clear();
                }
            }
            _ => {
                self.erase_in_line(0);
                for r in (self.cursor_row + 1)..self.rows {
                    self.screen[r].clear();
                }
            }
        }
    }

    pub fn erase_chars(&mut self, n: usize) {
        let col = self.cursor_col;
        let end = (col + n.max(1)).min(self.cols);
        let row = &mut self.screen[self.cursor_row];
        for c in col..end {
            row.cells[c] = ' ';
        }
        row.clear_marks(col, end);
    }

    pub fn insert_chars(&mut self, n: usize) {
        let col = self.cursor_col;
        let cols = self.cols;
        let row = &mut self.screen[self.cursor_row];
        for _ in 0..n.max(1).min(cols - col) {
            row.cells.insert(col, ' ');
            row.cells.truncate(cols);
        }
        row.clear_marks(col, cols);
        row.used = (row.used + n.max(1)).min(cols);
    }

    pub fn delete_chars(&mut self, n: usize) {
        let col = self.cursor_col;
        let cols = self.cols;
        let row = &mut self.screen[self.cursor_row];
        for _ in 0..n.max(1).min(cols - col) {
            row.cells.remove(col);
            row.cells.push(' ');
        }
        row.clear_marks(col, cols);
        row.used = row.used.saturating_sub(n.max(1)).max(col);
    }

    /// IL/DL operate inside the scroll region, below the cursor row.
    pub fn insert_lines(&mut self, n: usize) {
        if self.cursor_row < self.scroll_top || self.cursor_row > self.scroll_bottom {
            return;
        }
        for _ in 0..n.max(1).min(self.rows) {
            self.screen.remove(self.scroll_bottom);
            self.screen.insert(self.cursor_row, Row::blank(self.cols));
        }
    }

    pub fn delete_lines(&mut self, n: usize) {
        if self.cursor_row < self.scroll_top || self.cursor_row > self.scroll_bottom {
            return;
        }
        for _ in 0..n.max(1).min(self.rows) {
            self.screen.remove(self.cursor_row);
            self.screen.insert(self.scroll_bottom, Row::blank(self.cols));
        }
    }

    // ---- cursor + modes ------------------------------------------------------

    pub fn move_to(&mut self, row: usize, col: usize) {
        self.cursor_row = row.min(self.rows - 1);
        self.cursor_col = col.min(self.cols - 1);
        self.wrap_pending = false;
    }

    /// CUU/CUD stop at the scroll region's edge when the cursor starts inside
    /// it, so a program redrawing a bounded area can't walk out of it.
    pub fn cursor_up(&mut self, n: usize) {
        let limit = if self.cursor_row >= self.scroll_top {
            self.scroll_top
        } else {
            0
        };
        self.cursor_row = self.cursor_row.saturating_sub(n).max(limit);
        self.wrap_pending = false;
    }

    pub fn cursor_down(&mut self, n: usize) {
        let limit = if self.cursor_row <= self.scroll_bottom {
            self.scroll_bottom
        } else {
            self.rows - 1
        };
        self.cursor_row = (self.cursor_row + n).min(limit);
        self.wrap_pending = false;
    }

    pub fn cursor_left(&mut self, n: usize) {
        self.cursor_col = self.cursor_col.saturating_sub(n);
        self.wrap_pending = false;
    }

    pub fn cursor_right(&mut self, n: usize) {
        self.cursor_col = (self.cursor_col + n).min(self.cols - 1);
        self.wrap_pending = false;
    }

    pub fn save_cursor(&mut self) {
        self.saved_cursor = (self.cursor_row, self.cursor_col);
    }

    pub fn restore_cursor(&mut self) {
        let (r, c) = self.saved_cursor;
        self.move_to(r, c);
    }

    pub fn set_scroll_region(&mut self, top: usize, bottom: usize) {
        if top < bottom && bottom < self.rows {
            self.scroll_top = top;
            self.scroll_bottom = bottom;
        } else {
            self.scroll_top = 0;
            self.scroll_bottom = self.rows - 1;
        }
        self.move_to(self.scroll_top, 0);
    }

    pub fn enter_alt_screen(&mut self) {
        if self.alt_saved.is_some() {
            return;
        }
        self.alt_saved = Some((self.screen.clone(), self.cursor_row, self.cursor_col));
        self.screen = (0..self.rows).map(|_| Row::blank(self.cols)).collect();
        self.move_to(0, 0);
    }

    pub fn leave_alt_screen(&mut self) {
        if let Some((screen, row, col)) = self.alt_saved.take() {
            self.screen = screen;
            self.move_to(row, col);
        }
    }

    /// RIS — everything but the scrollback, which tmux also keeps across a reset.
    pub fn reset(&mut self) {
        self.alt_saved = None;
        self.last_drawn = None;
        for row in self.screen.iter_mut() {
            row.clear();
        }
        self.scroll_top = 0;
        self.scroll_bottom = self.rows - 1;
        self.autowrap = true;
        self.move_to(0, 0);
    }

    /// Drop the scrollback, keeping the visible screen — tmux's `clear-history`.
    pub fn clear_history(&mut self) {
        self.scrollback.clear();
    }

    // ---- reading -------------------------------------------------------------

    /// `capture-pane -p -J -S -<history>`: the last `history` scrollback rows
    /// followed by the whole screen, with wrapped rows re-joined into one line.
    /// Like tmux, the result can exceed `history` lines — the screen is always
    /// included in full — which is why callers tail it themselves.
    pub fn capture(&self, history: usize) -> String {
        let skip = self.scrollback.len().saturating_sub(history);
        let rows = self
            .scrollback
            .iter()
            .skip(skip)
            .chain(self.screen.iter());

        let mut out = String::new();
        let mut first = true;
        let mut open = false; // previous row wrapped, so this one continues it
        for row in rows {
            if !open && !first {
                out.push('\n');
            }
            out.push_str(&row.text());
            first = false;
            open = row.wrapped;
        }
        out
    }
}
