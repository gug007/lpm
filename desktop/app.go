package main

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/gug007/lpm/internal/config"
	"github.com/gug007/lpm/internal/tmux"
	"github.com/wailsapp/wails/v3/pkg/application"
)

const (
	minWindowWidth  = 700
	minWindowHeight = 500
	maxWindowWidth  = 7680
	maxWindowHeight = 4320
)

type App struct {
	ctx        context.Context
	wails      *application.App
	mainWindow *application.WebviewWindow

	shutdownOnce sync.Once

	cacheMu      sync.RWMutex
	sessionCache map[string]string   // projectName -> session name
	paneCache    map[string][]string // session name -> pane IDs
	projectOrder []string            // cached from settings to avoid disk reads on poll

	streamMu sync.Mutex
	streams  map[string]context.CancelFunc // projectName -> cancel streaming

	ptyMu       sync.Mutex
	ptySessions map[string]*ptySession // terminalID -> session

	runningState map[string]runState // projectName -> how it was started

	pendingDownloadURL string // set by CheckForUpdate, used by InstallUpdate

	settingsMu sync.Mutex // protects read-modify-write cycles on settings.json

	lastWinW, lastWinH int // cached to skip redundant saves

	statusStore  *StatusStore
	socketServer *SocketServer

	watcherMu sync.Mutex
	watcher   *projectWatcher

	ttsMu      sync.Mutex
	ttsSession *ttsSession

	notes *notesState

	syncMu sync.Mutex
	syncs  map[string]*projectSync // projectName -> sync state

	pushWG sync.WaitGroup // tracks in-flight async sync pushes

	pfMu        sync.Mutex
	pfs         map[string][]*portForward // projectName -> active forwards
	suggestedMu sync.Mutex
	suggested   map[string]map[int]bool // projectName -> ports we've emitted a suggestion for
	dismissed   map[string]map[int]bool // projectName -> ports the user told us to stop suggesting

	pollerMu sync.Mutex
	pollers  map[string]context.CancelFunc // projectName -> cancel for the running ss poller

	// Buffered to cap how many `ssh -N -L` processes we spawn
	// concurrently when a burst of declared ports is detected at once
	// (e.g. multi-service profile starting).
	autoForwardSem chan struct{}

	detachedMu      sync.Mutex
	detachedWindows map[string]*detachedEntry // projectName -> entry
	// Set during ServiceShutdown so the detached window close hook leaves
	// the persisted Detached flag alone — letting the next launch restore
	// windows that were open at quit-time.
	shuttingDown bool
}

func NewApp() *App {
	return &App{
		sessionCache:    make(map[string]string),
		paneCache:       make(map[string][]string),
		streams:         make(map[string]context.CancelFunc),
		ptySessions:     make(map[string]*ptySession),
		runningState:    make(map[string]runState),
		statusStore:     NewStatusStore(),
		notes:           newNotesState(),
		syncs:           make(map[string]*projectSync),
		pfs:             make(map[string][]*portForward),
		suggested:       make(map[string]map[int]bool),
		dismissed:       make(map[string]map[int]bool),
		pollers:         make(map[string]context.CancelFunc),
		autoForwardSem:  make(chan struct{}, 4),
		detachedWindows: make(map[string]*detachedEntry),
	}
}

func (a *App) ServiceStartup(ctx context.Context, options application.ServiceOptions) error {
	a.ctx = ctx
	resolveUserPath()

	if err := MigratePortablePaths(); err != nil {
		fmt.Fprintf(os.Stderr, "warning: portable path migration: %v\n", err)
	}

	if err := config.EnsureSSHControlDir(); err != nil {
		fmt.Fprintf(os.Stderr, "warning: ssh control dir: %v\n", err)
	}

	SetTrafficLightPosition(14, 19)
	initDockMenu(a)
	installAppMenuExtras()

	go a.ListProjects()
	go a.autoCheckForUpdate()
	go a.pruneOrphanSyncDirs()
	go a.resumePortPollers()

	a.socketServer = NewSocketServer(a)
	if err := a.socketServer.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "warning: failed to start socket server: %v\n", err)
	}

	a.statusStore.StartPIDSweep(ctx, func(project, key string) {
		a.wails.Event.Emit("status-changed", project)
	})

	go a.installAgentHooks()
	return nil
}

func (a *App) TmuxInstalled() bool {
	return tmux.EnsureInstalled() == nil
}

// InstallTmux streams Homebrew install progress via "tmux-install-output" events.
func (a *App) InstallTmux() error {
	brewPath, err := exec.LookPath("brew")
	if err != nil {
		return fmt.Errorf("Homebrew is required to install tmux.\n\nInstall it from https://brew.sh and relaunch the app.")
	}

	a.wails.Event.Emit("tmux-install-output", "==> Installing tmux via Homebrew…")

	cmd := exec.Command(brewPath, "install", "tmux")
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to start installation: %w", err)
	}
	cmd.Stderr = cmd.Stdout

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start installation: %w", err)
	}

	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		a.wails.Event.Emit("tmux-install-output", scanner.Text())
	}

	if err := cmd.Wait(); err != nil {
		return fmt.Errorf("installation failed: %w", err)
	}

	return nil
}

// resolveUserPath runs the user's interactive login shell once to capture the
// full PATH. Needed because macOS .apps launched from Finder inherit a minimal
// PATH that excludes tools set up in ~/.zshrc (nvm, pnpm, etc.).
func resolveUserPath() {
	shell := os.Getenv("SHELL")
	if shell == "" {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Uses -l -i because zsh -l -c (login, non-interactive) skips ~/.zshrc.
	// Uses printenv (not $PATH) so fish shell returns colon-separated PATH.
	const marker = "__LPM_PATH__"
	cmd := exec.CommandContext(ctx, shell, "-l", "-i", "-c",
		"printf '"+marker+"'; printenv PATH; printf '"+marker+"'")

	out, err := cmd.Output()
	if err != nil {
		return
	}

	s := string(out)
	start := strings.Index(s, marker)
	if start < 0 {
		return
	}
	rest := s[start+len(marker):]
	end := strings.Index(rest, marker)
	if end < 0 {
		return
	}
	if path := strings.TrimSpace(rest[:end]); path != "" {
		os.Setenv("PATH", path)
	}
}

func (a *App) SaveWindowSize(width, height int) {
	if !validWindowBounds(width, height) {
		return
	}
	if width == a.lastWinW && height == a.lastWinH {
		return
	}
	err := a.withSettings(func(s *Settings) bool {
		s.WindowWidth = width
		s.WindowHeight = height
		return true
	})
	if err == nil {
		a.lastWinW = width
		a.lastWinH = height
	}
}

func (a *App) ServiceShutdown() error {
	a.shutdownOnce.Do(func() {
		a.detachedMu.Lock()
		a.shuttingDown = true
		a.detachedMu.Unlock()
		a.StopWatchingProject()
		a.StopTTS()

		if a.socketServer != nil {
			a.socketServer.Stop()
		}

		a.streamMu.Lock()
		for name, cancel := range a.streams {
			cancel()
			delete(a.streams, name)
		}
		a.streamMu.Unlock()

		a.ptyMu.Lock()
		for id, sess := range a.ptySessions {
			sess.wake()
			_ = sess.cmd.Process.Signal(syscall.SIGHUP)
			_ = sess.pty.Close()
			delete(a.ptySessions, id)
		}
		a.ptyMu.Unlock()

		a.stopAllPortPollers()
		a.stopAllPortForwards()

		// Detach mirror watchers before waiting on pushes so no new pushes
		// get queued while we're draining.
		a.stopAllSyncWatchers()

		// Wait for in-flight sync pushes to finish so we don't truncate
		// rsync mid-transfer. Bounded so a wedged remote can't block exit.
		a.waitPushes(30 * time.Second)

		a.notes.closeAll()
	})
	return nil
}

func (a *App) waitPushes(timeout time.Duration) {
	done := make(chan struct{})
	go func() {
		a.pushWG.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(timeout):
		fmt.Fprintf(os.Stderr, "shutdown: %s passed waiting for sync pushes; exiting anyway\n", timeout)
	}
}

func (a *App) ClearStatus(project string, paneID string, value string) {
	if a.statusStore.ClearByPaneValue(project, paneID, value) {
		a.wails.Event.Emit("status-changed", project)
	}
}

func (a *App) showAndEmit(event string, data ...any) {
	if a == nil || a.mainWindow == nil {
		return
	}
	go func() {
		a.mainWindow.Show()
		a.wails.Event.Emit(event, data...)
	}()
}

func (a *App) chooseFolder(title string, canCreate bool) (string, error) {
	d := a.wails.Dialog.OpenFile().
		CanChooseDirectories(true).
		CanChooseFiles(false).
		SetTitle(title)
	if canCreate {
		d = d.CanCreateDirectories(true)
	}
	return d.PromptForSingleSelection()
}
