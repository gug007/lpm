use super::write_file_if_unchanged;

#[test]
fn a_file_that_is_not_utf8_is_left_as_it_is() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("legacy.txt");
    let latin1 = b"caf\xe9 = \"ol\xe9\"\nline two\n";
    std::fs::write(&path, latin1).unwrap();
    let shown = String::from_utf8_lossy(latin1).into_owned();

    let err = write_file_if_unchanged(
        path.to_str().unwrap().to_string(),
        shown.clone(),
        format!("x{shown}"),
    )
    .err()
    .unwrap();

    assert!(err.starts_with("legacy.txt isn't UTF-8 text"), "{err}");
    assert_eq!(std::fs::read(&path).unwrap(), latin1);
}

#[test]
fn utf8_text_with_accents_still_saves() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("notes.txt");
    std::fs::write(&path, "café\n").unwrap();

    let res = write_file_if_unchanged(
        path.to_str().unwrap().to_string(),
        "café\n".into(),
        "café olé\n".into(),
    )
    .unwrap();

    assert!(res.written);
    assert_eq!(std::fs::read_to_string(&path).unwrap(), "café olé\n");
}
