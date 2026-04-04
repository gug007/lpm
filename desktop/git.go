package main

import (
	"bytes"
	"fmt"
	"os/exec"
	"strings"
)

type GitStatus struct {
	Branch      string `json:"branch"`
	Detached    bool   `json:"detached"`
	Uncommitted int    `json:"uncommitted"`
	IsGitRepo   bool   `json:"isGitRepo"`
}

func runGit(cwd string, args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = cwd
	var out, stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		if s := strings.TrimSpace(stderr.String()); s != "" {
			return "", fmt.Errorf("%s", s)
		}
		return "", err
	}
	return strings.TrimSpace(out.String()), nil
}

func (a *App) GitStatus(cwd string) GitStatus {
	s := GitStatus{}
	out, err := runGit(cwd, "status", "--branch", "--porcelain=v1", "-z")
	if err != nil {
		return s
	}
	s.IsGitRepo = true

	entries := strings.Split(out, "\x00")
	if len(entries) > 0 && strings.HasPrefix(entries[0], "## ") {
		header := entries[0][3:]
		if strings.HasPrefix(header, "HEAD (no branch)") {
			s.Detached = true
			if sha, err := runGit(cwd, "rev-parse", "--short", "HEAD"); err == nil {
				s.Branch = sha
			}
		} else if strings.HasPrefix(header, "No commits yet on ") {
			s.Branch = header[len("No commits yet on "):]
		} else if i := strings.Index(header, "..."); i >= 0 {
			s.Branch = header[:i]
		} else if i := strings.IndexByte(header, ' '); i >= 0 {
			s.Branch = header[:i]
		} else {
			s.Branch = header
		}
		entries = entries[1:]
	}

	var staged, unstaged, untracked int
	for _, entry := range entries {
		if len(entry) < 2 {
			continue
		}
		x, y := entry[0], entry[1]
		if x == '?' && y == '?' {
			untracked++
			continue
		}
		if x != ' ' {
			staged++
		}
		if y != ' ' {
			unstaged++
		}
	}
	if staged > unstaged {
		s.Uncommitted = staged + untracked
	} else {
		s.Uncommitted = unstaged + untracked
	}
	return s
}

func (a *App) ListBranches(cwd string) ([]string, error) {
	out, err := runGit(cwd, "for-each-ref",
		"--count=100", "--sort=-committerdate", "refs/heads",
		"--format=%(refname:short)")
	if err != nil {
		return nil, err
	}
	if out == "" {
		return []string{}, nil
	}
	lines := strings.Split(out, "\n")
	branches := make([]string, 0, len(lines))
	for _, line := range lines {
		if trimmed := strings.TrimSpace(line); trimmed != "" {
			branches = append(branches, trimmed)
		}
	}
	return branches, nil
}

func (a *App) CheckoutBranch(cwd, branch string) error {
	if branch == "" {
		return fmt.Errorf("branch name required")
	}
	_, err := runGit(cwd, "checkout", branch)
	return err
}

func (a *App) CreateBranch(cwd, name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Errorf("branch name required")
	}
	if _, err := runGit(cwd, "show-ref", "--verify", "--quiet", "refs/heads/"+name); err == nil {
		return fmt.Errorf("branch %q already exists", name)
	}
	if _, err := runGit(cwd, "branch", name); err != nil {
		if _, err2 := runGit(cwd, "switch", "-c", name); err2 != nil {
			return err
		}
		return nil
	}
	return a.CheckoutBranch(cwd, name)
}
