package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/gug007/lpm/internal/tmux"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx context.Context

	cacheMu      sync.RWMutex
	sessionCache map[string]string   // projectName -> session name
	paneCache    map[string][]string // session name -> pane IDs
	projectOrder []string            // cached from settings to avoid disk reads on poll

	streamMu sync.Mutex
	streams  map[string]context.CancelFunc // projectName -> cancel streaming

	runningProfiles map[string]string // projectName -> profile used to start

	pendingDownloadURL string // set by CheckForUpdate, used by InstallUpdate
}

func NewApp() *App {
	return &App{
		sessionCache:    make(map[string]string),
		paneCache:       make(map[string][]string),
		streams:         make(map[string]context.CancelFunc),
		runningProfiles: make(map[string]string),
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	resolveUserPath()
	settings := a.LoadSettings()
	a.projectOrder = settings.ProjectOrder

	go a.autoCheckForUpdate()

	if err := tmux.EnsureInstalled(); err != nil {
		sel, _ := runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
			Type:          runtime.QuestionDialog,
			Title:         "tmux not found",
			Message:       "tmux is required but not installed.\n\nWould you like to install it now via Homebrew?",
			Buttons:       []string{"Install", "Cancel"},
			DefaultButton: "Install",
			CancelButton:  "Cancel",
		})
		if sel == "Install" {
			a.installTmux()
		}
	}
}

func (a *App) installTmux() {
	brewPath, err := exec.LookPath("brew")
	if err != nil {
		runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
			Type:    runtime.ErrorDialog,
			Title:   "Homebrew not found",
			Message: "Homebrew is required to install tmux.\n\nInstall it from https://brew.sh and relaunch the app.",
		})
		return
	}

	cmd := exec.Command(brewPath, "install", "tmux")
	if out, err := cmd.CombinedOutput(); err != nil {
		runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
			Type:    runtime.ErrorDialog,
			Title:   "Installation failed",
			Message: fmt.Sprintf("Failed to install tmux:\n\n%s", string(out)),
		})
		return
	}

	runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
		Type:    runtime.InfoDialog,
		Title:   "tmux installed",
		Message: "tmux was installed successfully.",
	})
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

func (a *App) shutdown(ctx context.Context) {
	a.streamMu.Lock()
	for name, cancel := range a.streams {
		cancel()
		delete(a.streams, name)
	}
	a.streamMu.Unlock()
}

func (a *App) SetDarkMode(dark bool) {
	if dark {
		runtime.WindowSetDarkTheme(a.ctx)
	} else {
		runtime.WindowSetLightTheme(a.ctx)
	}
}
