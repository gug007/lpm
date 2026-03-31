package main

import (
	"context"
	"fmt"
	"os/exec"
	"sync"

	"github.com/gug007/lpm/internal/tmux"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App is the main application struct bound to the Wails frontend.
type App struct {
	ctx context.Context

	cacheMu      sync.RWMutex
	sessionCache map[string]string   // projectName -> session name
	paneCache    map[string][]string // session name -> pane IDs
	projectOrder []string            // cached from settings to avoid disk reads on poll

	pendingDownloadURL string // set by CheckForUpdate, used by InstallUpdate
}

func NewApp() *App {
	return &App{
		sessionCache: make(map[string]string),
		paneCache:    make(map[string][]string),
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	settings := a.LoadSettings()
	a.projectOrder = settings.ProjectOrder

	go a.autoCheckForUpdate(settings)

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

func (a *App) SetDarkMode(dark bool) {
	if dark {
		runtime.WindowSetDarkTheme(a.ctx)
	} else {
		runtime.WindowSetLightTheme(a.ctx)
	}
}
