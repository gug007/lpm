package main

import (
	"bytes"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
)

type GitStatus struct {
	Branch      string `json:"branch"`
	Detached    bool   `json:"detached"`
	Uncommitted int    `json:"uncommitted"`
	IsGitRepo   bool   `json:"isGitRepo"`
	HasUpstream bool   `json:"hasUpstream"`
	Ahead       int    `json:"ahead"`
	Behind      int    `json:"behind"`
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
			s.HasUpstream = true
			s.Ahead, s.Behind = parseAheadBehind(header[i+3:])
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

// parseAheadBehind reads the " [ahead N, behind M]" suffix that follows the
// upstream ref in the porcelain --branch header.
func parseAheadBehind(tail string) (ahead, behind int) {
	lb := strings.IndexByte(tail, '[')
	rb := strings.IndexByte(tail, ']')
	if lb < 0 || rb < 0 || rb < lb {
		return 0, 0
	}
	for _, part := range strings.Split(tail[lb+1:rb], ",") {
		part = strings.TrimSpace(part)
		if n, ok := strings.CutPrefix(part, "ahead "); ok {
			v, _ := strconv.Atoi(n)
			ahead = v
		} else if n, ok := strings.CutPrefix(part, "behind "); ok {
			v, _ := strconv.Atoi(n)
			behind = v
		}
	}
	return ahead, behind
}

// SyncBranch pulls then pushes to bring the current branch in sync with its upstream.
func (a *App) SyncBranch(cwd string) error {
	if _, err := runGit(cwd, "pull", "--ff-only"); err != nil {
		return err
	}
	_, err := runGit(cwd, "push")
	return err
}

type Branch struct {
	Name          string `json:"name"`
	CommitterDate int64  `json:"committerDate"`
}

func (a *App) ListBranches(cwd string) ([]Branch, error) {
	out, err := runGit(cwd, "for-each-ref",
		"--count=100", "--sort=-committerdate", "refs/heads",
		"--format=%(refname:short)%00%(committerdate:unix)")
	if err != nil {
		return nil, err
	}
	if out == "" {
		return []Branch{}, nil
	}
	lines := strings.Split(out, "\n")
	branches := make([]Branch, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		name, dateStr, ok := strings.Cut(line, "\x00")
		if !ok {
			continue
		}
		date, _ := strconv.ParseInt(dateStr, 10, 64)
		branches = append(branches, Branch{Name: name, CommitterDate: date})
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
