package config

import (
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
