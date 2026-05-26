package main

import (
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/gug007/lpm/internal/config"
)

// errCloneUnsupported signals fastClone failure on non-APFS volumes,
// cross-device clones, or non-darwin builds. Callers fall back to copyTree.
var errCloneUnsupported = errors.New("clone not supported on this filesystem")

const (
	duplicateSuffix     = "-copy-"
	duplicateIDLen      = 6
	duplicateIDAlphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
)

// DuplicateProject copies the folder literally (including .git and node_modules).
// parent_name always points at the original — duplicate chains collapse to the
// root parent so the lpm config stays shared. excludeUncommitted resets the new
// copy to HEAD, discarding tracked/untracked changes; ignored files survive.
func (a *App) DuplicateProject(name string, excludeUncommitted bool) (string, error) {
	srcCfg, err := config.LoadProject(name)
	if err != nil {
		return "", err
	}
	if srcCfg.Root == "" {
		return "", fmt.Errorf("project %q has no root folder", name)
	}
	if _, err := os.Stat(srcCfg.Root); err != nil {
		return "", fmt.Errorf("project %q root not accessible: %w", name, err)
	}

	originalName := srcCfg.ParentName
	if originalName == "" {
		originalName = name
	}

	newName, newRoot, err := nextAvailableDuplicate(originalName, srcCfg.Root)
	if err != nil {
		return "", err
	}

	if err := copyDir(srcCfg.Root, newRoot); err != nil {
		_ = os.RemoveAll(newRoot)
		return "", fmt.Errorf("copy failed: %w", err)
	}

	// Stale worktree refs point at the source project's worktrees and
	// would confuse editors into showing unrelated repositories.
	_ = os.RemoveAll(filepath.Join(newRoot, ".git", "worktrees"))

	if excludeUncommitted {
		if err := stripUncommittedChanges(newRoot); err != nil {
			_ = os.RemoveAll(newRoot)
			return "", fmt.Errorf("strip uncommitted: %w", err)
		}
	}

	pointer := &config.ProjectConfig{
		Name:       newName,
		Root:       newRoot,
		ParentName: originalName,
	}
	if err := config.SaveProject(pointer); err != nil {
		_ = os.RemoveAll(newRoot)
		return "", err
	}

	a.wails.Event.Emit("projects-changed")
	return newName, nil
}

// stripUncommittedChanges is a no-op when .git is missing. Ignored files are
// preserved by discardUncommittedChanges (`git clean -fd` honors .gitignore).
func stripUncommittedChanges(dst string) error {
	if !pathExists(filepath.Join(dst, ".git")) {
		return nil
	}
	return discardUncommittedChanges(dst)
}

// nextAvailableDuplicate returns <original>-copy-<random-6-char-id> as a
// sibling of srcRoot so the copy sits next to the source.
func nextAvailableDuplicate(originalName, srcRoot string) (string, string, error) {
	parentDir := filepath.Dir(srcRoot)
	taken := make(map[string]struct{})
	if entries, err := os.ReadDir(config.ProjectsDir()); err == nil {
		for _, e := range entries {
			n := e.Name()
			if filepath.Ext(n) == ".yml" {
				taken[n[:len(n)-4]] = struct{}{}
			}
		}
	}
	if entries, err := os.ReadDir(parentDir); err == nil {
		for _, e := range entries {
			taken[e.Name()] = struct{}{}
		}
	}
	for attempt := 0; attempt < 10; attempt++ {
		id, err := randomDuplicateID()
		if err != nil {
			return "", "", err
		}
		candidate := originalName + duplicateSuffix + id
		if _, clash := taken[candidate]; clash {
			continue
		}
		return candidate, filepath.Join(parentDir, candidate), nil
	}
	return "", "", fmt.Errorf("no available duplicate name for %q", originalName)
}

func randomDuplicateID() (string, error) {
	buf := make([]byte, duplicateIDLen)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	out := make([]byte, duplicateIDLen)
	for i, b := range buf {
		out[i] = duplicateIDAlphabet[int(b)%len(duplicateIDAlphabet)]
	}
	return string(out), nil
}

func pathExists(path string) bool {
	_, err := os.Lstat(path)
	return err == nil
}

// copyDir requires dst not to exist. Prefers APFS clonefile(2) (near-instant
// regardless of size); falls back to a recursive copy preserving symlinks
// and file modes.
func copyDir(src, dst string) error {
	info, err := os.Lstat(src)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return fmt.Errorf("source %q is not a directory", src)
	}
	if pathExists(dst) {
		return fmt.Errorf("destination %q already exists", dst)
	}
	if err := fastClone(src, dst); err == nil {
		return nil
	} else if !errors.Is(err, errCloneUnsupported) {
		return err
	}
	return copyTree(src, dst, info.Mode())
}

func copyTree(src, dst string, mode os.FileMode) error {
	if err := os.MkdirAll(dst, mode.Perm()); err != nil {
		return err
	}
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		srcPath := filepath.Join(src, entry.Name())
		dstPath := filepath.Join(dst, entry.Name())
		info, err := entry.Info()
		if err != nil {
			return err
		}
		switch {
		case info.Mode()&os.ModeSymlink != 0:
			target, err := os.Readlink(srcPath)
			if err != nil {
				return err
			}
			if err := os.Symlink(target, dstPath); err != nil {
				return err
			}
		case entry.IsDir():
			if err := copyTree(srcPath, dstPath, info.Mode()); err != nil {
				return err
			}
		default:
			if err := copyFile(srcPath, dstPath, info.Mode()); err != nil {
				return err
			}
		}
	}
	return nil
}

func copyFile(src, dst string, mode os.FileMode) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, mode.Perm())
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}
