use super::*;

fn stream(text: &[u8]) -> Result<(Vec<u8>, Received), String> {
    let mut out = Vec::new();
    let received = receive(&mut &text[..], &mut out, &mut |_, _| {})?;
    Ok((out, received))
}

#[test]
fn takes_the_size_then_exactly_that_many_bytes() {
    let (out, received) = stream(b"lpm-file-size:3\nabcdef").unwrap();
    assert_eq!(out, b"abc");
    assert_eq!(received, Some((3, 3)));
}

#[test]
fn a_shell_profile_printing_first_stays_out_of_the_file() {
    let (out, _) = stream(b"Welcome back\nno newline herelpm-file-size:2\nhi").unwrap();
    assert_eq!(out, b"hi");
}

#[test]
fn a_file_body_holding_the_mark_is_kept() {
    let (out, received) = stream(b"lpm-file-size:18\nlpm-file-size:999\nx").unwrap();
    assert_eq!(out, b"lpm-file-size:999\n");
    assert_eq!(received, Some((18, 18)));
}

#[test]
fn an_empty_file_is_a_whole_file() {
    assert_eq!(stream(b"lpm-file-size:0\n").unwrap().1, Some((0, 0)));
}

#[test]
fn no_size_line_is_reported_as_none() {
    assert_eq!(stream(b"").unwrap().1, None);
    assert_eq!(stream(b"only a banner\n").unwrap().1, None);
}

#[test]
fn an_early_end_shows_as_fewer_bytes_than_the_size() {
    assert_eq!(stream(b"lpm-file-size:9\nabc").unwrap().1, Some((3, 9)));
}

#[test]
fn a_failed_write_here_is_not_mistaken_for_the_connection() {
    struct Full;
    impl Write for Full {
        fn write(&mut self, _: &[u8]) -> io::Result<usize> {
            Err(io::Error::other("disk full"))
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }
    let received = receive(&mut &b"lpm-file-size:2\nhi"[..], &mut Full, &mut |_, _| {});
    assert_eq!(
        settle(received, false, "broken pipe", "a.txt"),
        Err("disk full".to_string())
    );
}

#[test]
fn settle_names_what_went_wrong() {
    let done = |pair| Ok(Some(pair));
    assert_eq!(settle(done((3, 3)), true, "", "a.txt"), Ok(()));
    assert_eq!(
        settle(done((3, 3)), true, "a warning", "a.txt"),
        Ok(()),
        "ssh warns on stderr on success too"
    );
    assert_eq!(
        settle(Ok(None), false, "a.txt isn't a file", "a.txt"),
        Err("a.txt isn't a file".to_string())
    );
    assert_eq!(
        settle(done((1, 3)), true, "", "a.txt"),
        Err("a.txt changed while it was being read".to_string())
    );
    let closed = Err("The connection closed before a.txt finished downloading".to_string());
    assert_eq!(settle(done((1, 3)), false, "", "a.txt"), closed);
    assert_eq!(settle(Ok(None), false, "", "a.txt"), closed);
}

#[test]
fn paired_paths_join_on_any_host() {
    assert_eq!(join_host_path("/srv/app", "a/b.txt"), "/srv/app/a/b.txt");
    assert_eq!(join_host_path("/srv/app/", "a.txt"), "/srv/app/a.txt");
    assert_eq!(join_host_path("~/app", "a.txt"), "~/app/a.txt");
    assert_eq!(join_host_path("C:\\work\\", "a.txt"), "C:\\work/a.txt");
}

#[test]
fn reports_come_at_a_pace_but_the_last_always_lands() {
    let start = Instant::now();
    let mut pace = Pace::default();
    assert!(pace.due(0, 0, start));
    assert!(!pace.due(1, 100, start + PROGRESS_EVERY / 2));
    assert!(pace.due(2, 100, start + PROGRESS_EVERY));
    assert!(pace.due(100, 100, start + PROGRESS_EVERY));
}

#[cfg(unix)]
mod on_a_real_shell {
    use super::*;
    use std::process::{Command, Output};
    use std::time::Duration;

    fn send(dir: &Path, target: &str, preamble: &str) -> Output {
        Command::new("sh")
            .current_dir(dir)
            .args(["-c", &format!("{preamble}{SEND_SCRIPT}"), "sh", target])
            .output()
            .unwrap()
    }

    fn received(dir: &Path, name: &str) -> (Vec<u8>, Received) {
        let sent = send(dir, &format!("./{name}"), "");
        assert!(sent.status.success(), "{sent:?}");
        stream(&sent.stdout).unwrap()
    }

    #[test]
    fn every_byte_value_survives() {
        let dir = tempfile::tempdir().unwrap();
        let bytes: Vec<u8> = (0..=255).cycle().take(300_000).collect();
        std::fs::write(dir.path().join("blob.bin"), &bytes).unwrap();
        let (out, size) = received(dir.path(), "blob.bin");
        assert_eq!(out, bytes);
        assert_eq!(size, Some((300_000, 300_000)));
    }

    #[test]
    fn awkward_names_reach_the_file() {
        let dir = tempfile::tempdir().unwrap();
        for name in ["with space.txt", "-dash.txt", "it's.txt", "квитанция.txt"] {
            std::fs::write(dir.path().join(name), name).unwrap();
            assert_eq!(received(dir.path(), name).0, name.as_bytes());
        }
    }

    #[test]
    fn an_empty_file_sends_only_its_size() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("empty"), "").unwrap();
        assert_eq!(received(dir.path(), "empty"), (vec![], Some((0, 0))));
    }

    #[test]
    fn a_profiles_noise_is_left_out() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.txt"), "body").unwrap();
        let sent = send(
            dir.path(),
            "./a.txt",
            "echo hello from bashrc\nprintf nonl\n",
        );
        assert_eq!(stream(&sent.stdout).unwrap().0, b"body");
    }

    #[test]
    fn a_folder_and_a_missing_file_are_refused() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("folder")).unwrap();
        for name in ["folder", "gone.txt"] {
            let sent = send(dir.path(), &format!("./{name}"), "");
            assert!(!sent.status.success());
            assert!(sent.stdout.is_empty());
            let stderr = String::from_utf8_lossy(&sent.stderr);
            assert_eq!(stderr.trim(), format!("{name} isn't a file"));
        }
    }

    #[test]
    fn a_fifo_is_refused_instead_of_hanging() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("pipe");
        let made = Command::new("mkfifo").arg(&path).status().unwrap();
        assert!(made.success());
        let refused = send(dir.path(), "./pipe", "");
        assert_eq!(
            String::from_utf8_lossy(&refused.stderr).trim(),
            "pipe isn't a file"
        );
    }

    #[test]
    fn stopping_ends_the_process_even_mid_read() {
        let mut child = Command::new("sleep").arg("30").spawn().unwrap();
        let transfer = Transfer::default();
        transfer.track(child.id());
        transfer.stop();
        let status = child.wait().unwrap();
        assert!(!status.success());
        assert!(transfer.stopped());
    }

    #[test]
    fn a_stop_that_came_first_ends_the_process_as_it_starts() {
        let mut child = Command::new("sleep").arg("30").spawn().unwrap();
        let transfer = Transfer::default();
        transfer.stop();
        transfer.track(child.id());
        let started = Instant::now();
        assert!(!child.wait().unwrap().success());
        assert!(started.elapsed() < Duration::from_secs(5));
    }
}
