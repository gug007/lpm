use super::shell_quote;

/// The same texts and quoting as terminal-io.test.ts.
const QUOTED: [(&str, &str); 6] = [
    ("it's", r"'it'\''s'"),
    (r"x\'; y", r#"'x'"\\"''\''; y'"#),
    (r"trailing\", r#"'trailing'"\\"''"#),
    (r"two\\ and\\'", r#"'two'"\\\\"' and'"\\\\"''\'''"#),
    (r"C:\Users\me x", r"'C:\Users\me x'"),
    ("$(id) `id` $HOME !!", "'$(id) `id` $HOME !!'"),
];

#[test]
fn quotes_for_every_shell() {
    for (text, quoted) in QUOTED {
        assert_eq!(shell_quote(text), quoted);
    }
    assert_eq!(shell_quote(""), "''");
}

#[cfg(unix)]
#[test]
fn a_shell_reads_it_as_it_was() {
    let more = [
        "x\\'; echo RAN; echo \\'",
        "one\n; echo RAN\n'",
        "é ' \\\\\\' ü",
    ];
    for text in QUOTED.iter().map(|(text, _)| *text).chain(more) {
        let script = format!("printf %s {}", shell_quote(text));
        let out = crate::osproc::command("/bin/sh")
            .args(["-c", &script])
            .output()
            .unwrap();
        assert_eq!(String::from_utf8_lossy(&out.stdout), text);
    }
}
