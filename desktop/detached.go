package main

import (
	"fmt"
	"net/url"
	"os"
	"strings"
	"sync"

	"github.com/gug007/lpm/internal/config"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

const (
	detachedEventChanged     = "detached-changed"
	detachedWindowNamePrefix = "lpm-detached-"
	detachedDefaultW         = 900
	detachedDefaultH         = 700
)

// detachedEntry holds the live window plus an in-memory copy of the
// last-persisted bounds, so resize/move events can short-circuit before
// taking settingsMu or hitting disk.
type detachedEntry struct {
	win      *application.WebviewWindow
	closed   bool
	boundsMu sync.Mutex
	bounds   DetachedWindowState
}

// DetachProject opens (or focuses, if already open) a dedicated window
// for projectName showing its detail view. Window position/size are
// restored from settings when available. The detached state is
// persisted so the window auto-reopens on next launch.
func (a *App) DetachProject(projectName string) error {
	if strings.TrimSpace(projectName) == "" {
		return fmt.Errorf("project name is required")
	}
	if _, err := config.LoadProject(projectName); err != nil {
		return fmt.Errorf("project %q not found", projectName)
	}

	a.detachedMu.Lock()
	if existing, ok := a.detachedWindows[projectName]; ok {
		a.detachedMu.Unlock()
		existing.win.Show()
		existing.win.Focus()
		return nil
	}
	state, _ := a.detachedStateLocked(projectName)
	entry := a.openDetachedWindowLocked(projectName, state)
	a.detachedMu.Unlock()

	if err := a.persistDetachedFlag(projectName, true); err != nil {
		fmt.Fprintf(os.Stderr, "warning: persist detached flag for %s: %v\n", projectName, err)
	}
	a.attachWindowHooks(entry, projectName)
	a.wails.Event.Emit(detachedEventChanged)
	return nil
}

// AttachProject closes the detached window for projectName, returning
// the project to the main window's sidebar. Service state is unaffected.
func (a *App) AttachProject(projectName string) error {
	a.detachedMu.Lock()
	entry, ok := a.detachedWindows[projectName]
	a.detachedMu.Unlock()
	if ok {
		entry.win.Close()
		return nil
	}
	if err := a.persistDetachedFlag(projectName, false); err != nil {
		return err
	}
	a.wails.Event.Emit(detachedEventChanged)
	return nil
}

// FocusDetachedWindow brings the detached window for projectName to the
// front. Returns true if a window was focused, false if the project is
// not currently detached.
func (a *App) FocusDetachedWindow(projectName string) bool {
	a.detachedMu.Lock()
	entry, ok := a.detachedWindows[projectName]
	a.detachedMu.Unlock()
	if !ok {
		return false
	}
	entry.win.Show()
	entry.win.Focus()
	return true
}

// ListDetachedProjects returns the names of projects currently open in
// their own window. Used by the frontend to mark sidebar rows.
func (a *App) ListDetachedProjects() []string {
	a.detachedMu.Lock()
	defer a.detachedMu.Unlock()
	out := make([]string, 0, len(a.detachedWindows))
	for name := range a.detachedWindows {
		out = append(out, name)
	}
	return out
}

// RestoreDetachedWindows reopens windows for every project that was
// detached when the app last quit. Called from main.go after the main
// window is created. Pre-populates the registry under a single lock so
// any early ListDetachedProjects call observes the final set.
func (a *App) RestoreDetachedWindows() {
	s := a.LoadSettings()

	type pending struct {
		name  string
		entry *detachedEntry
	}
	var queued []pending

	a.detachedMu.Lock()
	for name, state := range s.DetachedWindows {
		if !state.Detached {
			continue
		}
		if _, err := config.LoadProject(name); err != nil {
			a.detachedMu.Unlock()
			_ = a.clearDetachedEntry(name)
			a.detachedMu.Lock()
			continue
		}
		if _, already := a.detachedWindows[name]; already {
			continue
		}
		entry := a.openDetachedWindowLocked(name, state)
		queued = append(queued, pending{name, entry})
	}
	a.detachedMu.Unlock()

	for _, p := range queued {
		a.attachWindowHooks(p.entry, p.name)
	}
}

// closeDetachedWindowFor closes the detached window for projectName if
// one is open. Settings cleanup is left to removeSettingsReferences,
// which RemoveProject calls right after — coalescing both writes.
// Marking closed=true first makes the WindowClosing hook a no-op so it
// doesn't race a settings write against removeSettingsReferences.
func (a *App) closeDetachedWindowFor(projectName string) {
	a.detachedMu.Lock()
	entry, ok := a.detachedWindows[projectName]
	if ok {
		entry.closed = true
	}
	a.detachedMu.Unlock()
	if ok {
		entry.win.Close()
	}
}

// openDetachedWindowLocked creates the OS window and registers it in
// the in-memory map. Caller must hold detachedMu. Window event hooks
// are attached separately via attachWindowHooks (outside the lock) so
// the Wails machinery isn't called with a.detachedMu held.
func (a *App) openDetachedWindowLocked(projectName string, state DetachedWindowState) *detachedEntry {
	opts := application.WebviewWindowOptions{
		Name:           detachedWindowNamePrefix + projectName,
		Title:          projectName,
		URL:            "/?detached=" + url.QueryEscape(projectName),
		MinWidth:       minWindowWidth,
		MinHeight:      minWindowHeight,
		EnableFileDrop: true,
		Mac: application.MacWindow{
			Backdrop: application.MacBackdropTranslucent,
			TitleBar: application.MacTitleBarHiddenInsetUnified,
		},
	}
	if validWindowBounds(state.Width, state.Height) {
		opts.Width = state.Width
		opts.Height = state.Height
		opts.InitialPosition = application.WindowXY
		opts.X = state.X
		opts.Y = state.Y
	} else {
		opts.Width = detachedDefaultW
		opts.Height = detachedDefaultH
		opts.InitialPosition = application.WindowCentered
	}

	entry := &detachedEntry{bounds: state}
	if a.wails != nil {
		entry.win = a.wails.Window.NewWithOptions(opts)
	}
	a.detachedWindows[projectName] = entry
	return entry
}

func (a *App) attachWindowHooks(entry *detachedEntry, projectName string) {
	if entry.win == nil {
		return
	}

	// Closing the window re-attaches the project to the main window
	// (matches user expectation — services keep running independently).
	// During app shutdown or project removal, leave the persisted flag
	// untouched: shutdown wants to restore on next launch; removal will
	// wipe the entire entry separately.
	entry.win.RegisterHook(events.Common.WindowClosing, func(*application.WindowEvent) {
		a.detachedMu.Lock()
		shuttingDown := a.shuttingDown
		alreadyClosed := entry.closed
		entry.closed = true
		if cur, ok := a.detachedWindows[projectName]; ok && cur == entry {
			delete(a.detachedWindows, projectName)
		}
		a.detachedMu.Unlock()
		if shuttingDown || alreadyClosed {
			return
		}
		_ = a.persistDetachedFlag(projectName, false)
		a.wails.Event.Emit(detachedEventChanged)
	})

	// Bounds saving: WindowDidMove/Resize fire ~60Hz on macOS. The
	// in-memory bounds cache short-circuits before taking settingsMu so
	// no-op events don't touch disk; only genuine changes do.
	saveBounds := func(*application.WindowEvent) {
		entry.boundsMu.Lock()
		closed := entry.closed
		entry.boundsMu.Unlock()
		if closed {
			return
		}
		w, h := entry.win.Size()
		x, y := entry.win.Position()
		if !validWindowBounds(w, h) {
			return
		}
		entry.boundsMu.Lock()
		if entry.bounds.X == x && entry.bounds.Y == y &&
			entry.bounds.Width == w && entry.bounds.Height == h {
			entry.boundsMu.Unlock()
			return
		}
		entry.bounds.X, entry.bounds.Y = x, y
		entry.bounds.Width, entry.bounds.Height = w, h
		next := entry.bounds
		entry.boundsMu.Unlock()
		a.persistDetachedBounds(projectName, next)
	}
	entry.win.OnWindowEvent(events.Common.WindowDidMove, saveBounds)
	entry.win.OnWindowEvent(events.Common.WindowDidResize, saveBounds)
}

// detachedStateLocked returns the persisted state for projectName plus
// whether an entry existed. Caller must hold detachedMu (so callers can
// chain a state lookup with the open-and-register step atomically).
func (a *App) detachedStateLocked(projectName string) (DetachedWindowState, bool) {
	s := a.LoadSettings()
	state, ok := s.DetachedWindows[projectName]
	return state, ok
}

func (a *App) persistDetachedFlag(projectName string, detached bool) error {
	return a.withSettings(func(s *Settings) bool {
		if s.DetachedWindows == nil {
			s.DetachedWindows = make(map[string]DetachedWindowState)
		}
		cur := s.DetachedWindows[projectName]
		if cur.Detached == detached {
			return false
		}
		cur.Detached = detached
		s.DetachedWindows[projectName] = cur
		return true
	})
}

func (a *App) persistDetachedBounds(projectName string, bounds DetachedWindowState) {
	err := a.withSettings(func(s *Settings) bool {
		if s.DetachedWindows == nil {
			s.DetachedWindows = make(map[string]DetachedWindowState)
		}
		cur := s.DetachedWindows[projectName]
		if cur.X == bounds.X && cur.Y == bounds.Y &&
			cur.Width == bounds.Width && cur.Height == bounds.Height {
			return false
		}
		cur.X, cur.Y, cur.Width, cur.Height = bounds.X, bounds.Y, bounds.Width, bounds.Height
		s.DetachedWindows[projectName] = cur
		return true
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "warning: save detached bounds for %s: %v\n", projectName, err)
	}
}

func (a *App) clearDetachedEntry(projectName string) error {
	return a.withSettings(func(s *Settings) bool {
		if _, ok := s.DetachedWindows[projectName]; !ok {
			return false
		}
		delete(s.DetachedWindows, projectName)
		return true
	})
}
