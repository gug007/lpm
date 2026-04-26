package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gug007/lpm/internal/config"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// pullTTL skips redundant rsync pulls when a successful pull happened
// recently. Keeps rapid-action chains snappy without sacrificing the
// "remote may have changed" guarantee for the typical interactive cadence.
const pullTTL = 5 * time.Second

type projectSync struct {
	mu       sync.Mutex
	path     string
	lastPull time.Time
}

func projectSyncDir(name string) string {
	return filepath.Join(config.LpmDir(), "sync", name)
}

// syncState returns the per-project record, allocating on first use.
// Holds the global syncMu only briefly to find/create the entry; the
// returned record has its own mu the caller should take for the rsync.
func (a *App) syncState(name string) *projectSync {
	a.syncMu.Lock()
	defer a.syncMu.Unlock()
	s, ok := a.syncs[name]
	if !ok {
		s = &projectSync{path: projectSyncDir(name)}
		a.syncs[name] = s
	}
	return s
}

// ensureProjectSync rsyncs ssh.dir into the project's local mirror and
// returns the local path. Pull uses --update so any local edits newer
// than the remote survive the sync. Pulls within pullTTL of a recent
// successful run are skipped.
func (a *App) ensureProjectSync(cfg *config.ProjectConfig) (string, error) {
	if cfg.SSH == nil {
		return "", fmt.Errorf("project %q is not an SSH project", cfg.Name)
	}
	if strings.TrimSpace(cfg.SSH.Dir) == "" {
		return "", errors.New("ssh.dir is required for mode: sync")
	}
	if _, err := exec.LookPath("rsync"); err != nil {
		return "", errors.New("rsync is not installed; macOS ships with it — check your PATH")
	}

	state := a.syncState(cfg.Name)
	state.mu.Lock()
	defer state.mu.Unlock()

	if err := os.MkdirAll(state.path, 0755); err != nil {
		return "", fmt.Errorf("create sync dir: %w", err)
	}

	if !state.lastPull.IsZero() && time.Since(state.lastPull) < pullTTL {
		return state.path, nil
	}

	args := rsyncArgs(cfg.SSH, remoteRef(cfg.SSH)+"/", state.path+"/")
	out, err := exec.Command("rsync", args...).CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("rsync pull: %s", config.TrimTail(out, 500))
	}
	state.lastPull = time.Now()
	return state.path, nil
}

// pushProjectSync mirrors local edits back to the remote. Uses --update
// so a remote file newer than the local copy is never overwritten.
func (a *App) pushProjectSync(cfg *config.ProjectConfig) error {
	if cfg.SSH == nil {
		return nil
	}
	a.syncMu.Lock()
	state, ok := a.syncs[cfg.Name]
	a.syncMu.Unlock()
	if !ok {
		return nil
	}

	state.mu.Lock()
	defer state.mu.Unlock()

	args := rsyncArgs(cfg.SSH, state.path+"/", remoteRef(cfg.SSH)+"/")
	out, err := exec.Command("rsync", args...).CombinedOutput()
	if err != nil {
		return fmt.Errorf("rsync push: %s", config.TrimTail(out, 500))
	}
	return nil
}

// pushProjectSyncAsync fires a push in the background and reports any
// failure via the sync-error event. Tracked via App.pushWG so shutdown
// can wait for in-flight pushes (with a timeout) before lpm exits.
func (a *App) pushProjectSyncAsync(cfg *config.ProjectConfig) {
	a.pushWG.Add(1)
	go func() {
		defer a.pushWG.Done()
		if err := a.pushProjectSync(cfg); err != nil {
			fmt.Fprintf(os.Stderr, "sync push for %s: %v\n", cfg.Name, err)
			runtime.EventsEmit(a.ctx, "sync-error", err.Error())
		}
	}()
}

func (a *App) removeProjectSync(name string) {
	a.syncMu.Lock()
	delete(a.syncs, name)
	a.syncMu.Unlock()
	if err := os.RemoveAll(projectSyncDir(name)); err != nil {
		fmt.Fprintf(os.Stderr, "remove sync dir %s: %v\n", name, err)
	}
}

// pruneOrphanSyncDirs removes ~/.lpm/sync/<name> directories whose
// project no longer exists. Run once at startup; failures only logged.
func (a *App) pruneOrphanSyncDirs() {
	base := filepath.Join(config.LpmDir(), "sync")
	entries, err := os.ReadDir(base)
	if err != nil {
		return
	}
	for _, e := range entries {
		if !e.IsDir() || config.ProjectExists(e.Name()) {
			continue
		}
		path := filepath.Join(base, e.Name())
		if err := os.RemoveAll(path); err != nil {
			fmt.Fprintf(os.Stderr, "prune orphan sync %s: %v\n", path, err)
		}
	}
}

func rsyncArgs(s *config.SSHSettings, src, dst string) []string {
	return []string{"-az", "--update", "-e", rsyncShell(s), src, dst}
}

func rsyncShell(s *config.SSHSettings) string {
	parts := []string{"ssh"}
	if s.Port > 0 && s.Port != 22 {
		parts = append(parts, "-p", strconv.Itoa(s.Port))
	}
	if key := strings.TrimSpace(s.Key); key != "" {
		parts = append(parts, "-i", config.ExpandHome(key))
	}
	return strings.Join(parts, " ")
}

func remoteRef(s *config.SSHSettings) string {
	return fmt.Sprintf("%s@%s:%s", s.User, s.Host, s.Dir)
}
