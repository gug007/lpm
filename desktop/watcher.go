package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/rjeczalik/notify"
)

const gitChangedEvent = "git-changed"

// Long enough to batch `git add .` or save-all; short enough that the
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

// Only these files directly under .git/ are treated as meaningful state
// transitions; everything else (objects, logs, lock files) is ignored.
var gitWatchedFiles = map[string]struct{}{
	"HEAD":             {},
	"index":            {},
	"packed-refs":      {},
	"ORIG_HEAD":        {},
	"MERGE_HEAD":       {},
	"CHERRY_PICK_HEAD": {},
	"REBASE_HEAD":      {},
	"REVERT_HEAD":      {},
	"BISECT_HEAD":      {},
}

type projectWatcher struct {
	path   string
	events chan notify.EventInfo
	stop   chan struct{}
}

// startWatcher: caller must hold watcherMu.
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
		a.wails.Event.Emit(gitChangedEvent, w.path)
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
		// Branch tips live under refs/heads/ so commits landing on a local
		// branch still trigger a refresh.
		if len(segments) == 2 {
			_, ok := gitWatchedFiles[segments[1]]
			return !ok
		}
		if len(segments) >= 3 && segments[1] == "refs" && segments[2] == "heads" {
			return false
		}
		return true
	}

	for _, seg := range segments {
		if _, bad := watcherIgnoredDirs[seg]; bad {
			return true
		}
	}
	return false
}

// StartWatchingProject (re)points the file watcher at path. Same path is a
// no-op; empty path stops watching.
func (a *App) StartWatchingProject(path string) {
	// Must be absolute so filepath.Rel in ignoreWatcherEvent resolves
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

// stopWatcherIfRoot detaches the watcher iff it's currently on path. Used
// before deleting a project folder so FSEvents isn't pumping into a tree
// we're tearing down.
func (a *App) stopWatcherIfRoot(path string) {
	if path == "" {
		return
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		abs = path
	}
	a.watcherMu.Lock()
	defer a.watcherMu.Unlock()
	if a.watcher != nil && a.watcher.path == abs {
		a.watcher.close()
		a.watcher = nil
	}
}
