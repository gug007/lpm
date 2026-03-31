package main

import (
	"context"
	"time"

	"github.com/gug007/lpm/internal/tmux"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// LogUpdate is emitted to the frontend via Wails events when pane content changes.
type LogUpdate struct {
	Project string `json:"project"`
	Pane    int    `json:"pane"`
	Content string `json:"content"`
}

// StartLogStreaming begins pushing log updates for the given project via events.
func (a *App) StartLogStreaming(projectName string) {
	a.streamMu.Lock()
	defer a.streamMu.Unlock()

	if cancel, ok := a.streams[projectName]; ok {
		cancel()
	}

	ctx, cancel := context.WithCancel(context.Background())
	a.streams[projectName] = cancel

	go a.streamLogs(ctx, projectName)
}

// StopLogStreaming cancels the streaming goroutine for the given project.
func (a *App) StopLogStreaming(projectName string) {
	a.streamMu.Lock()
	defer a.streamMu.Unlock()

	if cancel, ok := a.streams[projectName]; ok {
		cancel()
		delete(a.streams, projectName)
	}
}

func (a *App) streamLogs(ctx context.Context, projectName string) {
	session := a.cachedSessionName(projectName)
	prevContent := make(map[int]string)

	// Emit initial state immediately.
	a.emitLogs(session, projectName, prevContent)

	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			a.emitLogs(session, projectName, prevContent)
		}
	}
}

func (a *App) emitLogs(session, projectName string, prevContent map[int]string) {
	panes := a.cachedPaneIDs(session)
	for i, paneID := range panes {
		content, err := tmux.CapturePaneByID(paneID, 100)
		if err != nil {
			continue
		}
		if content != prevContent[i] {
			prevContent[i] = content
			runtime.EventsEmit(a.ctx, "log-update", LogUpdate{
				Project: projectName,
				Pane:    i,
				Content: content,
			})
		}
	}
}
