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

	"github.com/gug007/lpm/internal/tmux"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	minWindowWidth  = 700
	minWindowHeight = 500
	maxWindowWidth  = 7680
	maxWindowHeight = 4320
)

type App struct {
	ctx context.Context

	cacheMu      sync.RWMutex
	sessionCache map[string]string   // projectName -> session name
	paneCache    map[string][]string // session name -> pane IDs
	projectOrder []string            // cached from settings to avoid disk reads on poll

	streamMu sync.Mutex
	streams  map[string]context.CancelFunc // projectName -> cancel streaming

	ptyMu       sync.Mutex
	ptySessions map[string]*ptySession // terminalID -> session

	runningProfiles map[string]string // projectName -> profile used to start

	pendingDownloadURL string // set by CheckForUpdate, used by InstallUpdate

	settingsMu sync.Mutex // protects read-modify-write cycles on settings.json

	lastWinW, lastWinH int // cached to skip redundant saves

	statusStore  *StatusStore
	socketServer *SocketServer
}

func NewApp() *App {
	return &App{
		sessionCache:    make(map[string]string),
		paneCache:       make(map[string][]string),
		streams:         make(map[string]context.CancelFunc),
		ptySessions:     make(map[string]*ptySession),
		runningProfiles: make(map[string]string),
		statusStore:     NewStatusStore(),
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	resolveUserPath()

	SetTrafficLightPosition(14, 19)
	initDockMenu(a)
	installAppMenuExtras()

	go a.ListProjects() // populate dock menu before frontend loads
	go a.autoCheckForUpdate()

	// Start Unix socket server for external tool integration
	a.socketServer = NewSocketServer(a)
	if err := a.socketServer.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "warning: failed to start socket server: %v\n", err)
	}

	// Start PID sweep to clear stale agent status entries
	a.statusStore.StartPIDSweep(ctx, func(project, key string) {
		runtime.EventsEmit(a.ctx, "status-changed", project)
	})

	// Auto-install agent hooks (Claude Code, Codex) for running indicator
	go a.installAgentHooks()
}

// TmuxInstalled reports whether tmux is available on the system.
func (a *App) TmuxInstalled() bool {
	return tmux.EnsureInstalled() == nil
}

// InstallTmux installs tmux via Homebrew, streaming progress lines to the
// frontend via "tmux-install-output" events. The frontend should call
// TmuxInstalled first and only invoke this when tmux is missing.
func (a *App) InstallTmux() error {
	brewPath, err := exec.LookPath("brew")
	if err != nil {
		return fmt.Errorf("Homebrew is required to install tmux.\n\nInstall it from https://brew.sh and relaunch the app.")
	}

	runtime.EventsEmit(a.ctx, "tmux-install-output", "==> Installing tmux via Homebrew…")

	cmd := exec.Command(brewPath, "install", "tmux")
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to start installation: %w", err)
	}
	cmd.Stderr = cmd.Stdout // merge stderr into stdout

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start installation: %w", err)
	}

	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		runtime.EventsEmit(a.ctx, "tmux-install-output", scanner.Text())
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
	if width < minWindowWidth || height < minWindowHeight ||
		width > maxWindowWidth || height > maxWindowHeight {
		return
	}
	if width == a.lastWinW && height == a.lastWinH {
		return
	}
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()
	s := a.loadSettingsLocked()
	s.WindowWidth = width
	s.WindowHeight = height
	if err := a.saveSettingsLocked(s); err == nil {
		a.lastWinW = width
		a.lastWinH = height
	}
}

func (a *App) shutdown(ctx context.Context) {
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
}

func (a *App) ClearDoneStatus(project string, paneID string) {
	if a.statusStore.ClearByPaneValue(project, paneID, StatusDone) {
		runtime.EventsEmit(a.ctx, "status-changed", project)
	}
}

func (a *App) ClearWaitingStatus(project string, paneID string) {
	if a.statusStore.ClearByPaneValue(project, paneID, StatusWaiting) {
		runtime.EventsEmit(a.ctx, "status-changed", project)
	}
}

func (a *App) ClearErrorStatus(project string, paneID string) {
	if a.statusStore.ClearByPaneValue(project, paneID, StatusError) {
		runtime.EventsEmit(a.ctx, "status-changed", project)
	}
}

func (a *App) SetDarkMode(dark bool) {
	if dark {
		runtime.WindowSetDarkTheme(a.ctx)
	} else {
		runtime.WindowSetLightTheme(a.ctx)
	}
}
