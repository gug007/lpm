use super::*;
use serde_json::json;
use std::path::PathBuf;

fn ask(kind: &str, prompt: &str, cwd: &Path) -> Ask {
    Ask {
        kind: kind.into(),
        prompt: prompt.into(),
        cwd: cwd.to_string_lossy().into_owned(),
        ..Default::default()
    }
}

fn refused(planned: Result<Plan, String>) -> String {
    match planned {
        Err(e) => e,
        Ok(_) => panic!("it planned something it should refuse"),
    }
}

fn prefs_of(v: Value) -> Prefs {
    prefs(&v)
}

#[test]
fn settings_fall_back_to_asking_once_per_project_under_a_2_dollar_limit() {
    let p = prefs_of(json!({}));
    assert_eq!(p.approval, "project");
    assert_eq!(p.limit_cents, Some(200.0));
    assert!(p.keep_out_of_git);
    let p = prefs_of(
        json!({ "generateApproval": "always", "generateDailyLimit": 0, "generateKeepOutOfGit": false }),
    );
    assert_eq!(p.approval, "always");
    assert_eq!(p.limit_cents, None);
    assert!(!p.keep_out_of_git);
    assert_eq!(
        prefs_of(json!({ "generateApproval": "sometimes" })).approval,
        "project"
    );
}

#[test]
fn asking_follows_the_setting_but_a_missing_key_or_the_limit_always_asks() {
    assert!(!must_ask("always", false, false, false));
    assert!(must_ask("always", true, true, false));
    assert!(must_ask("always", true, false, true));
    assert!(must_ask("each", true, false, false));
    assert!(must_ask("project", false, false, false));
    assert!(!must_ask("project", true, false, false));
}

#[test]
fn today_reads_as_a_sentence() {
    assert_eq!(
        today_words(6, 2, 31.0, Some(200.0)),
        "Today: 6 images and 2 clips, 31¢ of your $2 limit"
    );
    assert_eq!(today_words(1, 0, 3.4, None), "Today: 1 image, 3¢");
    assert_eq!(
        today_words(0, 0, 0.0, Some(250.0)),
        "Nothing made today. Daily limit $2.50"
    );
    assert_eq!(
        today_words(0, 1, 120.0, Some(500.0)),
        "Today: 1 clip, $1.20 of your $5 limit"
    );
}

#[test]
fn an_image_plan_takes_the_default_model_and_a_free_name_in_generated() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir(dir.path().join(".git")).unwrap();
    let sub = dir.path().join("src");
    std::fs::create_dir(&sub).unwrap();
    let mut a = ask("image", "A giraffe flying a plane", &sub);
    a.aspect = "16:9".into();
    let p = plan(&a, &prefs_of(json!({}))).unwrap();
    assert_eq!(p.model.id, "nano-banana");
    assert_eq!(p.aspect, Some("16:9"));
    assert_eq!(
        p.out,
        dir.path().join("generated/a-giraffe-flying-a-plane.png")
    );
    assert!(!p.named);
    assert_eq!(
        shown(&p.out, &p.root),
        "generated/a-giraffe-flying-a-plane.png"
    );
    assert_eq!(details(&p), vec!["16:9".to_string()]);
}

#[test]
fn a_plan_refuses_what_it_cant_make() {
    let dir = tempfile::tempdir().unwrap();
    let base = prefs_of(json!({}));
    assert!(plan(&ask("video", "x", dir.path()), &base).is_err());
    assert!(plan(&ask("image", "  ", dir.path()), &base).is_err());
    let mut a = ask("image", "fox", dir.path());
    a.aspect = "7:3".into();
    assert!(refused(plan(&a, &base)).contains("aspect"));
    let mut a = ask("image", "fox", dir.path());
    a.model = "gpt-image".into();
    a.size = "2K".into();
    assert!(refused(plan(&a, &base)).contains("--size"));
    let mut a = ask("speech", "hello", dir.path());
    a.voice = "robot".into();
    assert!(refused(plan(&a, &base)).contains("no voice called robot"));
    assert!(plan(&ask("image", "fox", Path::new("relative/dir")), &base).is_err());
}

#[test]
fn a_speech_plan_uses_the_saved_voice_and_the_format_as_extension() {
    let dir = tempfile::tempdir().unwrap();
    let mut a = ask("speech", "Hello there.", dir.path());
    a.format = "wav".into();
    a.out = "intro".into();
    let p = plan(&a, &prefs_of(json!({ "generateVoice": "cedar" }))).unwrap();
    assert_eq!(p.voice, "cedar");
    assert_eq!(p.out, dir.path().join("intro.wav"));
    assert!(p.named);
    assert_eq!(
        details(&p),
        vec!["Cedar voice".to_string(), "wav".to_string()]
    );
}

#[test]
fn an_image_keeps_the_extension_of_what_came_back() {
    let out = Path::new("/p/logo.jpg");
    assert_eq!(
        settle_extension(out, "image/png", Kind::Image),
        PathBuf::from("/p/logo.png")
    );
    assert_eq!(
        settle_extension(out, "image/jpeg", Kind::Image),
        PathBuf::from("/p/logo.jpg")
    );
    assert_eq!(
        settle_extension(Path::new("/p/a.jpeg"), "image/jpeg", Kind::Image),
        PathBuf::from("/p/a.jpeg")
    );
    assert_eq!(
        settle_extension(Path::new("/p/a.mp3"), "audio/mp3", Kind::Speech),
        PathBuf::from("/p/a.mp3")
    );
}
