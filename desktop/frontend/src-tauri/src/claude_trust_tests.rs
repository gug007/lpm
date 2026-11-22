use super::*;

const FILE: &str = r#"{
  "numStartups": 12,
  "theme": "dark",
  "projects": {
    "/work/shop": {
      "allowedTools": [],
      "hasTrustDialogAccepted": true,
      "lastCost": 0.10000000000000001
    },
    "/work/blog": {
      "hasTrustDialogAccepted": false
    }
  },
  "zeta": {
    "b": 1,
    "a": 2
  }
}
"#;

fn keys(path: &str) -> Vec<String> {
    vec![path.to_string()]
}

#[test]
fn a_copy_of_a_trusted_folder_is_trusted_and_nothing_else_moves() {
    let next = with_copy_trusted(FILE, &keys("/work/shop"), "shop-Ab12Cd").unwrap().unwrap();
    let expected = FILE.replace(
        "    \"/work/blog\": {\n      \"hasTrustDialogAccepted\": false\n    }\n",
        "    \"/work/blog\": {\n      \"hasTrustDialogAccepted\": false\n    },\n    \"/work/shop-Ab12Cd\": {\n      \"hasTrustDialogAccepted\": true\n    }\n",
    );
    assert_eq!(next, expected, "only the copy's entry is added, in place, in Claude's own layout");
}

#[test]
fn a_folder_nobody_trusted_keeps_asking_in_its_copies() {
    assert!(with_copy_trusted(FILE, &keys("/work/blog"), "blog-x").unwrap().is_none());
    assert!(with_copy_trusted(FILE, &keys("/work/never-opened"), "never-opened-x").unwrap().is_none());
    assert!(with_copy_trusted("{\"theme\":\"dark\"}", &keys("/work/shop"), "shop-x").unwrap().is_none());
}

#[test]
fn a_copy_that_said_no_before_is_turned_to_yes_keeping_its_other_fields() {
    let text = FILE.replace(
        "\"/work/blog\": {\n      \"hasTrustDialogAccepted\": false\n    }",
        "\"/work/shop-Ab12Cd\": {\n      \"lastCost\": 2,\n      \"hasTrustDialogAccepted\": false\n    }",
    );
    let next = with_copy_trusted(&text, &keys("/work/shop"), "shop-Ab12Cd").unwrap().unwrap();
    assert!(next.contains("\"/work/shop-Ab12Cd\": {\n      \"lastCost\": 2,\n      \"hasTrustDialogAccepted\": true\n    }"));
}

#[test]
fn marking_twice_changes_nothing_the_second_time() {
    let once = with_copy_trusted(FILE, &keys("/work/shop"), "shop-Ab12Cd").unwrap().unwrap();
    assert!(with_copy_trusted(&once, &keys("/work/shop"), "shop-Ab12Cd").unwrap().is_none());
}

#[test]
fn the_copy_is_filed_in_the_spelling_the_source_was_found_under() {
    let text = FILE.replace("\"/work/shop\"", "\"C:/work/shop\"");
    let both = vec!["C:\\work\\shop".to_string(), "C:/work/shop".to_string()];
    let next = with_copy_trusted(&text, &both, "shop-x").unwrap().unwrap();
    assert!(next.contains("\"C:/work/shop-x\": {"));
}

#[test]
fn a_file_on_disk_is_replaced_whole_with_its_mode_kept() {
    let dir = std::env::temp_dir().join(format!("lpm-claude-trust-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let file = dir.join(".claude.json");
    std::fs::write(&file, FILE).unwrap();
    let _ = crate::fsperm::set_mode(&file, 0o600);
    carry_in(&file, &keys("/work/shop"), "shop-Ab12Cd").unwrap();
    let v: Value = serde_json::from_str(&std::fs::read_to_string(&file).unwrap()).unwrap();
    assert_eq!(v["projects"]["/work/shop-Ab12Cd"][TRUSTED], true);
    #[cfg(unix)]
    assert_eq!(crate::fsperm::mode(&std::fs::metadata(&file).unwrap()) & 0o777, 0o600);
    let leftovers: Vec<_> = std::fs::read_dir(&dir).unwrap().filter_map(Result::ok).collect();
    assert_eq!(leftovers.len(), 1, "no temp file left behind");
    let _ = std::fs::remove_dir_all(&dir);
}
