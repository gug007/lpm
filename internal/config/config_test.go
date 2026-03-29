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
