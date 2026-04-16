package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var appIcon []byte

func main() {
	app := NewApp()

	width, height := 960, 640
	s := app.LoadSettings()
	if s.WindowWidth >= minWindowWidth && s.WindowHeight >= minWindowHeight &&
		s.WindowWidth <= maxWindowWidth && s.WindowHeight <= maxWindowHeight {
		width = s.WindowWidth
		height = s.WindowHeight
	}
	// Seed projectOrder before ServiceStartup so the first frontend
	// ListProjects call sees the saved order.
	app.cacheMu.Lock()
	app.projectOrder = s.ProjectOrder
	app.cacheMu.Unlock()

	wailsApp := application.New(application.Options{
		Name:        "lpm",
		Description: "Local Project Manager",
		Icon:        appIcon,
		Services: []application.Service{
			application.NewService(app),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: false,
		},
	})

	// Must be assigned before Run() so ServiceStartup can emit events.
	app.wails = wailsApp

	mainWindow := wailsApp.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:             "main",
		Title:            "lpm",
		Width:            width,
		Height:           height,
		MinWidth:         minWindowWidth,
		MinHeight:        minWindowHeight,
		MaxWidth:         maxWindowWidth,
		MaxHeight:        maxWindowHeight,
		BackgroundType:   application.BackgroundTypeTranslucent,
		BackgroundColour: application.RGBA{Red: 0, Green: 0, Blue: 0, Alpha: 0},
		EnableFileDrop:   true,
		Mac: lpmMacWindow(),
	})
	app.mainWindow = mainWindow

	// Hide instead of destroy so the app keeps running once closed; relies on
	// ApplicationShouldTerminateAfterLastWindowClosed=false.
	mainWindow.RegisterHook(events.Common.WindowClosing, func(e *application.WindowEvent) {
		e.Cancel()
		mainWindow.Hide()
	})

	// Forward v3's per-element WindowFilesDropped to a custom event so the
	// frontend can route by (x, y) the same way it did under v2's OnFileDrop.
	mainWindow.OnWindowEvent(events.Common.WindowFilesDropped, func(e *application.WindowEvent) {
		files := e.Context().DroppedFiles()
		details := e.Context().DropTargetDetails()
		payload := map[string]any{"files": files}
		if details != nil {
			payload["x"] = details.X
			payload["y"] = details.Y
		}
		app.emit("file-drop", payload)
	})

	if err := wailsApp.Run(); err != nil {
		log.Fatal(err)
	}
}
