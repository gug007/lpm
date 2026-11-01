//! Finds credentials in the lines a commit would add: well-known key formats
//! and `.env` files. Pure, so the patterns are tested without a repository.
//! A finding carries a masked value only; the secret itself never leaves here.
use std::sync::OnceLock;

use regex::Regex;
use serde::Serialize;

const MAX_FINDINGS: usize = 100;
const MAX_LINE: usize = 8192;
const MASK: &str = "••••";
const SHOWN_TAIL: usize = 2;

#[derive(Debug, Serialize, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SecretFinding {
    pub path: String,
    // 1-based line in the new file; 0 for a finding about the whole file.
    pub line: u32,
    pub rule: String,
    pub masked: String,
}

struct Rule {
    label: &'static str,
    pattern: &'static str,
    // Leading characters that name the kind of key rather than the key itself,
    // so they can be shown unmasked.
    prefix: usize,
}

const RULES: &[Rule] = &[
    Rule { label: "AWS access key ID", pattern: r"\b((?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16})\b", prefix: 4 },
    Rule {
        label: "AWS secret access key",
        pattern: r#"(?i)aws_?secret_?access_?key["']?\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})\b"#,
        prefix: 0,
    },
    Rule { label: "Stripe secret key", pattern: r"\b(sk_live_[0-9A-Za-z]{20,})", prefix: 8 },
    Rule { label: "Stripe restricted key", pattern: r"\b(rk_live_[0-9A-Za-z]{20,})", prefix: 8 },
    Rule { label: "GitHub token", pattern: r"\b((?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,})", prefix: 4 },
    Rule { label: "GitHub token", pattern: r"\b(github_pat_[A-Za-z0-9_]{50,})", prefix: 11 },
    Rule { label: "Anthropic API key", pattern: r"\b(sk-ant-[A-Za-z0-9_\-]{20,})", prefix: 7 },
    Rule {
        label: "OpenAI API key",
        pattern: r"\b(sk-(?:proj|svcacct|admin)-[A-Za-z0-9_\-]{40,})",
        prefix: 3,
    },
    Rule { label: "OpenAI API key", pattern: r"\b(sk-[A-Za-z0-9_\-]{10,}T3BlbkFJ[A-Za-z0-9_\-]{10,})", prefix: 3 },
    Rule { label: "Slack token", pattern: r"\b(xox[abposr]-[A-Za-z0-9\-]{10,})", prefix: 5 },
    Rule {
        label: "Slack webhook URL",
        pattern: r"(https://hooks\.slack\.com/services/T[A-Za-z0-9_]+/B[A-Za-z0-9_]+/[A-Za-z0-9_]+)",
        prefix: 32,
    },
    Rule { label: "Google API key", pattern: r"\b(AIza[0-9A-Za-z_\-]{35})", prefix: 4 },
    Rule {
        label: "Private key",
        pattern: r"(-----BEGIN (?:[A-Z]+ )*PRIVATE KEY(?: BLOCK)?-----)",
        prefix: usize::MAX,
    },
];

fn compiled() -> &'static [(Regex, &'static Rule)] {
    static CELL: OnceLock<Vec<(Regex, &'static Rule)>> = OnceLock::new();
    CELL.get_or_init(|| {
        RULES
            .iter()
            .map(|r| (Regex::new(r.pattern).expect("secret rule compiles"), r))
            .collect()
    })
}

/// The value with only its kind prefix and last characters showing:
/// `sk_live_••••Qx`. A value too short to keep a tail shows its prefix only.
pub fn mask(value: &str, prefix: usize) -> String {
    let chars: Vec<char> = value.chars().collect();
    if prefix >= chars.len() {
        return value.to_string();
    }
    let head: String = chars[..prefix].iter().collect();
    if chars.len() < prefix + 8 {
        return format!("{head}{MASK}");
    }
    let tail: String = chars[chars.len() - SHOWN_TAIL..].iter().collect();
    format!("{head}{MASK}{tail}")
}

/// Every key format found on one added line, masked.
pub fn scan_line(text: &str) -> Vec<(&'static str, String)> {
    if text.len() > MAX_LINE {
        return Vec::new();
    }
    let mut found: Vec<(&'static str, String, usize)> = Vec::new();
    for (re, rule) in compiled() {
        for caps in re.captures_iter(text) {
            let Some(m) = caps.get(1) else { continue };
            // A narrower rule (Anthropic's sk-ant-) wins over a broader one
            // that matched the same text.
            if found.iter().any(|(_, _, start)| *start == m.start()) {
                continue;
            }
            found.push((rule.label, mask(m.as_str(), rule.prefix), m.start()));
        }
    }
    found.sort_by_key(|(_, _, start)| *start);
    found.into_iter().map(|(label, masked, _)| (label, masked)).collect()
}

/// A dotenv file meant to hold real values: `.env`, `.env.local`, `prod.env`,
/// but not the checked-in templates (`.env.example`, `.env.sample`, …).
pub fn is_env_file(path: &str) -> bool {
    let name = path.rsplit(['/', '\\']).next().unwrap_or(path).to_ascii_lowercase();
    const TEMPLATES: [&str; 5] = ["example", "sample", "template", "dist", "defaults"];
    if TEMPLATES.iter().any(|t| name.ends_with(&format!(".{t}"))) {
        return false;
    }
    name == ".env" || name.starts_with(".env.") || name.ends_with(".env")
}

fn diff_path(header: &str) -> Option<String> {
    let raw = header.trim();
    if raw == "/dev/null" {
        return None;
    }
    let unquoted = raw
        .strip_prefix('"')
        .and_then(|s| s.strip_suffix('"'))
        .unwrap_or(raw);
    Some(unquoted.strip_prefix("b/").unwrap_or(unquoted).to_string())
}

fn hunk_new_start(header: &str) -> u32 {
    header
        .split_whitespace()
        .find_map(|part| part.strip_prefix('+'))
        .and_then(|range| range.split(',').next())
        .and_then(|n| n.parse().ok())
        .unwrap_or(1)
}

/// Findings in a unified diff of the changes about to be committed: each key
/// on an added line, and each `.env` file that is added or changed.
pub fn scan_diff(diff: &str) -> Vec<SecretFinding> {
    let mut out = Vec::new();
    let mut path: Option<String> = None;
    let mut in_hunk = false;
    let mut line = 0u32;
    for row in diff.lines() {
        if out.len() >= MAX_FINDINGS {
            break;
        }
        if row.starts_with("diff --git ") {
            in_hunk = false;
            path = None;
            continue;
        }
        if !in_hunk {
            if let Some(rest) = row.strip_prefix("+++ ") {
                path = diff_path(rest);
                if let Some(p) = path.as_deref().filter(|p| is_env_file(p)) {
                    out.push(SecretFinding {
                        path: p.to_string(),
                        line: 0,
                        rule: "Environment file".into(),
                        masked: String::new(),
                    });
                }
                continue;
            }
        }
        if row.starts_with("@@") {
            in_hunk = true;
            line = hunk_new_start(row);
            continue;
        }
        if !in_hunk {
            continue;
        }
        match row.as_bytes().first() {
            Some(b'+') => {
                if let Some(p) = path.as_deref() {
                    for (rule, masked) in scan_line(&row[1..]) {
                        out.push(SecretFinding {
                            path: p.to_string(),
                            line,
                            rule: rule.to_string(),
                            masked,
                        });
                    }
                }
                line += 1;
            }
            Some(b' ') => line += 1,
            _ => {}
        }
    }
    out.truncate(MAX_FINDINGS);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fake(prefix: &str, body_len: usize) -> String {
        let alphabet = "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0";
        let body: String = alphabet.chars().cycle().take(body_len).collect();
        format!("{prefix}{body}")
    }

    #[test]
    fn masks_all_but_the_kind_and_the_tail() {
        assert_eq!(mask("sk_live_abcdefghijklmnopQx", 8), "sk_live_••••Qx");
        assert_eq!(mask("AKIA1234", 4), "AKIA••••");
        assert_eq!(mask("-----BEGIN PRIVATE KEY-----", usize::MAX), "-----BEGIN PRIVATE KEY-----");
    }

    #[test]
    fn finds_each_key_format() {
        let cases = [
            (format!("const k = \"{}\";", fake("AKIA", 16).to_uppercase()), "AWS access key ID"),
            (format!("aws_secret_access_key = {}", fake("", 40)), "AWS secret access key"),
            (format!("STRIPE={}", fake("sk_live_", 24)), "Stripe secret key"),
            (format!("STRIPE={}", fake("rk_live_", 24)), "Stripe restricted key"),
            (format!("token: {}", fake("ghp_", 36)), "GitHub token"),
            (format!("token: {}", fake("github_pat_", 70)), "GitHub token"),
            (format!("ANTHROPIC_API_KEY={}", fake("sk-ant-api03-", 40)), "Anthropic API key"),
            (format!("OPENAI_API_KEY={}", fake("sk-proj-", 60)), "OpenAI API key"),
            (format!("key = {}T3BlbkFJ{}", fake("sk-", 20), fake("", 20)), "OpenAI API key"),
            (format!("slack = {}", fake("xoxb-", 30)), "Slack token"),
            (format!("maps: {}", fake("AIza", 35)), "Google API key"),
            ("-----BEGIN RSA PRIVATE KEY-----".to_string(), "Private key"),
            ("-----BEGIN OPENSSH PRIVATE KEY-----".to_string(), "Private key"),
        ];
        for (line, rule) in cases {
            let found = scan_line(&line);
            assert_eq!(found.len(), 1, "{line}: {found:?}");
            assert_eq!(found[0].0, rule, "{line}");
            assert!(found[0].1.contains("••••") || rule == "Private key", "{line}");
        }
    }

    #[test]
    fn an_anthropic_key_is_not_also_reported_as_openai() {
        let key = format!("{}T3BlbkFJ{}", fake("sk-ant-api03-", 30), fake("", 30));
        let found = scan_line(&key);
        assert_eq!(found.len(), 1, "{found:?}");
        assert_eq!(found[0].0, "Anthropic API key");
        assert!(found[0].1.starts_with("sk-ant-••••"));
    }

    #[test]
    fn ignores_look_alikes() {
        let stripe_test = format!("const testKey = \"{}\";", fake("sk_test_", 24));
        for line in [
            stripe_test.as_str(),
            "className=\"sk-something-really-long-name\"",
            "-----BEGIN PUBLIC KEY-----",
            "AKIA_NOT_A_KEY",
            "ghp_short",
        ] {
            assert!(scan_line(line).is_empty(), "{line}");
        }
    }

    #[test]
    fn recognises_env_files_but_not_templates() {
        for path in [".env", "app/.env.local", ".env.production", "deploy/prod.env"] {
            assert!(is_env_file(path), "{path}");
        }
        for path in [".env.example", "config/.env.sample", ".env.template", ".envrc", "env.ts", "src/environment.ts"] {
            assert!(!is_env_file(path), "{path}");
        }
    }

    #[test]
    fn reports_added_lines_with_their_new_line_numbers() {
        let key = fake("sk_live_", 24);
        let diff = format!(
            "diff --git a/src/lib/stripe.ts b/src/lib/stripe.ts\n\
             --- a/src/lib/stripe.ts\n\
             +++ b/src/lib/stripe.ts\n\
             @@ -10,3 +10,4 @@ import Stripe\n \
             const a = 1;\n\
             -const old = \"{key}\";\n\
             +const b = 2;\n\
             +const key = \"{key}\";\n \
             export {{}};\n"
        );
        let found = scan_diff(&diff);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].path, "src/lib/stripe.ts");
        assert_eq!(found[0].line, 12);
        assert_eq!(found[0].rule, "Stripe secret key");
        assert!(!found[0].masked.contains(&key[8..20]));
    }

    #[test]
    fn flags_new_env_files_and_not_deleted_ones() {
        let diff = "diff --git a/.env b/.env\n\
                    new file mode 100644\n\
                    --- /dev/null\n\
                    +++ b/.env\n\
                    @@ -0,0 +1 @@\n\
                    +DEBUG=1\n\
                    diff --git a/old/.env b/old/.env\n\
                    deleted file mode 100644\n\
                    --- a/old/.env\n\
                    +++ /dev/null\n\
                    @@ -1 +0,0 @@\n\
                    -DEBUG=1\n";
        let found = scan_diff(diff);
        assert_eq!(
            found,
            vec![SecretFinding {
                path: ".env".into(),
                line: 0,
                rule: "Environment file".into(),
                masked: String::new(),
            }]
        );
    }

    #[test]
    fn treats_plus_plus_plus_inside_a_hunk_as_content() {
        let key = fake("ghp_", 36);
        let diff = format!(
            "diff --git a/a.md b/a.md\n--- a/a.md\n+++ b/a.md\n@@ -1 +1,2 @@\n line\n+++ {key}\n"
        );
        let found = scan_diff(&diff);
        assert_eq!(found.len(), 1);
        assert_eq!((found[0].path.as_str(), found[0].line), ("a.md", 2));
    }

    #[test]
    fn reads_quoted_paths() {
        let key = fake("AIza", 35);
        let diff = format!(
            "diff --git \"a/my dir/x.js\" \"b/my dir/x.js\"\n--- \"a/my dir/x.js\"\n+++ \"b/my dir/x.js\"\n@@ -0,0 +1 @@\n+k=\"{key}\"\n"
        );
        assert_eq!(scan_diff(&diff)[0].path, "my dir/x.js");
    }
}
