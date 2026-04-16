package main

import (
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/gug007/lpm/internal/config"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// errCloneUnsupported is returned by fastClone when the filesystem can't
// honor a copy-on-write clone (non-APFS volume, cross-device, non-darwin
// platform). Callers fall back to copyTree.
var errCloneUnsupported = errors.New("clone not supported on this filesystem")

const (
	duplicateSuffix     = "-copy-"
	duplicateIDLen      = 6
	duplicateIDAlphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
)

// DuplicateProject creates a new project as a sibling folder of `name`, with
// its LPM config shared from the original project. Folder contents are copied
// literally, including .git and node_modules. Returns the new project name.
//
// When `name` is itself a duplicate, the new duplicate still points at the
// same original (parent_name is never chained), but the folder content comes
// from whichever project was passed in — preserving any in-progress work in
// the duplicate the user right-clicked.
//
// When excludeUncommitted is true and the source has a git repository, the
// new copy is reset to HEAD: all uncommitted changes (staged, unstaged, and
// untracked files) are discarded. Ignored files (e.g. node_modules) are
// preserved.
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

	// Remove stale git worktree references copied from the source. These
	// point at the original project's worktrees (e.g. agent worktrees) and
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

	runtime.EventsEmit(a.ctx, "projects-changed")
	return newName, nil
}

// stripUncommittedChanges resets the working tree of dst to HEAD: staged and
// unstaged modifications are discarded, untracked files are removed, and
// ignored files (like node_modules) stay put. A missing .git directory is
// treated as a no-op.
func stripUncommittedChanges(dst string) error {
	if !pathExists(filepath.Join(dst, ".git")) {
		return nil
	}
	return discardUncommittedChanges(dst)
}

// nextAvailableDuplicate returns a collision-free (name, root) pair for a new
// duplicate of `originalName`. Names are <original>-copy-<id>, where <id> is a
// random 6-char alphanumeric string, retried until neither the LPM project
// file nor the target folder exists. The folder is always a sibling of
// `srcRoot` so the new copy sits next to whichever project the user
// right-clicked.
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

// copyDir recursively copies src to dst. The destination must not exist.
// On APFS (macOS) this uses clonefile(2) for a metadata-only copy-on-write
// clone of the whole tree — near-instant regardless of size. On other
// filesystems or platforms it falls back to a plain recursive copy that
// preserves regular files, directories, symlinks, and file modes.
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
