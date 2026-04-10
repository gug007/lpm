package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/rjeczalik/notify"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const gitChangedEvent = "git-changed"

// Long enough to batch `git add .` or a save-all; short enough that the
// commit button toggle feels instant.
const watcherDebounce = 400 * time.Millisecond

const watcherEventBuffer = 256

var watcherIgnoredDirs = map[string]struct{}{
	"node_modules":  {},
	"dist":          {},
	"build":         {},
	"out":           {},
	"target":        {},
	"vendor":        {},
	".next":         {},
	".nuxt":         {},
	".svelte-kit":   {},
	".turbo":        {},
	".cache":        {},
	".parcel-cache": {},
	".yarn":         {},
	".pnpm-store":   {},
	".venv":         {},
	"venv":          {},
	"__pycache__":   {},
	".mypy_cache":   {},
	".pytest_cache": {},
	".gradle":       {},
	".idea":         {},
	".vscode":       {},
}

// Mirrors VS Code's files.watcherExclude denylist approach: drop only known
// noisy .git/ internals so future git features keep triggering refreshes.
var gitInternalDirs = map[string]struct{}{
	"objects":           {},
	"pack":              {},
	"logs":              {},
	"lfs":               {},
	"subtree-cache":     {},
	"fsmonitor--daemon": {},
}

type projectWatcher struct {
	path   string
	events chan notify.EventInfo
	stop   chan struct{}
}

// Must be called with watcherMu held.
func (a *App) startWatcher(path string) *projectWatcher {
	w := &projectWatcher{
		path:   path,
		events: make(chan notify.EventInfo, watcherEventBuffer),
		stop:   make(chan struct{}),
	}
	if err := notify.Watch(filepath.Join(path, "..."), w.events, notify.All); err != nil {
		fmt.Fprintf(os.Stderr, "warning: failed to start file watcher for %s: %v\n", path, err)
		return nil
	}
	go a.runWatcher(w)
	return w
}

func (w *projectWatcher) close() {
	notify.Stop(w.events)
	close(w.stop)
}

func (a *App) runWatcher(w *projectWatcher) {
	var timer *time.Timer
	fire := func() {
		runtime.EventsEmit(a.ctx, gitChangedEvent, w.path)
	}
	for {
		select {
		case <-w.stop:
			if timer != nil {
				timer.Stop()
			}
			return
		case ev := <-w.events:
			if ignoreWatcherEvent(w.path, ev.Path()) {
				continue
			}
			if timer == nil {
				timer = time.AfterFunc(watcherDebounce, fire)
			} else {
				timer.Reset(watcherDebounce)
			}
		}
	}
}

func ignoreWatcherEvent(root, full string) bool {
	rel, err := filepath.Rel(root, full)
	if err != nil || rel == "." || strings.HasPrefix(rel, "..") {
		return true
	}
	segments := strings.Split(rel, string(filepath.Separator))

	if segments[0] == ".git" {
		if len(segments) >= 2 {
			if _, noisy := gitInternalDirs[segments[1]]; noisy {
				return true
			}
		}
		return false
	}

	for _, seg := range segments {
		if _, bad := watcherIgnoredDirs[seg]; bad {
			return true
		}
	}
	return false
}

// StartWatchingProject begins (or switches) the file watcher to path. Same
// path twice is a no-op; empty path stops watching.
func (a *App) StartWatchingProject(path string) {
	// Root must be absolute so filepath.Rel in ignoreWatcherEvent resolves
	// against the absolute paths FSEvents delivers.
	if path != "" {
		if abs, err := filepath.Abs(path); err == nil {
			path = abs
		}
	}

	a.watcherMu.Lock()
	defer a.watcherMu.Unlock()

	if a.watcher != nil && a.watcher.path == path {
		return
	}
	if a.watcher != nil {
		a.watcher.close()
		a.watcher = nil
	}
	if path == "" {
		return
	}
	a.watcher = a.startWatcher(path)
}

func (a *App) StopWatchingProject() {
	a.watcherMu.Lock()
	defer a.watcherMu.Unlock()
	if a.watcher != nil {
		a.watcher.close()
		a.watcher = nil
	}
}
