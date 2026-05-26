package main

import (
	"embed"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var appIcon []byte

const eventFilesDropped = "files-dropped"

type fileDropPayload struct {
	X     int      `json:"x"`
	Y     int      `json:"y"`
	Paths []string `json:"paths"`
}

// registerFileDropEvent wires WindowFilesDropped to the frontend's
// "files-dropped" event. Detached windows need this too — without it, drops
// only trigger JS drag-overlay hooks and the drop itself is lost.
func (a *App) registerFileDropEvent(window *application.WebviewWindow) {
	window.OnWindowEvent(events.Common.WindowFilesDropped, func(e *application.WindowEvent) {
		ctx := e.Context()
		payload := fileDropPayload{Paths: ctx.DroppedFiles()}
		if details := ctx.DropTargetDetails(); details != nil {
			payload.X = details.X
			payload.Y = details.Y
		}
		a.wails.Event.Emit(eventFilesDropped, payload)
	})
}

func main() {
	appInstance := NewApp()

	width, height := 960, 640
	s := appInstance.LoadSettings()
	if s.WindowWidth >= minWindowWidth && s.WindowHeight >= minWindowHeight &&
		s.WindowWidth <= maxWindowWidth && s.WindowHeight <= maxWindowHeight {
		width = s.WindowWidth
		height = s.WindowHeight
	}
	// Set project order before app.Run so the first frontend ListProjects
	// call sees the saved order even if startup hasn't completed yet.
	appInstance.cacheMu.Lock()
	appInstance.projectOrder = s.ProjectOrder
	appInstance.cacheMu.Unlock()

	app := application.New(application.Options{
		Name:        "lpm",
		Description: "lpm — Local Project Manager",
		Icon:        appIcon,
		Services: []application.Service{
			application.NewService(appInstance),
		},
		Assets: application.AssetOptions{
			Handler: application.BundledAssetFileServer(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: false,
		},
	})

	appInstance.wails = app

	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:          "lpm",
		Width:          width,
		Height:         height,
		MinWidth:       700,
		MinHeight:      500,
		EnableFileDrop: true,
		Mac: application.MacWindow{
			Backdrop: application.MacBackdropTranslucent,
			TitleBar: application.MacTitleBarHiddenInsetUnified,
		},
	})

	appInstance.mainWindow = window

	// Hide instead of quit so background work (sync, port forwards, sockets) survives.
	window.RegisterHook(events.Common.WindowClosing, func(e *application.WindowEvent) {
		window.Hide()
		e.Cancel()
	})

	appInstance.registerFileDropEvent(window)

	app.Event.OnApplicationEvent(events.Common.ApplicationStarted, func(_ *application.ApplicationEvent) {
		appInstance.RestoreDetachedWindows()
	})

	if err := app.Run(); err != nil {
		panic(err)
	}
}
