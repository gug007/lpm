package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/gug007/lpm/internal/config"
)

// CreateProjectFromClone clones a git repo into <destParent>/<name>, then
// registers the result as an lpm project. Mirrors CreateProject /
// CreateSSHProject in projects.go.
func (a *App) CreateProjectFromClone(name, url, branch, destParent string) error {
	destPath, err := cloneValidate(name, url, branch, destParent)
	if err != nil {
		return err
	}

	if err := cloneRepo(a.ctx, url, branch, destPath); err != nil {
		cloneCleanup(destPath)
		return mapCloneError(err)
	}

	cfg := buildClonedProjectConfig(name, destPath)
	if err := config.SaveProject(cfg); err != nil {
		cloneCleanup(destPath)
		return err
	}

	a.wails.Event.Emit("projects-changed")
	return nil
}

// urlPattern matches the four scheme forms plus scp-style git@host:path.
var urlPattern = regexp.MustCompile(
	`^(?:` +
		`https://[^\s]+` +
		`|http://[^\s]+` +
		`|ssh://[^\s]+` +
		`|git://[^\s]+` +
		`|[A-Za-z0-9_.-]+@[A-Za-z0-9._-]+:[^\s]+` +
		`)$`,
)

// shellMeta rejects characters that could escape an argv slot if the URL
// were ever interpolated into a shell. We use `--` with git clone, but
// defense in depth.
var shellMeta = regexp.MustCompile("[`$;&|<>()\\\\\"']")

// branchBadRune catches refname violations check-ref-format guards.
var branchBadRune = regexp.MustCompile(`[\s~^:?*\[\\]`)

// cloneValidate inspects the four user-supplied fields and returns the
// destination directory the clone should land in. All errors are safe to
// render in the modal — they describe the field at fault without leaking
// internals.
func cloneValidate(name, url, branch, destParent string) (string, error) {
	if err := config.ValidateName(name); err != nil {
		return "", fmt.Errorf("project name: %w", err)
	}
	if config.ProjectExists(name) {
		return "", fmt.Errorf("project name: %q is already in use", name)
	}

	url = strings.TrimSpace(url)
	if url == "" {
		return "", fmt.Errorf("repository URL: required")
	}
	if strings.ContainsAny(url, "\r\n") {
		return "", fmt.Errorf("repository URL: must not contain line breaks")
	}
	if shellMeta.MatchString(url) {
		return "", fmt.Errorf("repository URL: contains unsupported characters")
	}
	if !urlPattern.MatchString(url) {
		return "", fmt.Errorf("repository URL: must start with https://, http://, ssh://, git://, or use git@host:path form")
	}

	branch = strings.TrimSpace(branch)
	if branch != "" {
		if err := validateBranchName(branch); err != nil {
			return "", fmt.Errorf("branch: %w", err)
		}
	}

	destParent = strings.TrimSpace(destParent)
	if destParent == "" {
		return "", fmt.Errorf("destination folder: required")
	}
	destParent = config.ExpandHome(destParent)
	info, statErr := os.Stat(destParent)
	if statErr != nil {
		if os.IsNotExist(statErr) {
			return "", fmt.Errorf("destination folder: %q does not exist", destParent)
		}
		return "", fmt.Errorf("destination folder: cannot access %q", destParent)
	}
	if !info.IsDir() {
		return "", fmt.Errorf("destination folder: %q is not a directory", destParent)
	}
	if err := checkWritable(destParent); err != nil {
		return "", fmt.Errorf("destination folder: %q is not writable", destParent)
	}

	destDir := filepath.Join(destParent, name)
	if _, err := os.Stat(destDir); err == nil {
		return "", fmt.Errorf("destination folder: %q already exists", destDir)
	} else if !os.IsNotExist(err) {
		return "", fmt.Errorf("destination folder: cannot access %q", destDir)
	}

	return destDir, nil
}

// validateBranchName approximates `git check-ref-format --branch`.
func validateBranchName(b string) error {
	if b == "" {
		return fmt.Errorf("required")
	}
	if strings.HasPrefix(b, "-") {
		return fmt.Errorf("must not start with '-'")
	}
	if strings.HasPrefix(b, "/") || strings.HasSuffix(b, "/") {
		return fmt.Errorf("must not start or end with '/'")
	}
	if strings.HasSuffix(b, ".") || strings.HasSuffix(b, ".lock") {
		return fmt.Errorf("must not end with '.' or '.lock'")
	}
	if strings.Contains(b, "..") || strings.Contains(b, "@{") || strings.Contains(b, "//") {
		return fmt.Errorf("contains invalid sequence")
	}
	for _, r := range b {
		if r < 0x20 || r == 0x7f {
			return fmt.Errorf("contains control characters")
		}
	}
	if branchBadRune.MatchString(b) {
		return fmt.Errorf("contains invalid characters")
	}
	return nil
}

// checkWritable creates and removes a temp file in dir to surface ACL/RO
// mounts that os.Stat alone would not catch.
func checkWritable(dir string) error {
	f, err := os.CreateTemp(dir, ".lpm-clone-write-*")
	if err != nil {
		return err
	}
	name := f.Name()
	f.Close()
	os.Remove(name)
	return nil
}

// cloneRepo runs `git clone` into destPath. destPath must NOT exist yet — git
// creates it. When branch is non-empty, --single-branch lands the user on the
// exact branch they asked for without fetching every other ref. Cancellation
// via ctx kills the git process. On failure the returned error embeds the
// first ~2KB of stderr with ANSI / control characters stripped so it can be
// shown directly in the modal.
func cloneRepo(ctx context.Context, url, branch, destPath string) error {
	args := []string{"clone", "--progress"}
	if branch = strings.TrimSpace(branch); branch != "" {
		args = append(args, "--branch", branch, "--single-branch")
	}
	args = append(args, "--", url, destPath)

	cmd := exec.CommandContext(ctx, "git", args...)
	var combined bytes.Buffer
	cmd.Stdout = &combined
	cmd.Stderr = &combined

	if err := cmd.Run(); err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return ctxErr
		}
		msg := cleanGitOutput(combined.String())
		if msg == "" {
			return fmt.Errorf("git clone: %w", err)
		}
		return fmt.Errorf("git clone: %s", msg)
	}
	return nil
}

// cleanGitOutput strips ANSI escapes and control bytes from git's progress
// output, then returns the trimmed first cloneStderrCap bytes.
func cleanGitOutput(s string) string {
	const cloneStderrCap = 2048
	var b strings.Builder
	b.Grow(len(s))
	i := 0
	for i < len(s) {
		c := s[i]
		if c == 0x1B && i+1 < len(s) && s[i+1] == '[' {
			j := i + 2
			for j < len(s) {
				if s[j] >= 0x40 && s[j] <= 0x7E {
					j++
					break
				}
				j++
			}
			i = j
			continue
		}
		// \r becomes \n so progress lines git rewrites with carriage returns
		// land as separate lines instead of a single garbled string.
		if c < 0x20 && c != '\n' && c != '\t' {
			if c == '\r' {
				b.WriteByte('\n')
			}
			i++
			continue
		}
		b.WriteByte(c)
		i++
	}
	out := strings.TrimSpace(b.String())
	if len(out) > cloneStderrCap {
		out = out[:cloneStderrCap]
	}
	return out
}

// cloneCleanup best-effort removes destDir if it looks like a partial git
// clone. Only removes when .git is present, or when destDir is empty — this
// way we never nuke pre-existing user data even if validation was bypassed.
func cloneCleanup(destDir string) {
	if destDir == "" {
		return
	}
	info, err := os.Stat(destDir)
	if err != nil || !info.IsDir() {
		return
	}
	gitPath := filepath.Join(destDir, ".git")
	if _, err := os.Stat(gitPath); err != nil {
		entries, readErr := os.ReadDir(destDir)
		if readErr != nil || len(entries) > 0 {
			return
		}
		_ = os.Remove(destDir)
		return
	}
	_ = os.RemoveAll(destDir)
}

// mapCloneError translates common git failure messages into short,
// user-friendly text for the modal. Falls back to the original error.
func mapCloneError(err error) error {
	if err == nil {
		return nil
	}
	msg := err.Error()
	low := strings.ToLower(msg)
	switch {
	case strings.Contains(low, "could not resolve host"),
		strings.Contains(low, "name or service not known"):
		return errors.New("Network error: could not reach the repository host. Check your connection and the URL.")
	case strings.Contains(low, "permission denied"),
		strings.Contains(low, "publickey"),
		strings.Contains(low, "authentication failed"):
		return errors.New("Authentication failed. Check your SSH keys or credentials for this repository.")
	case strings.Contains(low, "repository not found"),
		strings.Contains(low, "not found") && strings.Contains(low, "repository"):
		return errors.New("Repository not found. Verify the URL and that you have access.")
	case strings.Contains(low, "remote branch") && strings.Contains(low, "not found"):
		return errors.New("Branch not found in the remote repository.")
	case strings.Contains(low, "already exists and is not an empty directory"):
		return errors.New("Destination already exists. Choose a different folder or project name.")
	case strings.Contains(low, "ssl certificate"),
		strings.Contains(low, "certificate verify failed"):
		return errors.New("TLS certificate error reaching the repository host.")
	case strings.Contains(low, "context canceled"),
		strings.Contains(low, "context deadline exceeded"):
		return errors.New("Clone canceled or timed out.")
	default:
		return fmt.Errorf("clone failed: %s", strings.TrimSpace(msg))
	}
}

// buildClonedProjectConfig produces the ProjectConfig saved after a
// successful clone. Mirrors CreateProject's defaults.
func buildClonedProjectConfig(name, root string) *config.ProjectConfig {
	return &config.ProjectConfig{
		Name:     name,
		Root:     root,
		Services: map[string]config.Service{"dev": {Cmd: "echo 'configure me'"}},
	}
}
