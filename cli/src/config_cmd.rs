use crate::config::{self, Ctx, ResolvedAction, ResolvedProject};
use crate::control;
use crate::error;
use crate::error::RunError;
use crate::util::print_json;
use clap::{Subcommand, ValueEnum};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value as JsonValue};
use serde_yaml::{Mapping, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write as _;
use std::io::Read;
use std::path::{Path, PathBuf};

#[derive(Clone, Copy, ValueEnum)]
pub enum ConfigLayer {
    Project,
    Repo,
    Global,
    Template,
}

#[derive(Subcommand)]
pub enum Command {
    /// Resolve a directory to the deepest matching lpm project root.
    Resolve {
        /// Directory to resolve; defaults to the current directory.
        #[arg(long)]
        cwd: Option<PathBuf>,
        /// Emit a machine-readable JSON object.
        #[arg(long)]
        json: bool,
    },
    /// Validate an lpm project, repo, global, or template YAML file.
    Validate {
        /// YAML file to validate.
        file: PathBuf,
        /// Emit a machine-readable JSON object.
        #[arg(long)]
        json: bool,
    },
    /// Read one config layer with a revision for a safe later apply.
    Get {
        /// Config layer to read.
        #[arg(long, value_enum)]
        layer: ConfigLayer,
        /// Project stem, name, or prefix. Omit to infer it.
        #[arg(long, short = 'p')]
        project: Option<String>,
        /// Template name when --layer=template.
        #[arg(long)]
        template: Option<String>,
        /// Allow reading a missing project or template as a new blank config.
        #[arg(long)]
        create: bool,
        /// Emit content, path, and revision as JSON instead of raw YAML.
        #[arg(long)]
        json: bool,
    },
    /// Validate and atomically apply a config candidate through the running app.
    Apply {
        /// Config layer to replace.
        #[arg(long, value_enum)]
        layer: ConfigLayer,
        /// Project stem, name, or prefix. Omit to infer it.
        #[arg(long, short = 'p')]
        project: Option<String>,
        /// Template name when --layer=template.
        #[arg(long)]
        template: Option<String>,
        /// Allow creating a missing project or template.
        #[arg(long)]
        create: bool,
        /// Read the candidate YAML from standard input.
        #[arg(long, conflicts_with = "file", required_unless_present = "file")]
        stdin: bool,
        /// Read the candidate YAML from this file.
        #[arg(long, value_name = "PATH", conflicts_with = "stdin")]
        file: Option<PathBuf>,
        /// Revision returned by `lpm config get`.
        #[arg(long = "if-revision")]
        expected_revision: String,
        /// Emit a machine-readable JSON object.
        #[arg(long)]
        json: bool,
    },
}

pub fn run(ctx: &Ctx, command: Command) -> Result<(), RunError> {
    match command {
        Command::Resolve { cwd, json } => resolve(ctx, cwd.as_deref(), json),
        Command::Validate { file, json } => validate(ctx, &file, json),
        Command::Get {
            layer,
            project,
            template,
            create,
            json,
        } => get(
            ctx,
            layer,
            project.as_deref(),
            template.as_deref(),
            create,
            json,
        ),
        Command::Apply {
            layer,
            project,
            template,
            create,
            stdin,
            file,
            expected_revision,
            json,
        } => apply(
            ctx,
            layer,
            project.as_deref(),
            template.as_deref(),
            create,
            stdin,
            file.as_deref(),
            &expected_revision,
            json,
        ),
    }
}

fn resolve(ctx: &Ctx, cwd: Option<&Path>, as_json: bool) -> Result<(), RunError> {
    let cwd = match cwd {
        Some(path) => path.to_path_buf(),
        None => std::env::current_dir()
            .map_err(|e| RunError::Internal(format!("cannot determine current directory: {e}")))?,
    };
    let result = config::resolve_project_for_cwd(ctx, &cwd);
    let project = (result.candidates.len() == 1).then(|| result.candidates[0].clone());
    let path = project.as_ref().map(|name| ctx.project_path(name));
    if as_json {
        print_json(&json!({
            "cwd": result.cwd,
            "matchCount": result.candidates.len(),
            "project": project,
            "path": path,
            "candidates": result.candidates,
            "available": result.available,
        }));
    } else if let Some(name) = project {
        println!("{}\t{}", name, path.unwrap().display());
    } else if result.candidates.is_empty() {
        println!(
            "no matching project\navailable: {}",
            result.available.join(", ")
        );
    } else {
        println!(
            "multiple matching projects: {}",
            result.candidates.join(", ")
        );
    }
    Ok(())
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ConfigKind {
    Project,
    Repo,
    Global,
    Template,
}

impl ConfigLayer {
    fn as_str(self) -> &'static str {
        match self {
            Self::Project => "project",
            Self::Repo => "repo",
            Self::Global => "global",
            Self::Template => "template",
        }
    }

    fn kind(self) -> ConfigKind {
        match self {
            Self::Project => ConfigKind::Project,
            Self::Repo => ConfigKind::Repo,
            Self::Global => ConfigKind::Global,
            Self::Template => ConfigKind::Template,
        }
    }
}

struct ConfigTarget {
    layer: ConfigLayer,
    project: String,
    template: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConfigSnapshot {
    layer: String,
    project: String,
    template: String,
    path: PathBuf,
    exists: bool,
    content: String,
    revision: String,
}

#[derive(Deserialize)]
struct ConfigSocketReply {
    ok: bool,
    snapshot: Option<ConfigSnapshot>,
    code: Option<String>,
    error: Option<String>,
}

fn validate_target_name(name: &str, kind: &str) -> Result<(), RunError> {
    if name.is_empty() || name.contains(['/', '\\']) || matches!(name, "." | ".." | "__global__") {
        return Err(RunError::NotFound(format!("invalid {kind} name: {name:?}")));
    }
    Ok(())
}

fn resolve_project_target(
    ctx: &Ctx,
    project: Option<&str>,
    create: bool,
) -> Result<String, RunError> {
    let Some(query) = project else {
        return error::resolve_or_infer(ctx, None);
    };
    match config::resolve_project_name(ctx, query) {
        Ok(project) => Ok(project),
        Err(config::ResolveError::NotFound { .. }) if create => {
            validate_target_name(query, "project")?;
            Ok(query.to_string())
        }
        Err(error) => Err(error::resolve_error(error)),
    }
}

fn resolve_config_target(
    ctx: &Ctx,
    layer: ConfigLayer,
    project: Option<&str>,
    template: Option<&str>,
    create: bool,
) -> Result<ConfigTarget, RunError> {
    match layer {
        ConfigLayer::Project => {
            if template.is_some() {
                return Err(RunError::NotFound(
                    "--template is only valid with --layer=template".into(),
                ));
            }
            Ok(ConfigTarget {
                layer,
                project: resolve_project_target(ctx, project, create)?,
                template: String::new(),
            })
        }
        ConfigLayer::Repo => {
            if template.is_some() {
                return Err(RunError::NotFound(
                    "--template is only valid with --layer=template".into(),
                ));
            }
            Ok(ConfigTarget {
                layer,
                project: error::resolve_or_infer(ctx, project)?,
                template: String::new(),
            })
        }
        ConfigLayer::Global => {
            if project.is_some() || template.is_some() {
                return Err(RunError::NotFound(
                    "--layer=global does not accept --project or --template".into(),
                ));
            }
            Ok(ConfigTarget {
                layer,
                project: String::new(),
                template: String::new(),
            })
        }
        ConfigLayer::Template => {
            if project.is_some() {
                return Err(RunError::NotFound(
                    "--project is not valid with --layer=template".into(),
                ));
            }
            let name = template
                .ok_or_else(|| RunError::NotFound("--layer=template requires --template".into()))?;
            validate_target_name(name, "template")?;
            let exists = ["yml", "yaml"]
                .iter()
                .any(|ext| ctx.templates_dir().join(format!("{name}.{ext}")).exists());
            if !exists && !create {
                return Err(RunError::NotFound(format!(
                    "template {name:?} does not exist; pass --create to create it"
                )));
            }
            Ok(ConfigTarget {
                layer,
                project: String::new(),
                template: name.to_string(),
            })
        }
    }
}

fn hex_encode(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len() * 2);
    for byte in value.as_bytes() {
        write!(encoded, "{byte:02x}").unwrap();
    }
    encoded
}

fn request_config_snapshot(
    ctx: &Ctx,
    command: &str,
    payload: JsonValue,
    as_json: bool,
) -> Result<ConfigSnapshot, RunError> {
    let payload = serde_json::to_string(&payload)
        .map_err(|e| RunError::Internal(format!("cannot encode config request: {e}")))?;
    let line = format!("{command} --payload-hex={}", hex_encode(&payload));
    let reply = control::send_command(ctx, &line)?;
    let reply: ConfigSocketReply = serde_json::from_str(&reply)
        .map_err(|e| RunError::Internal(format!("invalid config reply from app: {e}")))?;
    if !reply.ok {
        let error = reply
            .error
            .unwrap_or_else(|| "config command failed".to_string());
        if as_json {
            print_json(&json!({
                "applied": false,
                "code": reply.code.unwrap_or_else(|| "config_error".to_string()),
                "error": error,
            }));
        }
        return Err(RunError::Internal(error));
    }
    reply
        .snapshot
        .ok_or_else(|| RunError::Internal("config reply did not include a snapshot".into()))
}

fn target_payload(target: &ConfigTarget) -> JsonValue {
    json!({
        "layer": target.layer.as_str(),
        "project": target.project,
        "template": target.template,
    })
}

fn get(
    ctx: &Ctx,
    layer: ConfigLayer,
    project: Option<&str>,
    template: Option<&str>,
    create: bool,
    as_json: bool,
) -> Result<(), RunError> {
    let target = resolve_config_target(ctx, layer, project, template, create)?;
    control::require_app(ctx)?;
    let snapshot = request_config_snapshot(ctx, "config_get", target_payload(&target), as_json)?;
    if as_json {
        print_json(&json!(snapshot));
    } else {
        print!("{}", snapshot.content);
    }
    Ok(())
}

fn read_candidate(from_stdin: bool, file: Option<&Path>) -> Result<String, RunError> {
    if let Some(path) = file {
        return std::fs::read_to_string(path)
            .map_err(|e| RunError::NotFound(format!("{}: {e}", path.display())));
    }
    if !from_stdin {
        return Err(RunError::NotFound(
            "pass --stdin or --file <path> for the candidate YAML".into(),
        ));
    }
    let mut source = String::new();
    std::io::stdin()
        .read_to_string(&mut source)
        .map_err(|e| RunError::Internal(format!("cannot read candidate YAML: {e}")))?;
    Ok(source)
}

fn apply(
    ctx: &Ctx,
    layer: ConfigLayer,
    project: Option<&str>,
    template: Option<&str>,
    create: bool,
    from_stdin: bool,
    file: Option<&Path>,
    expected_revision: &str,
    as_json: bool,
) -> Result<(), RunError> {
    let target = resolve_config_target(ctx, layer, project, template, create)?;
    control::require_app(ctx)?;
    let before = request_config_snapshot(ctx, "config_get", target_payload(&target), as_json)?;
    if before.revision != expected_revision {
        if as_json {
            print_json(&json!({
                "applied": false,
                "code": "revision_conflict",
                "path": before.path,
                "expectedRevision": expected_revision,
                "currentRevision": before.revision,
            }));
        }
        return Err(RunError::Internal(format!(
            "revision conflict: expected {expected_revision}, current revision is {}",
            before.revision
        )));
    }

    let source = read_candidate(from_stdin, file)?;
    let report = validate_candidate(ctx, &target, &before.path, &source);
    if !report.errors.is_empty() {
        if as_json {
            print_json(&json!({
                "applied": false,
                "path": before.path,
                "valid": false,
                "errors": report.errors,
                "warnings": report.warnings,
            }));
        } else {
            for error in &report.errors {
                println!("error: {error}");
            }
            for warning in &report.warnings {
                println!("warning: {warning}");
            }
        }
        return Err(RunError::Internal(
            "config validation failed; destination was not changed".into(),
        ));
    }

    let payload = json!({
        "layer": target.layer.as_str(),
        "project": target.project,
        "template": target.template,
        "expectedRevision": expected_revision,
        "content": source,
    });
    let after = request_config_snapshot(ctx, "config_apply", payload, as_json)?;
    if as_json {
        print_json(&json!({
            "applied": true,
            "snapshot": after,
            "warnings": report.warnings,
        }));
    } else {
        println!("applied {}", after.path.display());
        for warning in &report.warnings {
            println!("warning: {warning}");
        }
    }
    Ok(())
}

struct Report {
    errors: Vec<String>,
    warnings: Vec<String>,
}

impl Report {
    fn new() -> Self {
        Self {
            errors: Vec::new(),
            warnings: Vec::new(),
        }
    }

    fn error(&mut self, path: &str, message: impl AsRef<str>) {
        self.errors.push(format!("{path}: {}", message.as_ref()));
    }

    fn warning(&mut self, path: &str, message: impl AsRef<str>) {
        self.warnings.push(format!("{path}: {}", message.as_ref()));
    }
}

fn validate_candidate(ctx: &Ctx, target: &ConfigTarget, path: &Path, source: &str) -> Report {
    let value: Value = match serde_yaml::from_str(source) {
        Ok(value) => value,
        Err(error) => {
            let mut report = Report::new();
            report.error("config", format!("invalid YAML: {error}"));
            return report;
        }
    };
    let mut report = validate_value(ctx, path, target.layer.kind(), &value);
    if !report.errors.is_empty() {
        return report;
    }

    match target.layer {
        ConfigLayer::Project | ConfigLayer::Repo => {
            validate_effective_candidate(ctx, &target.project, path, source, &mut report);
        }
        ConfigLayer::Global | ConfigLayer::Template => {
            for project in config::project_names(ctx) {
                let mut effective = Report::new();
                validate_effective_candidate(ctx, &project, path, source, &mut effective);
                report.errors.extend(
                    effective
                        .errors
                        .into_iter()
                        .map(|error| format!("project {project}: {error}")),
                );
                report.warnings.extend(
                    effective
                        .warnings
                        .into_iter()
                        .map(|warning| format!("project {project}: {warning}")),
                );
            }
        }
    }
    report
}

fn validate_effective_candidate(
    ctx: &Ctx,
    project_name: &str,
    path: &Path,
    source: &str,
    report: &mut Report,
) {
    let project = match config::resolve_project_with_override(ctx, project_name, path, source) {
        Ok(project) => project,
        Err(error) => {
            report.error("config", error);
            return;
        }
    };
    validate_effective_services(&project, report);
    for action in project.actions.iter().chain(project.terminals.iter()) {
        validate_effective_action(&project, action, report);
    }
}

fn validate(ctx: &Ctx, path: &Path, as_json: bool) -> Result<(), RunError> {
    let path = absolute_path(path)?;
    let source = std::fs::read_to_string(&path)
        .map_err(|e| RunError::NotFound(format!("{}: {e}", path.display())))?;
    let value: Value = serde_yaml::from_str(&source)
        .map_err(|e| RunError::Internal(format!("{}: invalid YAML: {e}", path.display())))?;
    let kind = config_kind(ctx, &path);
    let mut report = validate_value(ctx, &path, kind, &value);
    if kind == ConfigKind::Project && report.errors.is_empty() {
        validate_effective_project(ctx, &path, &mut report);
    }
    let valid = report.errors.is_empty();
    if as_json {
        print_json(&json!({
            "path": path,
            "valid": valid,
            "errors": report.errors,
            "warnings": report.warnings,
        }));
    } else if valid {
        println!("valid {}", path.display());
        for warning in &report.warnings {
            println!("warning: {warning}");
        }
    } else {
        for error in &report.errors {
            println!("error: {error}");
        }
        for warning in &report.warnings {
            println!("warning: {warning}");
        }
    }
    if valid {
        Ok(())
    } else {
        Err(RunError::Internal("config validation failed".into()))
    }
}

fn absolute_path(path: &Path) -> Result<PathBuf, RunError> {
    let cwd = std::env::current_dir()
        .map_err(|e| RunError::Internal(format!("cannot determine current directory: {e}")))?;
    Ok(absolute_path_from(path, &cwd))
}

fn absolute_path_from(path: &Path, cwd: &Path) -> PathBuf {
    let path = if path.is_absolute() {
        path.to_path_buf()
    } else {
        cwd.join(path)
    };
    std::fs::canonicalize(&path).unwrap_or(path)
}

fn comparable_path(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

fn config_kind(ctx: &Ctx, path: &Path) -> ConfigKind {
    if path.file_name().and_then(|v| v.to_str()) == Some(".lpm.yml") {
        return ConfigKind::Repo;
    }
    if comparable_path(path) == comparable_path(&ctx.global_path()) {
        return ConfigKind::Global;
    }
    if path.parent().map(comparable_path) == Some(comparable_path(&ctx.templates_dir())) {
        return ConfigKind::Template;
    }
    ConfigKind::Project
}

fn validate_value(ctx: &Ctx, path: &Path, kind: ConfigKind, value: &Value) -> Report {
    let mut report = Report::new();
    let Some(root) = value.as_mapping() else {
        report.error("config", "expected a mapping");
        return report;
    };
    let allowed = match kind {
        ConfigKind::Project => &[
            "name",
            "extends",
            "root",
            "label",
            "parent_name",
            "worktree",
            "ssh",
            "claudeAccount",
            "services",
            "actions",
            "terminals",
            "profiles",
        ][..],
        ConfigKind::Repo => &["extends", "services", "actions", "terminals", "profiles"][..],
        ConfigKind::Global => &["extends", "actions", "terminals"][..],
        ConfigKind::Template => &["actions", "terminals"][..],
    };
    validate_keys(root, allowed, "config", &mut report);
    validate_string_field(root, "name", "config.name", &mut report);
    validate_string_field(root, "root", "config.root", &mut report);
    validate_string_field(root, "label", "config.label", &mut report);
    validate_string_field(root, "parent_name", "config.parent_name", &mut report);
    if let Some(value) = root.get(Value::String("worktree".into())) {
        if value.as_bool().is_none() {
            report.error("config.worktree", "expected a boolean");
        }
    }
    validate_extends(root, &mut report);

    let local_root = local_root(path, kind, root);
    let is_remote = root.get(Value::String("ssh".into())).is_some();
    if kind == ConfigKind::Project {
        validate_project_identity(ctx, root, &mut report);
    }
    if let Some(ssh) = root.get(Value::String("ssh".into())) {
        validate_ssh(ssh, &mut report);
    }
    validate_services(
        root,
        local_root.as_deref(),
        is_remote,
        kind != ConfigKind::Project,
        &mut report,
    );
    let allow_sync = is_remote || matches!(kind, ConfigKind::Global | ConfigKind::Template);
    validate_actions_section(
        root,
        "actions",
        local_root.as_deref(),
        is_remote,
        allow_sync,
        &mut report,
    );
    validate_actions_section(
        root,
        "terminals",
        local_root.as_deref(),
        is_remote,
        allow_sync,
        &mut report,
    );
    if root.get(Value::String("terminals".into())).is_some() {
        report.warning(
            "config.terminals",
            "the terminals section is deprecated; declare terminals under actions with type: terminal",
        );
    }
    validate_profiles(root, &mut report);
    report
}

fn local_root(path: &Path, kind: ConfigKind, root: &Mapping) -> Option<PathBuf> {
    match kind {
        ConfigKind::Repo => path.parent().map(Path::to_path_buf),
        ConfigKind::Project => string_at(root, "root").filter(|v| !v.is_empty()).map(|v| {
            let expanded = config::expand_home(v);
            PathBuf::from(expanded)
        }),
        ConfigKind::Global | ConfigKind::Template => None,
    }
}

fn validate_project_identity(ctx: &Ctx, root: &Mapping, report: &mut Report) {
    let project_root = string_at(root, "root").unwrap_or_default();
    let ssh = root.get(Value::String("ssh".into()));
    if project_root.is_empty() && ssh.is_none() {
        report.error("config", "set either root or ssh");
    }
    if !project_root.is_empty() && ssh.is_some() {
        report.error("config", "root and ssh cannot both be set");
    }
    if let Some(name) = string_at(root, "name") {
        if name.is_empty() || name.contains(['/', '\\']) || matches!(name, "." | ".." | "global") {
            report.error("config.name", "invalid project name");
        }
    }
    if let Some(parent) = string_at(root, "parent_name").filter(|v| !v.is_empty()) {
        if !ctx.project_path(parent).exists() {
            report.error(
                "config.parent_name",
                format!("project {parent:?} does not exist"),
            );
        }
        for key in [
            "extends",
            "ssh",
            "services",
            "actions",
            "terminals",
            "profiles",
        ] {
            if root.get(Value::String(key.into())).is_some() {
                report.error("config", format!("duplicate projects cannot define {key}"));
            }
        }
    }
    if root
        .get(Value::String("worktree".into()))
        .and_then(Value::as_bool)
        == Some(true)
        && string_at(root, "parent_name")
            .unwrap_or_default()
            .is_empty()
    {
        report.error("config.worktree", "worktree projects must set parent_name");
    }
}

fn validate_ssh(value: &Value, report: &mut Report) {
    let Some(map) = value.as_mapping() else {
        report.error("config.ssh", "expected a mapping");
        return;
    };
    validate_keys(
        map,
        &["host", "user", "port", "key", "dir"],
        "config.ssh",
        report,
    );
    for key in ["host", "user", "key", "dir"] {
        validate_string_field(map, key, &format!("config.ssh.{key}"), report);
    }
    for key in ["host", "user"] {
        if string_at(map, key).unwrap_or_default().is_empty() {
            report.error(&format!("config.ssh.{key}"), "must not be empty");
        }
    }
    if let Some(port) = map.get(Value::String("port".into())) {
        match port.as_i64() {
            Some(value) if (0..=65535).contains(&value) => {}
            _ => report.error("config.ssh.port", "expected an integer from 0 to 65535"),
        }
    }
    if let Some(dir) = string_at(map, "dir").filter(|v| !v.is_empty()) {
        if !dir.starts_with('~') && !Path::new(dir).is_absolute() {
            report.error("config.ssh.dir", "expected an absolute or ~-prefixed path");
        }
    }
}

fn validate_services(
    root: &Mapping,
    local_root: Option<&Path>,
    remote: bool,
    require_local_dependencies: bool,
    report: &mut Report,
) {
    let Some(value) = root.get(Value::String("services".into())) else {
        return;
    };
    let Some(services) = value.as_mapping() else {
        report.error("config.services", "expected a mapping");
        return;
    };
    let names = string_keys(services, "config.services", report);
    let mut dependencies = BTreeMap::new();
    for (key, value) in services {
        let Some(name) = key.as_str() else { continue };
        let path = format!("config.services.{name}");
        if let Some(cmd) = value.as_str() {
            if cmd.trim().is_empty() {
                report.error(&path, "command must not be empty");
            }
            dependencies.insert(name.to_string(), Vec::new());
            continue;
        }
        let Some(map) = value.as_mapping() else {
            report.error(&path, "expected a command string or mapping");
            continue;
        };
        validate_keys(
            map,
            &[
                "cmd",
                "cwd",
                "port",
                "portConflict",
                "env",
                "dependsOn",
                "depends_on",
            ],
            &path,
            report,
        );
        match string_at(map, "cmd") {
            Some(cmd) if !cmd.trim().is_empty() => {}
            _ => report.error(&format!("{path}.cmd"), "must not be empty"),
        }
        validate_cwd(map, &path, local_root, remote, report);
        validate_env(map, &path, report);
        validate_port_conflict(map, &path, report);
        if let Some(port) = map.get(Value::String("port".into())) {
            match port.as_i64() {
                Some(value) if (0..=65535).contains(&value) => {}
                _ => report.error(
                    &format!("{path}.port"),
                    "expected an integer from 0 to 65535",
                ),
            }
        }
        let deps_value = map
            .get(Value::String("dependsOn".into()))
            .or_else(|| map.get(Value::String("depends_on".into())));
        let deps = validate_string_list(deps_value, &format!("{path}.dependsOn"), report);
        dependencies.insert(name.to_string(), deps);
    }
    validate_dependency_graph(&names, &dependencies, require_local_dependencies, report);
}

fn validate_dependency_graph(
    names: &BTreeSet<String>,
    dependencies: &BTreeMap<String, Vec<String>>,
    require_known: bool,
    report: &mut Report,
) {
    for (name, deps) in dependencies {
        for dep in deps {
            if require_known && !names.contains(dep) {
                report.error(
                    &format!("config.services.{name}.dependsOn"),
                    format!("unknown service {dep:?}"),
                );
            }
        }
    }
    fn visit(
        name: &str,
        dependencies: &BTreeMap<String, Vec<String>>,
        done: &mut BTreeSet<String>,
        stack: &mut Vec<String>,
    ) -> Option<Vec<String>> {
        if done.contains(name) {
            return None;
        }
        if let Some(index) = stack.iter().position(|entry| entry == name) {
            let mut cycle = stack[index..].to_vec();
            cycle.push(name.to_string());
            return Some(cycle);
        }
        stack.push(name.to_string());
        for dep in dependencies.get(name).into_iter().flatten() {
            if let Some(cycle) = visit(dep, dependencies, done, stack) {
                return Some(cycle);
            }
        }
        stack.pop();
        done.insert(name.to_string());
        None
    }
    let mut done = BTreeSet::new();
    for name in names {
        if let Some(cycle) = visit(name, dependencies, &mut done, &mut Vec::new()) {
            report.error(
                "config.services",
                format!("dependency cycle: {}", cycle.join(" -> ")),
            );
            break;
        }
    }
}

fn validate_actions_section(
    root: &Mapping,
    section: &str,
    local_root: Option<&Path>,
    remote: bool,
    allow_sync: bool,
    report: &mut Report,
) {
    let Some(value) = root.get(Value::String(section.into())) else {
        return;
    };
    let Some(entries) = value.as_mapping() else {
        report.error(&format!("config.{section}"), "expected a mapping");
        return;
    };
    string_keys(entries, &format!("config.{section}"), report);
    for (key, value) in entries {
        if let Some(name) = key.as_str() {
            validate_action(
                value,
                &format!("config.{section}.{name}"),
                local_root,
                remote,
                allow_sync,
                report,
            );
        }
    }
}

fn validate_action(
    value: &Value,
    path: &str,
    local_root: Option<&Path>,
    remote: bool,
    allow_sync: bool,
    report: &mut Report,
) {
    if let Some(cmd) = value.as_str() {
        if cmd.trim().is_empty() {
            report.error(path, "command must not be empty");
        }
        return;
    }
    let Some(map) = value.as_mapping() else {
        report.error(path, "expected a command string or mapping");
        return;
    };
    validate_keys(
        map,
        &[
            "cmd",
            "label",
            "emoji",
            "shortcut",
            "cwd",
            "port",
            "portConflict",
            "env",
            "confirm",
            "display",
            "type",
            "reuse",
            "mode",
            "position",
            "inputs",
            "actions",
        ],
        path,
        report,
    );
    for key in [
        "cmd",
        "label",
        "emoji",
        "shortcut",
        "cwd",
        "portConflict",
        "display",
        "type",
        "mode",
    ] {
        validate_string_field(map, key, &format!("{path}.{key}"), report);
    }
    for key in ["confirm", "reuse"] {
        if let Some(value) = map.get(Value::String(key.into())) {
            if value.as_bool().is_none() {
                report.error(&format!("{path}.{key}"), "expected a boolean");
            }
        }
    }
    if let Some(value) = map.get(Value::String("position".into())) {
        if value.as_f64().is_none() {
            report.error(&format!("{path}.position"), "expected a number");
        }
    }
    validate_cwd(map, path, local_root, remote, report);
    validate_env(map, path, report);
    validate_port_conflict(map, path, report);
    validate_action_port(map, path, report);
    validate_choice(map, "display", &["header", "footer", "menu"], path, report);
    validate_choice(
        map,
        "type",
        &["terminal", "command", "background"],
        path,
        report,
    );
    validate_choice(map, "mode", &["remote", "sync"], path, report);
    if !allow_sync && string_at(map, "mode") == Some("sync") {
        report.error(&format!("{path}.mode"), "sync requires an SSH project");
    }
    if string_at(map, "display") == Some("menu") {
        report.warning(
            &format!("{path}.display"),
            "menu is legacy; prefer header or footer",
        );
    }
    validate_shortcut(map, path, report);
    validate_inputs(map, path, report);
    let children = map.get(Value::String("actions".into()));
    if let Some(children) = children {
        let Some(entries) = children.as_mapping() else {
            report.error(&format!("{path}.actions"), "expected a mapping");
            return;
        };
        string_keys(entries, &format!("{path}.actions"), report);
        for (key, value) in entries {
            if let Some(name) = key.as_str() {
                validate_action(
                    value,
                    &format!("{path}.actions.{name}"),
                    local_root,
                    remote,
                    allow_sync,
                    report,
                );
            }
        }
    }
    let cmd = string_at(map, "cmd").unwrap_or_default();
    if cmd.trim().is_empty()
        && children
            .and_then(Value::as_mapping)
            .map(Mapping::is_empty)
            .unwrap_or(true)
    {
        report.warning(
            path,
            "no command or child actions; ensure this is a sparse override",
        );
    }
}

fn validate_inputs(map: &Mapping, path: &str, report: &mut Report) {
    let Some(value) = map.get(Value::String("inputs".into())) else {
        return;
    };
    let Some(inputs) = value.as_mapping() else {
        report.error(&format!("{path}.inputs"), "expected a mapping");
        return;
    };
    string_keys(inputs, &format!("{path}.inputs"), report);
    for (key, value) in inputs {
        let Some(name) = key.as_str() else { continue };
        let input_path = format!("{path}.inputs.{name}");
        let Some(input) = value.as_mapping() else {
            report.error(&input_path, "expected a mapping");
            continue;
        };
        validate_keys(
            input,
            &[
                "label",
                "type",
                "required",
                "placeholder",
                "default",
                "persist",
                "options",
            ],
            &input_path,
            report,
        );
        for field in ["label", "type", "placeholder", "default"] {
            validate_string_field(input, field, &format!("{input_path}.{field}"), report);
        }
        for field in ["required", "persist"] {
            if let Some(value) = input.get(Value::String(field.into())) {
                if value.as_bool().is_none() {
                    report.error(&format!("{input_path}.{field}"), "expected a boolean");
                }
            }
        }
        validate_choice(
            input,
            "type",
            &["text", "password", "radio"],
            &input_path,
            report,
        );
        let mut option_values = Vec::new();
        if let Some(options) = input.get(Value::String("options".into())) {
            let Some(options) = options.as_sequence() else {
                report.error(&format!("{input_path}.options"), "expected a list");
                continue;
            };
            for (index, option) in options.iter().enumerate() {
                if let Some(value) = option.as_str() {
                    option_values.push(value.to_string());
                    continue;
                }
                let Some(option) = option.as_mapping() else {
                    report.error(
                        &format!("{input_path}.options[{index}]"),
                        "expected a string or mapping",
                    );
                    continue;
                };
                validate_keys(
                    option,
                    &["label", "value"],
                    &format!("{input_path}.options[{index}]"),
                    report,
                );
                for field in ["label", "value"] {
                    validate_string_field(
                        option,
                        field,
                        &format!("{input_path}.options[{index}].{field}"),
                        report,
                    );
                }
                if let Some(value) = string_at(option, "value") {
                    option_values.push(value.to_string());
                }
            }
        }
        if string_at(input, "type") == Some("radio") && option_values.is_empty() {
            report.error(
                &format!("{input_path}.options"),
                "radio inputs require options",
            );
        }
        if let Some(default) = string_at(input, "default").filter(|v| !v.is_empty()) {
            if string_at(input, "type") == Some("radio")
                && !option_values.iter().any(|v| v == default)
            {
                report.error(
                    &format!("{input_path}.default"),
                    "must match an option value",
                );
            }
        }
    }
}

fn validate_action_port(map: &Mapping, path: &str, report: &mut Report) {
    let Some(value) = map.get(Value::String("port".into())) else {
        return;
    };
    fn entry(value: &Value) -> bool {
        if let Some(port) = value.as_i64() {
            return (0..=65535).contains(&port);
        }
        let Some(text) = value.as_str() else {
            return false;
        };
        if let Some((lo, hi)) = text.split_once('-') {
            return lo.trim().parse::<u16>().is_ok() && hi.trim().parse::<u16>().is_ok();
        }
        text.parse::<u16>().is_ok()
    }
    let valid = match value {
        Value::Sequence(values) => !values.is_empty() && values.iter().all(entry),
        _ => entry(value),
    };
    if !valid {
        report.error(
            &format!("{path}.port"),
            "expected ports or quoted inclusive ranges from 0 to 65535",
        );
    }
}

fn validate_cwd(
    map: &Mapping,
    path: &str,
    local_root: Option<&Path>,
    remote: bool,
    report: &mut Report,
) {
    validate_string_field(map, "cwd", &format!("{path}.cwd"), report);
    if remote {
        return;
    }
    let Some(cwd) = string_at(map, "cwd").filter(|v| !v.is_empty()) else {
        return;
    };
    let expanded = PathBuf::from(config::expand_home(cwd));
    let resolved = if expanded.is_absolute() {
        expanded
    } else if let Some(root) = local_root {
        root.join(expanded)
    } else {
        return;
    };
    if !resolved.is_dir() {
        report.error(
            &format!("{path}.cwd"),
            format!("directory does not exist: {}", resolved.display()),
        );
    }
}

fn validate_env(map: &Mapping, path: &str, report: &mut Report) {
    let Some(value) = map.get(Value::String("env".into())) else {
        return;
    };
    let Some(env) = value.as_mapping() else {
        report.error(&format!("{path}.env"), "expected a string mapping");
        return;
    };
    for (key, value) in env {
        if key.as_str().is_none() || value.as_str().is_none() {
            report.error(&format!("{path}.env"), "expected string keys and values");
            break;
        }
    }
}

fn validate_port_conflict(map: &Mapping, path: &str, report: &mut Report) {
    validate_choice(map, "portConflict", &["ask", "free", "fail"], path, report);
}

fn validate_shortcut(map: &Mapping, path: &str, report: &mut Report) {
    let Some(shortcut) = string_at(map, "shortcut").filter(|v| !v.is_empty()) else {
        return;
    };
    let parts: Vec<String> = shortcut
        .split('+')
        .map(|v| v.trim().to_ascii_lowercase())
        .collect();
    let modifier = parts
        .iter()
        .any(|v| matches!(v.as_str(), "cmd" | "ctrl" | "alt" | "opt"));
    if !modifier || parts.len() < 2 || parts.iter().any(String::is_empty) {
        report.error(
            &format!("{path}.shortcut"),
            "expected a modifier plus one key",
        );
    }
}

fn validate_profiles(root: &Mapping, report: &mut Report) {
    let Some(value) = root.get(Value::String("profiles".into())) else {
        return;
    };
    let Some(profiles) = value.as_mapping() else {
        report.error("config.profiles", "expected a mapping");
        return;
    };
    string_keys(profiles, "config.profiles", report);
    for (key, value) in profiles {
        if let Some(name) = key.as_str() {
            validate_string_list(Some(value), &format!("config.profiles.{name}"), report);
        }
    }
}

fn validate_extends(root: &Mapping, report: &mut Report) {
    let value = root.get(Value::String("extends".into()));
    for (index, name) in validate_string_list(value, "config.extends", report)
        .iter()
        .enumerate()
    {
        if name.is_empty() || name.contains(['/', '\\']) || matches!(name.as_str(), "." | "..") {
            report.error(
                &format!("config.extends[{index}]"),
                "expected a bare template name",
            );
        }
    }
}

fn validate_choice(map: &Mapping, key: &str, choices: &[&str], path: &str, report: &mut Report) {
    let Some(value) = map.get(Value::String(key.into())) else {
        return;
    };
    match value.as_str() {
        Some("") => {}
        Some(value) if choices.contains(&value) => {}
        _ => report.error(
            &format!("{path}.{key}"),
            format!("expected one of: {}", choices.join(", ")),
        ),
    }
}

fn validate_string_field(map: &Mapping, key: &str, path: &str, report: &mut Report) {
    if let Some(value) = map.get(Value::String(key.into())) {
        if value.as_str().is_none() {
            report.error(path, "expected a string");
        }
    }
}

fn validate_string_list(value: Option<&Value>, path: &str, report: &mut Report) -> Vec<String> {
    let Some(value) = value else {
        return Vec::new();
    };
    let Some(values) = value.as_sequence() else {
        report.error(path, "expected a list of strings");
        return Vec::new();
    };
    let mut result = Vec::new();
    for (index, value) in values.iter().enumerate() {
        match value.as_str() {
            Some(value) => result.push(value.to_string()),
            None => report.error(&format!("{path}[{index}]"), "expected a string"),
        }
    }
    result
}

fn string_at<'a>(map: &'a Mapping, key: &str) -> Option<&'a str> {
    map.get(Value::String(key.into())).and_then(Value::as_str)
}

fn string_keys(map: &Mapping, path: &str, report: &mut Report) -> BTreeSet<String> {
    let mut result = BTreeSet::new();
    for key in map.keys() {
        match key.as_str() {
            Some(key) => {
                result.insert(key.to_string());
            }
            None => report.error(path, "expected string keys"),
        }
    }
    result
}

fn validate_keys(map: &Mapping, allowed: &[&str], path: &str, report: &mut Report) {
    for key in map.keys() {
        if let Some(key) = key.as_str() {
            if !allowed.contains(&key) {
                report.error(&format!("{path}.{key}"), "unknown field");
            }
        } else {
            report.error(path, "expected string keys");
        }
    }
}

fn validate_effective_project(ctx: &Ctx, path: &Path, report: &mut Report) {
    if path.parent() != Some(ctx.projects_dir().as_path()) {
        return;
    }
    let Some(stem) = path.file_stem().and_then(|value| value.to_str()) else {
        return;
    };
    let project = match config::resolve_project(ctx, stem) {
        Ok(project) => project,
        Err(error) => {
            report.error("config", error);
            return;
        }
    };
    validate_effective_services(&project, report);
    for action in project.actions.iter().chain(project.terminals.iter()) {
        validate_effective_action(&project, action, report);
    }
}

fn validate_effective_services(project: &ResolvedProject, report: &mut Report) {
    if project.services.is_empty() && project.parent_name.is_empty() {
        report.error("config.services", "define at least one service");
    }
    let names: BTreeSet<String> = project
        .services
        .iter()
        .map(|service| service.name.clone())
        .collect();
    let mut dependencies = BTreeMap::new();
    let mut ports = BTreeMap::new();
    for service in &project.services {
        if service.cmd.trim().is_empty() {
            report.error(
                &format!("config.services.{}.cmd", service.name),
                "must not be empty after layering",
            );
        }
        if service.port > 0 {
            if let Some(existing) = ports.insert(service.port, service.name.clone()) {
                report.error(
                    &format!("config.services.{}.port", service.name),
                    format!("duplicates service {existing:?}"),
                );
            }
        }
        dependencies.insert(service.name.clone(), service.depends_on.clone());
    }
    validate_dependency_graph(&names, &dependencies, true, report);
    for (profile, services) in &project.profiles {
        for service in services {
            if !names.contains(service) {
                report.error(
                    &format!("config.profiles.{profile}"),
                    format!("unknown service {service:?}"),
                );
            }
        }
    }
}

fn validate_effective_action(
    project: &ResolvedProject,
    action: &ResolvedAction,
    report: &mut Report,
) {
    let path = format!("config.actions.{}", action.name);
    if action.cmd.trim().is_empty() && action.children.is_empty() {
        report.error(
            &path,
            "must define a command or child actions after layering",
        );
    }
    if !project.is_remote && !action.cwd.is_empty() {
        let cwd = PathBuf::from(config::resolve_cwd(&project.root, &action.cwd));
        if !cwd.is_dir() {
            report.error(
                &format!("{path}.cwd"),
                format!("directory does not exist: {}", cwd.display()),
            );
        }
    }
    for child in &action.children {
        validate_effective_action(project, child, report);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn context() -> (tempfile::TempDir, Ctx) {
        let dir = tempfile::tempdir().unwrap();
        let ctx = Ctx {
            lpm_dir: dir.path().join(".lpm"),
            socket_override: None,
        };
        std::fs::create_dir_all(ctx.projects_dir()).unwrap();
        (dir, ctx)
    }

    #[test]
    fn resolve_handles_quoted_roots_with_spaces() {
        let (dir, ctx) = context();
        let root = dir.path().join("project with spaces");
        let child = root.join("src");
        std::fs::create_dir_all(&child).unwrap();
        std::fs::write(
            ctx.project_path("web"),
            format!(
                "root: {:?}\nservices:\n  dev: npm run dev\n",
                root.to_string_lossy()
            ),
        )
        .unwrap();
        let result = config::resolve_project_for_cwd(&ctx, &child);
        assert_eq!(result.candidates, vec!["web"]);
    }

    #[test]
    fn validator_rejects_unknown_action_fields() {
        let (_dir, ctx) = context();
        let path = ctx.project_path("web");
        let value: Value = serde_yaml::from_str("root: /tmp\nservices:\n  dev: npm run dev\nactions:\n  test:\n    cmd: npm test\n    madeUp: true\n").unwrap();
        let report = validate_value(&ctx, &path, ConfigKind::Project, &value);
        assert!(report.errors.iter().any(|error| error.contains("madeUp")));
    }

    #[test]
    fn validator_warns_on_deprecated_terminals_section() {
        let (dir, ctx) = context();
        let root = dir.path().join("project");
        std::fs::create_dir_all(&root).unwrap();
        let path = ctx.project_path("web");
        let source = format!(
            "root: {}\nservices:\n  web: run-web\nterminals:\n  db: psql\n",
            root.display()
        );
        std::fs::write(&path, &source).unwrap();
        let value: Value = serde_yaml::from_str(&source).unwrap();
        let report = validate_value(&ctx, &path, ConfigKind::Project, &value);
        assert!(report.errors.is_empty(), "{:?}", report.errors);
        assert!(
            report.warnings.iter().any(|w| w.contains("deprecated")),
            "{:?}",
            report.warnings
        );
    }

    #[test]
    fn validator_accepts_command_actions_and_dependencies() {
        let (dir, ctx) = context();
        let root = dir.path().join("project");
        std::fs::create_dir_all(&root).unwrap();
        let path = ctx.project_path("web");
        let source = format!("root: {}\nservices:\n  db: run-db\n  web:\n    cmd: npm run dev\n    dependsOn: [db]\nactions:\n  test:\n    cmd: npm test\n    type: command\n", root.display());
        std::fs::write(&path, &source).unwrap();
        let value: Value = serde_yaml::from_str(&source).unwrap();
        let mut report = validate_value(&ctx, &path, ConfigKind::Project, &value);
        validate_effective_project(&ctx, &path, &mut report);
        assert!(report.errors.is_empty(), "{:?}", report.errors);
    }

    #[test]
    fn validator_accepts_dependency_from_repo_layer() {
        let (dir, ctx) = context();
        let root = dir.path().join("project");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join(".lpm.yml"), "services:\n  db: run-db\n").unwrap();
        let path = ctx.project_path("web");
        let source = format!(
            "root: {}\nservices:\n  api:\n    cmd: run-api\n    dependsOn: [db]\n",
            root.display()
        );
        std::fs::write(&path, &source).unwrap();
        let value: Value = serde_yaml::from_str(&source).unwrap();
        let mut report = validate_value(&ctx, &path, ConfigKind::Project, &value);
        validate_effective_project(&ctx, &path, &mut report);
        assert!(report.errors.is_empty(), "{:?}", report.errors);
    }

    #[test]
    fn validator_allows_sync_in_context_dependent_layers() {
        let (_dir, ctx) = context();
        let value: Value =
            serde_yaml::from_str("actions:\n  agent:\n    cmd: claude\n    mode: sync\n").unwrap();
        for kind in [ConfigKind::Global, ConfigKind::Template] {
            let report = validate_value(&ctx, &ctx.global_path(), kind, &value);
            assert!(report.errors.is_empty(), "{:?}", report.errors);
        }
    }

    #[test]
    fn validator_rejects_sync_in_local_project() {
        let (_dir, ctx) = context();
        let path = ctx.project_path("web");
        let value: Value = serde_yaml::from_str(
            "root: /tmp\nservices:\n  web: run-web\nactions:\n  agent:\n    cmd: claude\n    mode: sync\n",
        )
        .unwrap();
        let report = validate_value(&ctx, &path, ConfigKind::Project, &value);
        assert!(report
            .errors
            .iter()
            .any(|error| error.contains("sync requires")));
    }

    #[test]
    fn relative_global_path_is_classified_as_global() {
        let (_dir, ctx) = context();
        std::fs::write(ctx.global_path(), "actions:\n  test: npm test\n").unwrap();
        let path = absolute_path_from(Path::new("global.yml"), &ctx.lpm_dir);
        assert_eq!(config_kind(&ctx, &path), ConfigKind::Global);
    }

    #[test]
    fn validator_rejects_dependency_cycles() {
        let (_dir, ctx) = context();
        let path = ctx.project_path("web");
        let value: Value = serde_yaml::from_str("root: /tmp\nservices:\n  api:\n    cmd: api\n    dependsOn: [web]\n  web:\n    cmd: web\n    dependsOn: [api]\n").unwrap();
        let report = validate_value(&ctx, &path, ConfigKind::Project, &value);
        assert!(report
            .errors
            .iter()
            .any(|error| error.contains("dependency cycle")));
    }

    #[test]
    fn validator_requires_a_parent_for_worktree_projects() {
        let (_dir, ctx) = context();
        std::fs::write(ctx.project_path("base"), "root: /tmp/base\n").unwrap();
        let path = ctx.project_path("copy");
        let valid: Value =
            serde_yaml::from_str("root: /tmp/copy\nparent_name: base\nworktree: true\n").unwrap();
        let report = validate_value(&ctx, &path, ConfigKind::Project, &valid);
        assert!(report.errors.is_empty(), "{:?}", report.errors);

        let invalid: Value = serde_yaml::from_str("root: /tmp/copy\nworktree: true\n").unwrap();
        let report = validate_value(&ctx, &path, ConfigKind::Project, &invalid);
        assert!(report
            .errors
            .iter()
            .any(|error| error.contains("must set parent_name")));
    }

    #[test]
    fn candidate_validation_rejects_broken_yaml_without_touching_the_file() {
        let (dir, ctx) = context();
        let root = dir.path().join("project");
        std::fs::create_dir_all(&root).unwrap();
        let path = ctx.project_path("web");
        let original = format!("root: {}\nservices:\n  web: run-web\n", root.display());
        std::fs::write(&path, &original).unwrap();
        let target = ConfigTarget {
            layer: ConfigLayer::Project,
            project: "web".into(),
            template: String::new(),
        };
        let candidate = format!(
            "root: {}\nservices:\n  web: run-web\nactions:\n  review:\n    cmd: claude \"Review: {{{{prs}}}}\"\n",
            root.display()
        );

        let report = validate_candidate(&ctx, &target, &path, &candidate);

        assert!(report
            .errors
            .iter()
            .any(|error| error.contains("invalid YAML")));
        assert_eq!(std::fs::read_to_string(path).unwrap(), original);
    }

    #[test]
    fn candidate_validation_uses_the_candidate_for_effective_checks() {
        let (dir, ctx) = context();
        let root = dir.path().join("project");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join(".lpm.yml"), "services:\n  db: run-db\n").unwrap();
        let path = ctx.project_path("web");
        let original = format!("root: {}\nservices:\n  web: run-web\n", root.display());
        std::fs::write(&path, &original).unwrap();
        let target = ConfigTarget {
            layer: ConfigLayer::Project,
            project: "web".into(),
            template: String::new(),
        };
        let candidate = format!(
            "root: {}\nservices:\n  api:\n    cmd: run-api\n    dependsOn: [missing]\n",
            root.display()
        );

        let report = validate_candidate(&ctx, &target, &path, &candidate);

        assert!(report
            .errors
            .iter()
            .any(|error| error.contains("unknown service \"missing\"")));
        assert_eq!(std::fs::read_to_string(path).unwrap(), original);
    }

    #[test]
    fn candidate_validation_accepts_a_valid_effective_config() {
        let (dir, ctx) = context();
        let root = dir.path().join("project");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join(".lpm.yml"), "services:\n  db: run-db\n").unwrap();
        let path = ctx.project_path("web");
        std::fs::write(
            &path,
            format!("root: {}\nservices:\n  web: run-web\n", root.display()),
        )
        .unwrap();
        let target = ConfigTarget {
            layer: ConfigLayer::Project,
            project: "web".into(),
            template: String::new(),
        };
        let candidate = format!(
            "root: {}\nservices:\n  api:\n    cmd: run-api\n    dependsOn: [db]\n",
            root.display()
        );

        let report = validate_candidate(&ctx, &target, &path, &candidate);

        assert!(report.errors.is_empty(), "{:?}", report.errors);
    }
}
