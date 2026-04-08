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

// ChangedFile represents a single file from git status output.
type ChangedFile struct {
	Path   string `json:"path"`
	Status string `json:"status"` // "modified", "added", "deleted", "renamed", "untracked"
	Staged bool   `json:"staged"`
}

// GitChangedFiles returns the list of uncommitted files in the working tree.
// Files that appear in both the index and worktree are deduplicated into a
// single entry so the UI shows one row per path.
func (a *App) GitChangedFiles(cwd string) []ChangedFile {
	// Don't use runGit here — it calls TrimSpace which strips the leading
	// space from porcelain status entries like " M file.txt", corrupting paths.
	cmd := exec.Command("git", "status", "--porcelain=v1", "-z")
	cmd.Dir = cwd
	raw, err := cmd.Output()
	if err != nil {
		return nil
	}
	out := string(raw)
	seen := make(map[string]int) // path → index in files
	var files []ChangedFile
	entries := strings.Split(out, "\x00")
	for _, entry := range entries {
		if len(entry) < 4 {
			continue
		}
		x, y := entry[0], entry[1]
		path := entry[3:]

		if x == '?' && y == '?' {
			seen[path] = len(files)
			files = append(files, ChangedFile{Path: path, Status: "untracked", Staged: false})
			continue
		}

		status := "modified"
		staged := false

		// Prefer the index (staged) status as the label.
		if x != ' ' && x != '?' {
			staged = true
			switch x {
			case 'A':
				status = "added"
			case 'D':
				status = "deleted"
			case 'R':
				status = "renamed"
			}
		} else if y != ' ' {
			switch y {
			case 'D':
				status = "deleted"
			}
		}

		if idx, ok := seen[path]; ok {
			// Already recorded — keep as unstaged so git-add picks up working tree changes.
			files[idx].Staged = false
		} else {
			seen[path] = len(files)
			files = append(files, ChangedFile{Path: path, Status: status, Staged: staged})
		}
	}
	return files
}

// GitCommit stages the given files (or all if empty) and creates a commit.
func (a *App) GitCommit(cwd, message string, files []string) error {
	message = strings.TrimSpace(message)
	if message == "" {
		return fmt.Errorf("commit message required")
	}
	if len(files) == 0 {
		return fmt.Errorf("no files selected")
	}
	// Reset staging area so we only commit what's selected.
	runGit(cwd, "reset", "HEAD") // ignore error on initial commit (no HEAD yet)
	// Stage selected files in one call.
	addArgs := append([]string{"add", "--"}, files...)
	if _, err := runGit(cwd, addArgs...); err != nil {
		return fmt.Errorf("staging files: %w", err)
	}
	_, err := runGit(cwd, "commit", "-m", message)
	return err
}

// GitPush pushes the current branch to its upstream remote.
func (a *App) GitPush(cwd string) error {
	_, err := runGit(cwd, "push")
	return err
}

// GitDiff returns the combined diff for the given files.
// For untracked files it shows the full content as an "add" diff.
func (a *App) GitDiff(cwd string, files []string) (string, error) {
	if len(files) == 0 {
		return "", fmt.Errorf("no files")
	}
	// Diff for tracked files (staged + unstaged).
	args := append([]string{"diff", "HEAD", "--"}, files...)
	tracked, _ := runGit(cwd, args...)

	// Detect untracked files in one call instead of per-file.
	lsArgs := append([]string{"ls-files", "--"}, files...)
	lsOut, _ := runGit(cwd, lsArgs...)
	trackedSet := make(map[string]bool)
	for _, line := range strings.Split(lsOut, "\n") {
		if line != "" {
			trackedSet[line] = true
		}
	}

	var buf strings.Builder
	buf.WriteString(tracked)
	if tracked != "" {
		buf.WriteByte('\n')
	}
	for _, f := range files {
		if !trackedSet[f] {
			// git diff --no-index exits 1 when differences exist (always true
			// for new files), so we capture stdout directly instead of runGit.
			cmd := exec.Command("git", "diff", "--no-index", "--", "/dev/null", f)
			cmd.Dir = cwd
			if out, _ := cmd.Output(); len(out) > 0 {
				buf.Write(out)
				buf.WriteByte('\n')
			}
		}
	}
	return buf.String(), nil
}

// BranchCommit represents a single commit in a branch log.
type BranchCommit struct {
	Hash    string `json:"hash"`
	Subject string `json:"subject"`
	Author  string `json:"author"`
	Date    string `json:"date"`
}

// GitDefaultBranch returns the name of the default branch (main or master).
func (a *App) GitDefaultBranch(cwd string) string {
	if out, err := runGit(cwd, "symbolic-ref", "refs/remotes/origin/HEAD"); err == nil {
		parts := strings.Split(out, "/")
		if len(parts) > 0 {
			return parts[len(parts)-1]
		}
	}
	if _, err := runGit(cwd, "show-ref", "--verify", "--quiet", "refs/heads/main"); err == nil {
		return "main"
	}
	if _, err := runGit(cwd, "show-ref", "--verify", "--quiet", "refs/heads/master"); err == nil {
		return "master"
	}
	return "main"
}

// GitLogBranch returns commits on the current branch that are not on the base branch.
func (a *App) GitLogBranch(cwd, base string) ([]BranchCommit, error) {
	if base == "" {
		return nil, fmt.Errorf("base branch required")
	}
	out, err := runGit(cwd, "log", "--format=%h%x00%s%x00%an%x00%ar", base+"..HEAD")
	if err != nil {
		return nil, err
	}
	if out == "" {
		return []BranchCommit{}, nil
	}
	lines := strings.Split(out, "\n")
	commits := make([]BranchCommit, 0, len(lines))
	for _, line := range lines {
		parts := strings.SplitN(line, "\x00", 4)
		if len(parts) < 4 {
			continue
		}
		commits = append(commits, BranchCommit{
			Hash:    parts[0],
			Subject: parts[1],
			Author:  parts[2],
			Date:    parts[3],
		})
	}
	return commits, nil
}

// GitDiffBranch returns the diff between the current branch and the base branch.
func (a *App) GitDiffBranch(cwd, base string) (string, error) {
	if base == "" {
		return "", fmt.Errorf("base branch required")
	}
	return runGit(cwd, "diff", base+"...HEAD")
}

// CheckGHCLI returns true if the GitHub CLI (gh) is available in PATH.
func (a *App) CheckGHCLI() bool {
	_, err := exec.LookPath("gh")
	return err == nil
}

// CreatePullRequest pushes the current branch and creates a PR via the gh CLI.
// Returns the PR URL on success.
func (a *App) CreatePullRequest(cwd, title, body, base string) (string, error) {
	if strings.TrimSpace(title) == "" {
		return "", fmt.Errorf("title required")
	}
	branch, err := runGit(cwd, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return "", fmt.Errorf("failed to get current branch: %w", err)
	}
	// Push the branch to origin (sets upstream if needed).
	if _, err := runGit(cwd, "push", "-u", "origin", branch); err != nil {
		return "", fmt.Errorf("push failed: %w", err)
	}
	args := []string{"pr", "create", "--title", title, "--body", body}
	if base != "" {
		args = append(args, "--base", base)
	}
	cmd := exec.Command("gh", args...)
	cmd.Dir = cwd
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		if s := strings.TrimSpace(stderr.String()); s != "" {
			return "", fmt.Errorf("%s", s)
		}
		return "", err
	}
	return strings.TrimSpace(stdout.String()), nil
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
