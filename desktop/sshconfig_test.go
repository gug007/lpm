package main

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestParseSSHConfig(t *testing.T) {
	dir := t.TempDir()
	body := `
Host one
   HostName 10.0.0.1
   User alice
   IdentityFile ~/.ssh/id_one

# Aliased to the same target with a different identity
Host two
  HostName 10.0.0.1
  User alice
  IdentityFile ~/.ssh/id_two

# Multi-name block, port set, equals separator
Host alpha beta
  User=root
  Port=2222

Host *
  ServerAliveInterval 60

Host !skip-me
  User nope

Match host wildcard.example.com
  User matched

Host plain
`
	path := filepath.Join(dir, "config")
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatalf("write config: %v", err)
	}

	got, err := parseSSHConfig(path, dir, 0)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	got = dedupeSSHHosts(got)

	want := []SSHConfigHost{
		{Name: "one", HostName: "10.0.0.1", User: "alice", IdentityFile: "~/.ssh/id_one"},
		{Name: "two", HostName: "10.0.0.1", User: "alice", IdentityFile: "~/.ssh/id_two"},
		{Name: "alpha", User: "root", Port: 2222},
		{Name: "beta", User: "root", Port: 2222},
		{Name: "plain"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("hosts mismatch:\n got=%#v\nwant=%#v", got, want)
	}
}

func TestParseSSHConfigInclude(t *testing.T) {
	dir := t.TempDir()
	sshDir := filepath.Join(dir, ".ssh")
	if err := os.MkdirAll(filepath.Join(sshDir, "extra"), 0o755); err != nil {
		t.Fatal(err)
	}
	main := "Host main\n  User m\nInclude extra/*\n"
	if err := os.WriteFile(filepath.Join(sshDir, "config"), []byte(main), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(sshDir, "extra", "a"), []byte("Host extra-a\n  User a\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	got, err := parseSSHConfig(filepath.Join(sshDir, "config"), dir, 0)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	got = dedupeSSHHosts(got)

	names := make([]string, 0, len(got))
	for _, h := range got {
		names = append(names, h.Name)
	}
	want := []string{"extra-a", "main"}
	// Order isn't guaranteed by parseSSHConfig (Includes are emitted as
	// they're encountered, main blocks at end), so check membership.
	if len(names) != len(want) {
		t.Fatalf("expected %v, got %v", want, names)
	}
	have := map[string]bool{}
	for _, n := range names {
		have[n] = true
	}
	for _, n := range want {
		if !have[n] {
			t.Fatalf("missing host %q in %v", n, names)
		}
	}
}
