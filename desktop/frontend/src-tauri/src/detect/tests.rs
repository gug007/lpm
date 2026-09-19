use super::*;
use std::path::Path;

fn write(root: &Path, rel: &str, contents: &str) {
    let path = root.join(rel);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, contents).unwrap();
}

fn names(services: &[DetectedService]) -> Vec<&str> {
    services.iter().map(|s| s.name.as_str()).collect()
}

fn by_name<'a>(services: &'a [DetectedService], name: &str) -> &'a DetectedService {
    services.iter().find(|s| s.name == name).unwrap()
}

#[test]
fn an_empty_folder_yields_nothing() {
    let tmp = tempfile::tempdir().unwrap();
    assert!(detect_services(tmp.path()).is_empty());
}

#[test]
fn a_next_app_is_web_on_its_default_port() {
    let tmp = tempfile::tempdir().unwrap();
    write(
        tmp.path(),
        "package.json",
        r#"{"scripts":{"dev":"next dev","build":"next build"},"dependencies":{"next":"15","react":"19"}}"#,
    );
    write(tmp.path(), "package-lock.json", "{}");
    let found = detect_services(tmp.path());
    assert_eq!(
        found,
        vec![DetectedService {
            name: "web".into(),
            cmd: "npm run dev".into(),
            cwd: String::new(),
            port: Some(3000),
        }]
    );
}

#[test]
fn the_script_port_beats_the_framework_default() {
    let tmp = tempfile::tempdir().unwrap();
    write(
        tmp.path(),
        "package.json",
        r#"{"scripts":{"dev":"next dev -p 3001"},"dependencies":{"next":"15"}}"#,
    );
    assert_eq!(detect_services(tmp.path())[0].port, Some(3001));
}

#[test]
fn package_manager_comes_from_the_declaration_then_the_lockfile() {
    let tmp = tempfile::tempdir().unwrap();
    write(
        tmp.path(),
        "package.json",
        r#"{"packageManager":"pnpm@9.0.0","scripts":{"start":"node server.js"},"dependencies":{"express":"4"}}"#,
    );
    write(tmp.path(), "yarn.lock", "");
    let found = detect_services(tmp.path());
    assert_eq!(found[0].name, "api");
    assert_eq!(found[0].cmd, "pnpm start");
    assert_eq!(found[0].port, None);

    let tmp = tempfile::tempdir().unwrap();
    write(
        tmp.path(),
        "package.json",
        r#"{"scripts":{"start":"node server.js"}}"#,
    );
    write(tmp.path(), "bun.lockb", "");
    assert_eq!(detect_services(tmp.path())[0].cmd, "bun run start");

    let tmp = tempfile::tempdir().unwrap();
    write(
        tmp.path(),
        "package.json",
        r#"{"scripts":{"start":"node server.js"}}"#,
    );
    assert_eq!(detect_services(tmp.path())[0].cmd, "npm start");
}

#[test]
fn a_workspace_lists_its_members_and_drops_the_aggregating_root_script() {
    let tmp = tempfile::tempdir().unwrap();
    write(
        tmp.path(),
        "package.json",
        r#"{"workspaces":["apps/*","packages/*"],"scripts":{"dev":"turbo dev"}}"#,
    );
    write(tmp.path(), "pnpm-lock.yaml", "");
    write(
        tmp.path(),
        "apps/web/package.json",
        r#"{"scripts":{"dev":"next dev"},"dependencies":{"next":"15"}}"#,
    );
    write(
        tmp.path(),
        "apps/api/package.json",
        r#"{"scripts":{"dev":"tsx watch src/index.ts --port 4001"},"dependencies":{"fastify":"5"}}"#,
    );
    write(
        tmp.path(),
        "packages/ui/package.json",
        r#"{"scripts":{"build":"tsc"}}"#,
    );
    let found = detect_services(tmp.path());
    assert_eq!(names(&found), vec!["api", "web"]);
    let api = by_name(&found, "api");
    assert_eq!(
        (api.cmd.as_str(), api.cwd.as_str(), api.port),
        ("pnpm dev", "apps/api", Some(4001))
    );
    let web = by_name(&found, "web");
    assert_eq!(
        (web.cmd.as_str(), web.cwd.as_str(), web.port),
        ("pnpm dev", "apps/web", Some(3000))
    );
}

#[test]
fn a_workspace_root_script_stays_when_no_member_is_runnable() {
    let tmp = tempfile::tempdir().unwrap();
    write(
        tmp.path(),
        "package.json",
        r#"{"workspaces":["packages/*"],"scripts":{"dev":"turbo dev"}}"#,
    );
    write(
        tmp.path(),
        "packages/ui/package.json",
        r#"{"scripts":{"build":"tsc"}}"#,
    );
    let found = detect_services(tmp.path());
    assert_eq!(found.len(), 1);
    assert_eq!(found[0].cmd, "npm run dev");
    assert_eq!(found[0].cwd, "");
}

#[test]
fn pnpm_workspace_yaml_and_negations_are_honoured() {
    let tmp = tempfile::tempdir().unwrap();
    write(tmp.path(), "package.json", "{}");
    write(
        tmp.path(),
        "pnpm-workspace.yaml",
        "packages:\n  - 'apps/*'\n  - '!apps/internal'\n",
    );
    write(
        tmp.path(),
        "apps/site/package.json",
        r#"{"scripts":{"dev":"vite"},"dependencies":{"vite":"6"}}"#,
    );
    write(
        tmp.path(),
        "apps/internal/package.json",
        r#"{"scripts":{"dev":"vite"}}"#,
    );
    let found = detect_services(tmp.path());
    assert_eq!(names(&found), vec!["site"]);
    assert_eq!(found[0].port, Some(5173));
}

#[test]
fn conventional_subfolders_are_named_after_themselves() {
    let tmp = tempfile::tempdir().unwrap();
    write(tmp.path(), "backend/main.py", "app = None");
    write(
        tmp.path(),
        "backend/pyproject.toml",
        "[project]\ndependencies = [\"fastapi\"]\n",
    );
    write(tmp.path(), "backend/uv.lock", "");
    write(
        tmp.path(),
        "frontend/package.json",
        r#"{"scripts":{"dev":"vite"},"devDependencies":{"vite":"6"}}"#,
    );
    write(tmp.path(), "frontend/yarn.lock", "");
    let found = detect_services(tmp.path());
    assert_eq!(names(&found), vec!["backend", "frontend"]);
    let backend = by_name(&found, "backend");
    assert_eq!(backend.cmd, "uv run uvicorn main:app --reload");
    assert_eq!(
        (backend.cwd.as_str(), backend.port),
        ("backend", Some(8000))
    );
    let frontend = by_name(&found, "frontend");
    assert_eq!(
        (frontend.cmd.as_str(), frontend.port),
        ("yarn dev", Some(5173))
    );
}

#[test]
fn django_uses_the_folder_venv_and_compose_rides_along() {
    let tmp = tempfile::tempdir().unwrap();
    write(tmp.path(), "manage.py", "");
    write(tmp.path(), ".venv/bin/python", "");
    write(tmp.path(), "docker-compose.yml", "services: {}");
    let found = detect_services(tmp.path());
    assert_eq!(names(&found), vec!["web", "compose"]);
    assert_eq!(found[0].cmd, ".venv/bin/python manage.py runserver");
    assert_eq!(found[0].port, Some(8000));
    assert_eq!(found[1].cmd, "docker compose up");
}

#[test]
fn flask_needs_an_entry_file_and_plain_python_is_python3() {
    let tmp = tempfile::tempdir().unwrap();
    write(tmp.path(), "requirements.txt", "Flask==3.0\n");
    assert!(detect_services(tmp.path()).is_empty());
    write(tmp.path(), "app.py", "");
    let found = detect_services(tmp.path());
    assert_eq!(found[0].cmd, "flask run --debug");
    assert_eq!(found[0].port, Some(5000));

    let tmp = tempfile::tempdir().unwrap();
    write(tmp.path(), "manage.py", "");
    assert_eq!(
        detect_services(tmp.path())[0].cmd,
        "python3 manage.py runserver"
    );
}

#[test]
fn a_procfile_dev_is_one_service_per_line_and_wins_over_rails_detection() {
    let tmp = tempfile::tempdir().unwrap();
    write(tmp.path(), "Gemfile", "gem 'rails', '~> 8.0'\n");
    write(tmp.path(), "bin/rails", "");
    write(tmp.path(), "bin/dev", "");
    write(
        tmp.path(),
        "Procfile.dev",
        "# dev processes\nweb: bin/rails server -p 3000\ncss: yarn build:css --watch\nrelease: bin/rails db:migrate\n",
    );
    let found = detect_services(tmp.path());
    assert_eq!(names(&found), vec!["web", "css"]);
    assert_eq!(found[0].cmd, "bin/rails server -p 3000");
    assert_eq!(found[0].port, Some(3000));
    assert_eq!(found[1].port, None);
}

#[test]
fn rails_without_a_procfile_prefers_bin_dev() {
    let tmp = tempfile::tempdir().unwrap();
    write(tmp.path(), "Gemfile", "gem \"rails\"\n");
    write(tmp.path(), "bin/rails", "");
    assert_eq!(detect_services(tmp.path())[0].cmd, "bin/rails server");
    write(tmp.path(), "bin/dev", "");
    let found = detect_services(tmp.path());
    assert_eq!(
        (found[0].name.as_str(), found[0].cmd.as_str(), found[0].port),
        ("web", "bin/dev", Some(3000))
    );
}

#[test]
fn go_commands_become_one_service_each() {
    let tmp = tempfile::tempdir().unwrap();
    write(tmp.path(), "go.mod", "module example.com/svc\n");
    write(tmp.path(), "cmd/api/main.go", "package main");
    write(tmp.path(), "cmd/worker/main.go", "package main");
    write(tmp.path(), "cmd/shared/util.go", "package shared");
    let found = detect_services(tmp.path());
    assert_eq!(names(&found), vec!["api", "worker"]);
    assert_eq!(found[0].cmd, "go run ./cmd/api");

    let tmp = tempfile::tempdir().unwrap();
    write(tmp.path(), "go.mod", "module example.com/svc\n");
    write(tmp.path(), "main.go", "package main");
    write(tmp.path(), ".air.toml", "");
    assert_eq!(detect_services(tmp.path())[0].cmd, "air");
}

#[test]
fn cargo_packages_and_workspace_binaries_run_with_cargo() {
    let tmp = tempfile::tempdir().unwrap();
    write(
        tmp.path(),
        "Cargo.toml",
        "[package]\nname = \"svc\"\nversion = \"0.1.0\"\n",
    );
    assert!(detect_services(tmp.path()).is_empty());
    write(tmp.path(), "src/main.rs", "fn main() {}");
    assert_eq!(detect_services(tmp.path())[0].cmd, "cargo run");

    let tmp = tempfile::tempdir().unwrap();
    write(
        tmp.path(),
        "Cargo.toml",
        "[workspace]\nmembers = [\"crates/*\"]\n",
    );
    write(
        tmp.path(),
        "crates/server/Cargo.toml",
        "[package]\nname = \"my-server\"\n",
    );
    write(tmp.path(), "crates/server/src/main.rs", "");
    write(
        tmp.path(),
        "crates/core/Cargo.toml",
        "[package]\nname = \"core\"\n",
    );
    write(tmp.path(), "crates/core/src/lib.rs", "");
    let found = detect_services(tmp.path());
    assert_eq!(names(&found), vec!["my-server"]);
    assert_eq!(found[0].cmd, "cargo run -p my-server");
}

#[test]
fn other_stacks_get_their_canonical_dev_command() {
    let tmp = tempfile::tempdir().unwrap();
    write(tmp.path(), "artisan", "");
    assert_eq!(detect_services(tmp.path())[0].cmd, "php artisan serve");

    let tmp = tempfile::tempdir().unwrap();
    write(
        tmp.path(),
        "mix.exs",
        "defp deps do [{:phoenix, \"~> 1.7\"}] end",
    );
    let found = detect_services(tmp.path());
    assert_eq!(
        (found[0].cmd.as_str(), found[0].port),
        ("mix phx.server", Some(4000))
    );

    let tmp = tempfile::tempdir().unwrap();
    write(
        tmp.path(),
        "pom.xml",
        "<parent><artifactId>spring-boot-starter-parent</artifactId></parent>",
    );
    write(tmp.path(), "mvnw", "");
    assert_eq!(detect_services(tmp.path())[0].cmd, "./mvnw spring-boot:run");

    let tmp = tempfile::tempdir().unwrap();
    write(
        tmp.path(),
        "build.gradle.kts",
        "plugins { id(\"org.springframework.boot\") }",
    );
    assert_eq!(detect_services(tmp.path())[0].cmd, "gradle bootRun");

    let tmp = tempfile::tempdir().unwrap();
    write(tmp.path(), "Api.csproj", "<Project />");
    assert_eq!(detect_services(tmp.path())[0].cmd, "dotnet watch run");

    let tmp = tempfile::tempdir().unwrap();
    write(
        tmp.path(),
        "deno.json",
        r#"{"tasks":{"dev":"deno run -A --watch main.ts"}}"#,
    );
    assert_eq!(detect_services(tmp.path())[0].cmd, "deno task dev");
}

#[test]
fn a_task_runner_is_the_fallback_only() {
    let tmp = tempfile::tempdir().unwrap();
    write(
        tmp.path(),
        "Makefile",
        "CC := gcc\n.PHONY: dev test\nbuild: main.c\n\t$(CC) main.c\ndev:\n\t./run.sh\n",
    );
    assert_eq!(detect_services(tmp.path())[0].cmd, "make dev");

    let tmp = tempfile::tempdir().unwrap();
    write(
        tmp.path(),
        "justfile",
        "port := \"3000\"\nserve *args:\n  cargo run {{args}}\n",
    );
    assert_eq!(detect_services(tmp.path())[0].cmd, "just serve");

    let tmp = tempfile::tempdir().unwrap();
    write(tmp.path(), "Makefile", "dev:\n\t./run.sh\n");
    write(tmp.path(), "package.json", r#"{"scripts":{"dev":"vite"}}"#);
    let found = detect_services(tmp.path());
    assert_eq!(found.len(), 1);
    assert_eq!(found[0].cmd, "npm run dev");
}

#[test]
fn two_stacks_sharing_a_role_in_one_folder_are_told_apart() {
    let tmp = tempfile::tempdir().unwrap();
    write(tmp.path(), "manage.py", "");
    write(
        tmp.path(),
        "package.json",
        r#"{"scripts":{"dev":"vite"},"devDependencies":{"vite":"6"}}"#,
    );
    assert_eq!(
        names(&detect_services(tmp.path())),
        vec!["web-node", "web-django"]
    );
}

#[test]
fn folder_names_are_sanitised_and_kept_unique() {
    let tmp = tempfile::tempdir().unwrap();
    write(
        tmp.path(),
        "apps/Web Site/package.json",
        r#"{"scripts":{"dev":"vite"}}"#,
    );
    write(
        tmp.path(),
        "services/web-site/package.json",
        r#"{"scripts":{"dev":"vite"}}"#,
    );
    write(
        tmp.path(),
        "services/.hidden/package.json",
        r#"{"scripts":{"dev":"vite"}}"#,
    );
    write(
        tmp.path(),
        "services/node_modules/package.json",
        r#"{"scripts":{"dev":"vite"}}"#,
    );
    let found = detect_services(tmp.path());
    assert_eq!(names(&found), vec!["web-site", "web-site-2"]);
    assert_eq!(found[0].cwd, "apps/Web Site");
}

#[test]
fn several_services_in_a_subfolder_carry_it_as_a_prefix() {
    let tmp = tempfile::tempdir().unwrap();
    write(
        tmp.path(),
        "backend/Procfile.dev",
        "web: bin/rails s\nworker: bundle exec sidekiq\n",
    );
    assert_eq!(
        names(&detect_services(tmp.path())),
        vec!["backend-web", "backend-worker"]
    );
}

#[test]
fn ports_are_read_from_the_usual_flags() {
    assert_eq!(port_in_command("next dev -p 3001"), Some(3001));
    assert_eq!(port_in_command("vite --port 5174 --host"), Some(5174));
    assert_eq!(port_in_command("uvicorn main:app --port=8001"), Some(8001));
    assert_eq!(port_in_command("PORT=4000 node server.js"), Some(4000));
    assert_eq!(
        port_in_command("python manage.py runserver 0.0.0.0:8080"),
        Some(8080)
    );
    assert_eq!(
        port_in_command("python manage.py runserver --noreload"),
        None
    );
    assert_eq!(
        port_in_command("node server.js --host localhost:9000"),
        Some(9000)
    );
    assert_eq!(port_in_command("docker compose -p myproj up"), None);
    assert_eq!(port_in_command("vite"), None);
}

#[test]
fn sanitize_makes_a_plain_lowercase_slug() {
    assert_eq!(sanitize("Web Site"), "web-site");
    assert_eq!(sanitize("@acme/api"), "acme-api");
    assert_eq!(sanitize("___"), "app");
    assert_eq!(sanitize("worker_v2"), "worker-v2");
}

#[test]
fn package_manager_of_is_none_outside_node() {
    let tmp = tempfile::tempdir().unwrap();
    assert_eq!(node::package_manager_of(tmp.path()), None);
    write(tmp.path(), "package.json", "{}");
    write(tmp.path(), "pnpm-lock.yaml", "");
    assert_eq!(
        node::package_manager_of(tmp.path()),
        Some(PackageManager::Pnpm)
    );
}

#[test]
fn a_root_procfile_already_covers_the_folders_it_runs() {
    let tmp = tempfile::tempdir().unwrap();
    write(
        tmp.path(),
        "Procfile",
        "web: PORT=3000 yarn --cwd client start\napi: PORT=3001 bundle exec rails s\n",
    );
    write(
        tmp.path(),
        "client/package.json",
        r#"{"scripts":{"start":"react-scripts start"}}"#,
    );
    write(
        tmp.path(),
        "frontend/package.json",
        r#"{"scripts":{"dev":"vite"}}"#,
    );
    let found = detect_services(tmp.path());
    assert_eq!(names(&found), vec!["web", "api", "frontend"]);
    assert_eq!(found[0].port, Some(3000));
}
