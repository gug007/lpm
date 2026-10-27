use regex::Regex;
use std::sync::LazyLock;

// Notes are Markdown; a search snippet shows the words a note reads as, not
// the markup around them. Emphasis needs a word character inside the marks,
// so `2 * 3 * 4` and snake_case names stay as written.
static LINE_MARKS: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?m)^[ \t]*(?:#{1,6}[ \t]+|>[ \t]?|[-*+][ \t]+(?:\[[ xX]\][ \t]+)?|\d+[.)][ \t]+)")
        .unwrap()
});
static FENCES: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?m)^[ \t]*(?:```|~~~)[^\n]*\n?").unwrap());
static LINKS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"!?\[([^\]\n]*)\]\([^)\n]*\)").unwrap());
static CODE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"`+([^`\n]+?)`+").unwrap());
static STRONG: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(\*\*|~~)(\S(?:[^\n]*?\S)?)(\*\*|~~)").unwrap());
static EMPHASIS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(^|[^\w*])\*(\S(?:[^*\n]*?\S)?)\*($|[^\w*])").unwrap());
static UNDERSCORE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(^|[^\w_])(?:__|_)(\S(?:[^_\n]*?\S)?)(?:__|_)($|[^\w_])").unwrap()
});

pub(crate) fn plain(text: &str) -> String {
    let text = FENCES.replace_all(text, "");
    let text = LINE_MARKS.replace_all(&text, "");
    let text = LINKS.replace_all(&text, "$1");
    let text = CODE.replace_all(&text, "$1");
    let text = STRONG.replace_all(&text, |c: &regex::Captures| {
        if c[1] == c[3] {
            c[2].to_string()
        } else {
            c[0].to_string()
        }
    });
    // Twice: a match takes the character after its closing mark, so the next
    // of two neighbours (`*a* *b*`) only matches on the second pass.
    let mut text = text.into_owned();
    for _ in 0..2 {
        text = EMPHASIS.replace_all(&text, "$1$2$3").into_owned();
        text = UNDERSCORE.replace_all(&text, "$1$2$3").into_owned();
    }
    text
}

#[cfg(test)]
mod tests {
    use super::plain;

    #[test]
    fn drops_inline_marks() {
        assert_eq!(
            plain("second note with **bold** and `code`"),
            "second note with bold and code"
        );
        assert_eq!(
            plain("an *em* word, _also_ this, ~~gone~~, __strong__"),
            "an em word, also this, gone, strong"
        );
        assert_eq!(plain("*a* *b*"), "a b");
        assert_eq!(
            plain("see [the docs](https://lpm.cx) and ![shot](a.png)"),
            "see the docs and shot"
        );
    }

    #[test]
    fn drops_line_marks_and_fences() {
        assert_eq!(
            plain("# Title\n> quoted\n- item\n1. step\n- [x] done"),
            "Title\nquoted\nitem\nstep\ndone"
        );
        assert_eq!(plain("run:\n```sh\nmake seed\n```\n"), "run:\nmake seed\n");
    }

    #[test]
    fn keeps_text_that_only_looks_like_markup() {
        assert_eq!(plain("2 * 3 * 4"), "2 * 3 * 4");
        assert_eq!(
            plain("set MAX_RETRY_COUNT and my_var"),
            "set MAX_RETRY_COUNT and my_var"
        );
        assert_eq!(plain("a ** b"), "a ** b");
    }
}
