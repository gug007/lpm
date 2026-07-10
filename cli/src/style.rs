//! Shared ANSI styling. `on` is set from `stdout().is_terminal()` so piped or
//! redirected output stays plain, while an interactive terminal gets color.

/// ANSI color/attribute helper. All methods pass text through unchanged when
/// `on` is false.
pub struct Style {
    pub on: bool,
}

impl Style {
    fn paint(&self, code: &str, s: &str) -> String {
        if self.on {
            format!("\x1b[{code}m{s}\x1b[0m")
        } else {
            s.to_string()
        }
    }
    pub fn bold(&self, s: &str) -> String {
        self.paint("1", s)
    }
    pub fn dim(&self, s: &str) -> String {
        self.paint("2", s)
    }
    pub fn green(&self, s: &str) -> String {
        self.paint("32", s)
    }
    pub fn red(&self, s: &str) -> String {
        self.paint("31", s)
    }
    pub fn cyan(&self, s: &str) -> String {
        self.paint("36", s)
    }
    pub fn yellow(&self, s: &str) -> String {
        self.paint("33", s)
    }
    pub fn blue(&self, s: &str) -> String {
        self.paint("34", s)
    }
}
