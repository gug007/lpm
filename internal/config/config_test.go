package config

import (
	"os"
	"path/filepath"
	"testing"

	"gopkg.in/yaml.v3"
)

func TestServiceUnmarshalShorthand(t *testing.T) {
	input := `
services:
  dev: npm run dev
  api:
    cmd: go run .
    port: 8080
    env:
      DB: postgres://localhost
`
	var cfg struct {
		Services map[string]Service `yaml:"services"`
	}
	if err := yaml.Unmarshal([]byte(input), &cfg); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}

	// Test shorthand
	dev, ok := cfg.Services["dev"]
	if !ok {
		t.Fatal("missing service 'dev'")
	}
	if dev.Cmd != "npm run dev" {
		t.Errorf("dev.Cmd = %q, want %q", dev.Cmd, "npm run dev")
	}

	// Test full form
	api, ok := cfg.Services["api"]
	if !ok {
		t.Fatal("missing service 'api'")
	}
	if api.Cmd != "go run ." {
		t.Errorf("api.Cmd = %q, want %q", api.Cmd, "go run .")
	}
	if api.Port != 8080 {
		t.Errorf("api.Port = %d, want %d", api.Port, 8080)
	}
	if api.Env["DB"] != "postgres://localhost" {
		t.Errorf("api.Env[DB] = %q, want %q", api.Env["DB"], "postgres://localhost")
	}
}

func TestServiceMapSequenceForm(t *testing.T) {
	input := `
services:
  - name: web
    cmd: npm start
    port: 3000
  - name: api
    cmd: go run .
`
	var cfg struct {
		Services ServiceMap `yaml:"services"`
	}
	if err := yaml.Unmarshal([]byte(input), &cfg); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	if len(cfg.Services) != 2 {
		t.Fatalf("got %d services, want 2", len(cfg.Services))
	}
	if cfg.Services["web"].Cmd != "npm start" || cfg.Services["web"].Port != 3000 {
		t.Errorf("web = %+v", cfg.Services["web"])
	}
	if cfg.Services["api"].Cmd != "go run ." {
		t.Errorf("api.Cmd = %q", cfg.Services["api"].Cmd)
	}
}

func TestServiceMapMappingFormStillWorks(t *testing.T) {
	input := `
services:
  dev: npm run dev
  api:
    cmd: go run .
    port: 8080
`
	var cfg struct {
		Services ServiceMap `yaml:"services"`
	}
	if err := yaml.Unmarshal([]byte(input), &cfg); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	if cfg.Services["dev"].Cmd != "npm run dev" {
		t.Errorf("dev.Cmd = %q", cfg.Services["dev"].Cmd)
	}
	if cfg.Services["api"].Port != 8080 {
		t.Errorf("api.Port = %d", cfg.Services["api"].Port)
	}
}

func TestServiceMapSequenceMissingName(t *testing.T) {
	input := `
services:
  - cmd: npm start
`
	var cfg struct {
		Services ServiceMap `yaml:"services"`
	}
	err := yaml.Unmarshal([]byte(input), &cfg)
	if err == nil {
		t.Fatal("expected error for missing name")
	}
}

func TestServiceMapSequenceDuplicateName(t *testing.T) {
	input := `
services:
  - name: web
    cmd: a
  - name: web
    cmd: b
`
	var cfg struct {
		Services ServiceMap `yaml:"services"`
	}
	err := yaml.Unmarshal([]byte(input), &cfg)
	if err == nil {
		t.Fatal("expected error for duplicate name")
	}
}

func ptr[T any](v T) *T { return &v }

func TestMergeActionFallback_SparseOverrideInheritsAllFields(t *testing.T) {
	global := ActionMap{
		"deploy": Action{
			Cmd:     "./deploy.sh",
			Label:   "Deploy",
			Cwd:     "scripts",
			Env:     map[string]string{"NODE_ENV": "prod"},
			Confirm: true,
			Display: "header",
		},
	}
	project := ActionMap{
		"deploy": Action{Position: ptr(3.0), Display: "footer"},
	}

	merged := mergeActionFallback(project, global)
	got := merged["deploy"]

	if got.Cmd != "./deploy.sh" {
		t.Errorf("Cmd = %q, want %q (inherited)", got.Cmd, "./deploy.sh")
	}
	if got.Label != "Deploy" {
		t.Errorf("Label = %q, want %q (inherited)", got.Label, "Deploy")
	}
	if got.Cwd != "scripts" {
		t.Errorf("Cwd = %q, want %q (inherited)", got.Cwd, "scripts")
	}
	if got.Env["NODE_ENV"] != "prod" {
		t.Errorf("Env[NODE_ENV] = %q, want %q (inherited)", got.Env["NODE_ENV"], "prod")
	}
	if !got.Confirm {
		t.Error("Confirm = false, want true (inherited)")
	}
	if got.Display != "footer" {
		t.Errorf("Display = %q, want %q (project override)", got.Display, "footer")
	}
	if got.Position == nil || *got.Position != 3.0 {
		t.Errorf("Position = %v, want 3 (project override)", got.Position)
	}
}

func TestMergeActionFallback_KeyOnlyInGlobalIsCopied(t *testing.T) {
	global := ActionMap{"only-global": Action{Cmd: "g", Display: "footer"}}
	merged := mergeActionFallback(nil, global)
	got := merged["only-global"]
	if got.Cmd != "g" || got.Display != "footer" {
		t.Errorf("got %+v, want global entry copied", got)
	}
}

func TestMergeServiceFallback_FieldLevelOverride(t *testing.T) {
	repo := ServiceMap{
		"api": Service{Cmd: "go run .", Port: 8080, Env: map[string]string{"DB": "pg"}},
	}
	project := ServiceMap{
		"api": Service{Port: 9090}, // user wants a different port; cmd/env inherit
	}
	merged := mergeServiceFallback(project, repo)
	got := merged["api"]
	if got.Cmd != "go run ." {
		t.Errorf("Cmd = %q, want inherited", got.Cmd)
	}
	if got.Port != 9090 {
		t.Errorf("Port = %d, want 9090 (project override)", got.Port)
	}
	if got.Env["DB"] != "pg" {
		t.Errorf("Env[DB] = %q, want inherited", got.Env["DB"])
	}
}

func TestMergeProfilesFallback_KeyLevel(t *testing.T) {
	repo := map[string][]string{
		"full":    {"api", "web"},
		"backend": {"api", "db"},
	}
	project := map[string][]string{
		"backend": {"api"}, // project's slice fully replaces repo's
	}
	merged := mergeProfilesFallback(project, repo)
	if got := merged["backend"]; len(got) != 1 || got[0] != "api" {
		t.Errorf("backend = %v, want [api]", got)
	}
	if got := merged["full"]; len(got) != 2 || got[0] != "api" || got[1] != "web" {
		t.Errorf("full = %v, want inherited [api web]", got)
	}
}

func TestApplyDefaults_RepoLayersBetweenProjectAndGlobal(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	globalPath := filepath.Join(home, ".lpm", "global.yml")
	if err := os.MkdirAll(filepath.Dir(globalPath), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(globalPath, []byte(`
actions:
  deploy:
    cmd: echo from-global
    confirm: true
  global-only:
    cmd: g
`), 0o644); err != nil {
		t.Fatalf("write global: %v", err)
	}

	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, ".lpm.yml"), []byte(`
services:
  api:
    cmd: go run .
    port: 8080
actions:
  deploy:
    cmd: echo from-repo
  repo-only:
    cmd: r
profiles:
  backend: [api]
`), 0o644); err != nil {
		t.Fatalf("write repo: %v", err)
	}

	cfg := &ProjectConfig{
		Root: root,
		Services: ServiceMap{
			"api": Service{Port: 9090},
		},
	}
	cfg.ApplyDefaults()

	if got := cfg.Services["api"].Port; got != 9090 {
		t.Errorf("api.Port = %d, want 9090 (project)", got)
	}
	if got := cfg.Services["api"].Cmd; got != "go run ." {
		t.Errorf("api.Cmd = %q, want inherited from repo", got)
	}
	if got := cfg.Actions["deploy"].Cmd; got != "echo from-repo" {
		t.Errorf("deploy.Cmd = %q, want repo (overrides global)", got)
	}
	if !cfg.Actions["deploy"].Confirm {
		t.Error("deploy.Confirm = false, want inherited from global")
	}
	if got := cfg.Actions["repo-only"].Cmd; got != "r" {
		t.Errorf("repo-only.Cmd = %q, want %q", got, "r")
	}
	if got := cfg.Actions["global-only"].Cmd; got != "g" {
		t.Errorf("global-only.Cmd = %q, want %q", got, "g")
	}
	if got := cfg.Profiles["backend"]; len(got) != 1 || got[0] != "api" {
		t.Errorf("profile backend = %v, want [api]", got)
	}
}

func TestApplyDefaults_MissingRepoFileIsNoOp(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	cfg := &ProjectConfig{
		Root:    t.TempDir(), // no .lpm.yml inside
		Actions: ActionMap{"local": Action{Cmd: "x"}},
	}
	cfg.ApplyDefaults()
	if got := cfg.Actions["local"].Cmd; got != "x" {
		t.Errorf("local.Cmd = %q, want unchanged", got)
	}
}

func TestApplyDefaults_SkipsRepoForRemote(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	root := t.TempDir()
	// A .lpm.yml at this path exists but should be ignored for SSH projects
	// since the path is a stale local copy, not the remote source of truth.
	if err := os.WriteFile(filepath.Join(root, ".lpm.yml"), []byte(`
actions:
  ghost: { cmd: should-not-load }
`), 0o644); err != nil {
		t.Fatalf("write repo: %v", err)
	}
	cfg := &ProjectConfig{
		Root: root,
		SSH:  &SSHSettings{Host: "h", User: "u"},
	}
	cfg.ApplyDefaults()
	if _, ok := cfg.Actions["ghost"]; ok {
		t.Error("ghost action loaded; SSH projects must skip repo file")
	}
}

func TestMergeActionFallback_RecursiveChildren(t *testing.T) {
	global := ActionMap{
		"parent": Action{
			Cmd: "parent-cmd",
			Actions: ActionMap{
				"a": Action{Cmd: "child-a"},
				"b": Action{Cmd: "child-b", Position: ptr(1.0)},
			},
		},
	}
	project := ActionMap{
		"parent": Action{
			Actions: ActionMap{
				"b": Action{Position: ptr(5.0)},
			},
		},
	}
	merged := mergeActionFallback(project, global)
	parent := merged["parent"]
	if parent.Cmd != "parent-cmd" {
		t.Errorf("parent.Cmd = %q, want inherited", parent.Cmd)
	}
	if got := parent.Actions["a"].Cmd; got != "child-a" {
		t.Errorf("child a inherited Cmd = %q, want %q", got, "child-a")
	}
	b := parent.Actions["b"]
	if b.Cmd != "child-b" {
		t.Errorf("child b Cmd = %q, want %q (inherited)", b.Cmd, "child-b")
	}
	if b.Position == nil || *b.Position != 5.0 {
		t.Errorf("child b Position = %v, want 5 (project override)", b.Position)
	}
}
