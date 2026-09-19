//! Django, FastAPI and Flask, run through the environment the folder carries
//! (a `.venv`, uv, poetry, pipenv) so the command works without activating
//! anything first.

use super::Candidate;
use std::path::Path;

enum Runner {
    Venv(&'static str),
    Uv,
    Poetry,
    Pipenv,
    Plain,
}

impl Runner {
    fn detect(dir: &Path) -> Self {
        for venv in [".venv", "venv"] {
            if dir.join(venv).join("bin/python").exists() {
                return Self::Venv(venv);
            }
        }
        if dir.join("uv.lock").exists() {
            Self::Uv
        } else if dir.join("poetry.lock").exists() {
            Self::Poetry
        } else if dir.join("Pipfile").exists() {
            Self::Pipenv
        } else {
            Self::Plain
        }
    }

    fn wrap(&self, tool: &str, args: &str) -> String {
        match self {
            Self::Venv(venv) => format!("{venv}/bin/{tool} {args}"),
            Self::Uv => format!("uv run {tool} {args}"),
            Self::Poetry => format!("poetry run {tool} {args}"),
            Self::Pipenv => format!("pipenv run {tool} {args}"),
            Self::Plain if tool == "python" => format!("python3 {args}"),
            Self::Plain => format!("{tool} {args}"),
        }
    }
}

pub(crate) fn scan(dir: &Path) -> Option<Candidate> {
    let runner = Runner::detect(dir);
    if dir.join("manage.py").exists() {
        let cmd = runner.wrap("python", "manage.py runserver");
        return Some(Candidate::new("web", cmd, "django").or_port(Some(8000)));
    }
    let deps = declared_deps(dir);
    if deps.contains("fastapi") {
        if let Some(module) = asgi_module(dir) {
            let cmd = runner.wrap("uvicorn", &format!("{module} --reload"));
            return Some(Candidate::new("api", cmd, "fastapi").or_port(Some(8000)));
        }
    }
    if deps.contains("flask") && ["app.py", "wsgi.py"].iter().any(|f| dir.join(f).exists()) {
        let cmd = runner.wrap("flask", "run --debug");
        return Some(Candidate::new("web", cmd, "flask").or_port(Some(5000)));
    }
    None
}

fn declared_deps(dir: &Path) -> String {
    [
        "pyproject.toml",
        "requirements.txt",
        "requirements-dev.txt",
        "Pipfile",
    ]
    .iter()
    .filter_map(|file| std::fs::read_to_string(dir.join(file)).ok())
    .collect::<Vec<_>>()
    .join("\n")
    .to_lowercase()
}

fn asgi_module(dir: &Path) -> Option<&'static str> {
    [
        ("main.py", "main:app"),
        ("app.py", "app:app"),
        ("app/main.py", "app.main:app"),
        ("src/main.py", "src.main:app"),
    ]
    .iter()
    .find(|(file, _)| dir.join(file).exists())
    .map(|(_, module)| *module)
}
