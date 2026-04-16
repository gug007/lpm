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

// VS Code-style allowlist: these are the only files directly under .git/
// whose changes we treat as meaningful state transitions. Everything else
// (objects, logs, lock files, fsmonitor chatter) is ignored.
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
	refs   int
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
		a.emit(gitChangedEvent, w.path)
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
		// Allowlist a handful of files that represent real git state; ignore
		// the rest. Branch tips live under refs/heads/ so commits landing on
		// a local branch still trigger a refresh.
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

// StartWatchingProject begins (or shares) a file watcher for path. Each call
// is ref-counted so independent callers (main + detached windows) can each
// ask for the project they care about without clobbering each other.
func (a *App) StartWatchingProject(path string) {
	abs := absWatcherPath(path)
	if abs == "" {
		return
	}

	a.watcherMu.Lock()
	defer a.watcherMu.Unlock()
	if w := a.watchers[abs]; w != nil {
		w.refs++
		return
	}
	w := a.startWatcher(abs)
	if w == nil {
		return
	}
	w.refs = 1
	if a.watchers == nil {
		a.watchers = make(map[string]*projectWatcher)
	}
	a.watchers[abs] = w
}

// StopWatchingProject decrements the ref count for path; the watcher is
// closed when the last caller releases it.
func (a *App) StopWatchingProject(path string) {
	abs := absWatcherPath(path)
	if abs == "" {
		return
	}
	a.watcherMu.Lock()
	defer a.watcherMu.Unlock()
	w := a.watchers[abs]
	if w == nil {
		return
	}
	w.refs--
	if w.refs <= 0 {
		w.close()
		delete(a.watchers, abs)
	}
}

// stopAllWatchers closes every active watcher. Called only from shutdown.
func (a *App) stopAllWatchers() {
	a.watcherMu.Lock()
	defer a.watcherMu.Unlock()
	for path, w := range a.watchers {
		w.close()
		delete(a.watchers, path)
	}
}

func absWatcherPath(path string) string {
	if path == "" {
		return ""
	}
	if abs, err := filepath.Abs(path); err == nil {
		return abs
	}
	return path
}

// stopWatcherIfRoot drops the watcher for path regardless of refcount — used
// before deleting a project folder so FSEvents isn't pumping into a tree
// we're tearing down.
func (a *App) stopWatcherIfRoot(path string) {
	abs := absWatcherPath(path)
	if abs == "" {
		return
	}
	a.watcherMu.Lock()
	defer a.watcherMu.Unlock()
	if w := a.watchers[abs]; w != nil {
		w.close()
		delete(a.watchers, abs)
	}
}
