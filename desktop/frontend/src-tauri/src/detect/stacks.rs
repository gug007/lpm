//! Everything that is neither Node nor Python: Procfiles, Rails, Laravel,
//! Phoenix, Spring Boot, .NET, Go, Cargo, Docker Compose, and the make/just
//! fallback for folders that declare nothing else.

use super::{expand, Candidate};
use std::path::Path;

const TASKS: &[&str] = &["dev", "serve", "run", "start"];

fn read(dir: &Path, file: &str) -> Option<String> {
    std::fs::read_to_string(dir.join(file)).ok()
}

fn has(dir: &Path, file: &str) -> bool {
    dir.join(file).exists()
}

/// Every process a Procfile declares, one service each. `Procfile.dev` wins
/// over `Procfile`, whose lines are usually production commands; `release` is
/// a deploy hook, not a process.
pub(crate) fn procfile(dir: &Path) -> Vec<Candidate> {
    let Some(text) = read(dir, "Procfile.dev").or_else(|| read(dir, "Procfile")) else {
        return vec![];
    };
    text.lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                return None;
            }
            let (name, cmd) = line.split_once(':')?;
            let (name, cmd) = (name.trim(), cmd.trim());
            if name.is_empty() || cmd.is_empty() || name == "release" {
                return None;
            }
            Some(Candidate::new(name, cmd, "proc"))
        })
        .collect()
}

pub(crate) fn rails(dir: &Path) -> Option<Candidate> {
    let gemfile = read(dir, "Gemfile")?;
    if !gem_listed(&gemfile, "rails") || !has(dir, "bin/rails") {
        return None;
    }
    let cmd = if has(dir, "bin/dev") {
        "bin/dev"
    } else {
        "bin/rails server"
    };
    Some(Candidate::new("web", cmd, "rails").or_port(Some(3000)))
}

fn gem_listed(gemfile: &str, gem: &str) -> bool {
    gemfile.lines().any(|line| {
        let line = line.trim();
        line.starts_with("gem ")
            && (line.contains(&format!("'{gem}'")) || line.contains(&format!("\"{gem}\"")))
    })
}

pub(crate) fn laravel(dir: &Path) -> Option<Candidate> {
    has(dir, "artisan")
        .then(|| Candidate::new("web", "php artisan serve", "laravel").or_port(Some(8000)))
}

pub(crate) fn phoenix(dir: &Path) -> Option<Candidate> {
    read(dir, "mix.exs")?
        .contains(":phoenix")
        .then(|| Candidate::new("web", "mix phx.server", "phoenix").or_port(Some(4000)))
}

pub(crate) fn spring(dir: &Path) -> Option<Candidate> {
    let cmd = if read(dir, "pom.xml").is_some_and(|pom| pom.contains("spring-boot")) {
        if has(dir, "mvnw") {
            "./mvnw spring-boot:run"
        } else {
            "mvn spring-boot:run"
        }
    } else if ["build.gradle", "build.gradle.kts"]
        .iter()
        .any(|f| read(dir, f).is_some_and(|b| b.contains("org.springframework.boot")))
    {
        if has(dir, "gradlew") {
            "./gradlew bootRun"
        } else {
            "gradle bootRun"
        }
    } else {
        return None;
    };
    Some(Candidate::new("web", cmd, "spring").or_port(Some(8080)))
}

pub(crate) fn dotnet(dir: &Path) -> Option<Candidate> {
    let projects = std::fs::read_dir(dir)
        .ok()?
        .filter_map(Result::ok)
        .filter(|e| e.path().extension().is_some_and(|ext| ext == "csproj"))
        .count();
    (projects == 1).then(|| Candidate::new("app", "dotnet watch run", "dotnet"))
}

pub(crate) fn go(dir: &Path) -> Vec<Candidate> {
    if !has(dir, "go.mod") {
        return vec![];
    }
    if has(dir, ".air.toml") || has(dir, "air.toml") {
        return vec![Candidate::new("app", "air", "go")];
    }
    if has(dir, "main.go") {
        return vec![Candidate::new("app", "go run .", "go")];
    }
    let mut names: Vec<String> = expand(dir, "cmd/*")
        .into_iter()
        .filter(|d| d.join("main.go").exists())
        .filter_map(|d| d.file_name().map(|n| n.to_string_lossy().into_owned()))
        .collect();
    names.sort();
    names
        .into_iter()
        .map(|name| Candidate::new(name.clone(), format!("go run ./cmd/{name}"), "go"))
        .collect()
}

pub(crate) fn cargo(dir: &Path) -> Vec<Candidate> {
    let Some(doc) = cargo_manifest(dir) else {
        return vec![];
    };
    if doc.get("package").is_some() {
        let runnable = has(dir, "src/main.rs") || doc.get("bin").is_some();
        return if runnable {
            vec![Candidate::new("app", "cargo run", "cargo")]
        } else {
            vec![]
        };
    }
    let members = doc
        .get("workspace")
        .and_then(|w| w.get("members"))
        .and_then(|m| m.as_array());
    let mut out: Vec<Candidate> = members
        .into_iter()
        .flatten()
        .filter_map(|v| v.as_str())
        .flat_map(|pattern| expand(dir, pattern))
        .filter(|member| member.join("src/main.rs").exists())
        .filter_map(|member| {
            let name = cargo_manifest(&member)?
                .get("package")?
                .get("name")?
                .as_str()?
                .to_string();
            Some(Candidate::new(
                name.clone(),
                format!("cargo run -p {name}"),
                "cargo",
            ))
        })
        .collect();
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

fn cargo_manifest(dir: &Path) -> Option<toml_edit::DocumentMut> {
    read(dir, "Cargo.toml")?.parse().ok()
}

pub(crate) fn compose(dir: &Path) -> Option<Candidate> {
    [
        "docker-compose.yml",
        "docker-compose.yaml",
        "compose.yml",
        "compose.yaml",
    ]
    .iter()
    .any(|f| has(dir, f))
    .then(|| Candidate::new("compose", "docker compose up", "compose"))
}

/// A `make dev` / `just dev` for folders whose only hint is a task runner.
pub(crate) fn task_runner(dir: &Path) -> Option<Candidate> {
    if let Some(text) = read(dir, "Makefile").or_else(|| read(dir, "makefile")) {
        let targets = make_targets(&text);
        if let Some(task) = TASKS.iter().find(|t| targets.iter().any(|x| x == *t)) {
            return Some(Candidate::new("app", format!("make {task}"), "make"));
        }
    }
    let justfile = read(dir, "justfile")
        .or_else(|| read(dir, "Justfile"))
        .or_else(|| read(dir, ".justfile"))?;
    let recipes = just_recipes(&justfile);
    let task = TASKS.iter().find(|t| recipes.iter().any(|x| x == *t))?;
    Some(Candidate::new("app", format!("just {task}"), "just"))
}

fn make_targets(text: &str) -> Vec<String> {
    text.lines()
        .filter(|line| !line.is_empty() && !line.starts_with(['\t', ' ', '#', '.']))
        .filter_map(|line| {
            let (head, rest) = line.split_once(':')?;
            if rest.starts_with('=') || head.contains(['=', '$', '%']) {
                return None;
            }
            Some(
                head.split_whitespace()
                    .map(str::to_string)
                    .collect::<Vec<_>>(),
            )
        })
        .flatten()
        .collect()
}

fn just_recipes(text: &str) -> Vec<String> {
    text.lines()
        .filter(|line| !line.is_empty() && !line.starts_with([' ', '\t', '#']))
        .filter_map(|line| {
            let (head, rest) = line.split_once(':')?;
            if rest.starts_with('=') {
                return None;
            }
            head.split_whitespace()
                .next()
                .map(|name| name.trim_start_matches('@').to_string())
        })
        .collect()
}
