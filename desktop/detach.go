package main

import (
	"fmt"
	"net/url"
	"os"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

const (
	// DetachedEvent is the custom event the Go side emits whenever the set of
	// detached windows changes. Kept in sync with frontend/src/events.ts.
	DetachedEvent = "detached-projects-changed"
	// DetachedProjectParam is the URL query param the detached window carries
	// so the React bundle knows to render the single-project view. Kept in
	// sync with frontend/src/events.ts.
	DetachedProjectParam = "project"

	detachedWindowMinW     = 700
	detachedWindowMinH     = 500
	detachedWindowDefaultW = 1100
	detachedWindowDefaultH = 800
	// macOS streams Did-Move events continuously during drag; coalesce so we
	// don't rewrite settings.json hundreds of times per drag.
	geometrySaveDebounce = 400 * time.Millisecond
)

// DetachProject opens the given project in its own window, or focuses the
// existing one if already detached.
func (a *App) DetachProject(name string) error {
	if name == "" {
		return fmt.Errorf("project name required")
	}

	a.detachMu.Lock()
	if win, ok := a.detachedWindows[name]; ok {
		a.detachMu.Unlock()
		focusWindow(win)
		return nil
	}
	a.detachMu.Unlock()

	state := a.LoadSettings().DetachedProjects[name]
	w, h, x, y := resolveDetachedGeometry(state)

	opts := application.WebviewWindowOptions{
		Name:           "project:" + name,
		Title:          fmt.Sprintf("lpm · %s", name),
		URL:            "/?" + DetachedProjectParam + "=" + url.QueryEscape(name),
		Width:          w,
		Height:         h,
		MinWidth:       detachedWindowMinW,
		MinHeight:      detachedWindowMinH,
		BackgroundType: application.BackgroundTypeTranslucent,
		Mac:            lpmMacWindow(),
	}
	if state != nil {
		opts.InitialPosition = application.WindowXY
		opts.X = x
		opts.Y = y
	}

	win := a.wails.Window.NewWithOptions(opts)

	a.detachMu.Lock()
	a.detachedWindows[name] = win
	a.detachMu.Unlock()

	saver := newGeometrySaver(a, name, win)
	for _, ev := range []events.WindowEventType{
		events.Common.WindowDidMove,
		events.Common.WindowDidResize,
	} {
		win.OnWindowEvent(ev, func(*application.WindowEvent) { saver.schedule() })
	}

	// Hook (not listener) so the final flush runs before the default close
	// listener destroys the window.
	win.RegisterHook(events.Common.WindowClosing, func(*application.WindowEvent) {
		saver.flushAndStop()
		a.forgetDetached(name)
	})

	a.markDetached(name, &DetachedWindowState{X: x, Y: y, Width: w, Height: h})
	a.emit(DetachedEvent)
	return nil
}

// AttachProject re-attaches a detached project to the main window by closing
// its detached window. The close hook does the settings cleanup.
func (a *App) AttachProject(name string) error {
	a.detachMu.Lock()
	win, ok := a.detachedWindows[name]
	a.detachMu.Unlock()
	if !ok {
		return nil
	}
	win.Close()
	return nil
}

// FocusProjectWindow brings the project's detached window to the foreground.
// No-op when the project isn't detached so callers don't accidentally re-focus
// an unrelated window.
func (a *App) FocusProjectWindow(name string) error {
	a.detachMu.Lock()
	win, ok := a.detachedWindows[name]
	a.detachMu.Unlock()
	if ok {
		focusWindow(win)
	}
	return nil
}

// ListDetachedProjects returns the names of projects currently shown in
// detached windows, for the sidebar's visual state.
func (a *App) ListDetachedProjects() []string {
	a.detachMu.Lock()
	defer a.detachMu.Unlock()
	out := make([]string, 0, len(a.detachedWindows))
	for name := range a.detachedWindows {
		out = append(out, name)
	}
	return out
}

// restoreDetachedWindows re-opens the windows that were detached when the
// app last exited. Called from ServiceStartup.
func (a *App) restoreDetachedWindows() {
	for name := range a.LoadSettings().DetachedProjects {
		if err := a.DetachProject(name); err != nil {
			fmt.Fprintf(os.Stderr, "warning: restore detached window %q: %v\n", name, err)
		}
	}
}

func (a *App) forgetDetached(name string) {
	a.detachMu.Lock()
	delete(a.detachedWindows, name)
	a.detachMu.Unlock()

	a.settingsMu.Lock()
	s := a.loadSettingsLocked()
	if _, ok := s.DetachedProjects[name]; ok {
		delete(s.DetachedProjects, name)
		if len(s.DetachedProjects) == 0 {
			s.DetachedProjects = nil
		}
		_ = a.saveSettingsLocked(s)
	}
	a.settingsMu.Unlock()

	a.emit(DetachedEvent)
}

func (a *App) markDetached(name string, state *DetachedWindowState) {
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()
	s := a.loadSettingsLocked()
	if s.DetachedProjects == nil {
		s.DetachedProjects = make(map[string]*DetachedWindowState)
	}
	s.DetachedProjects[name] = state
	_ = a.saveSettingsLocked(s)
}

func resolveDetachedGeometry(s *DetachedWindowState) (w, h, x, y int) {
	if s == nil {
		return detachedWindowDefaultW, detachedWindowDefaultH, 0, 0
	}
	w, h, x, y = s.Width, s.Height, s.X, s.Y
	if w < detachedWindowMinW {
		w = detachedWindowDefaultW
	}
	if h < detachedWindowMinH {
		h = detachedWindowDefaultH
	}
	return
}

func focusWindow(win *application.WebviewWindow) {
	if win.IsMinimised() {
		win.Restore()
	}
	win.Show()
	win.Focus()
}

// lpmMacWindow is the shared Mac titlebar/backdrop style used by the main
// window and detached project windows so they feel like the same app.
func lpmMacWindow() application.MacWindow {
	return application.MacWindow{
		Backdrop: application.MacBackdropTranslucent,
		TitleBar: application.MacTitleBar{
			AppearsTransparent:   true,
			HideTitle:            true,
			FullSizeContent:      true,
			UseToolbar:           true,
			HideToolbarSeparator: true,
		},
	}
}

// geometrySaver coalesces a burst of move/resize events into a single
// settings write after the user stops interacting with the window.
type geometrySaver struct {
	app  *App
	name string
	win  *application.WebviewWindow

	mu      sync.Mutex
	timer   *time.Timer
	stopped bool
}

func newGeometrySaver(a *App, name string, win *application.WebviewWindow) *geometrySaver {
	return &geometrySaver{app: a, name: name, win: win}
}

func (g *geometrySaver) schedule() {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.stopped {
		return
	}
	if g.timer == nil {
		g.timer = time.AfterFunc(geometrySaveDebounce, g.flush)
	} else {
		g.timer.Reset(geometrySaveDebounce)
	}
}

func (g *geometrySaver) flush() {
	x, y := g.win.Position()
	w, h := g.win.Width(), g.win.Height()
	if w < detachedWindowMinW || h < detachedWindowMinH {
		return
	}
	g.app.markDetached(g.name, &DetachedWindowState{X: x, Y: y, Width: w, Height: h})
}

func (g *geometrySaver) flushAndStop() {
	g.mu.Lock()
	g.stopped = true
	if g.timer != nil {
		g.timer.Stop()
		g.timer = nil
	}
	g.mu.Unlock()
	g.flush()
}
