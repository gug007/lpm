package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
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
	// Set project order before wails.Run so the first frontend ListProjects
	// call sees the saved order even if startup() hasn't completed yet.
	app.cacheMu.Lock()
	app.projectOrder = s.ProjectOrder
	app.cacheMu.Unlock()

	err := wails.Run(&options.App{
		Title:            "lpm",
		Width:            width,
		Height:           height,
		MinWidth:         700,
		MinHeight:        500,
		BackgroundColour: &options.RGBA{R: 0, G: 0, B: 0, A: 0},
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		DragAndDrop: &options.DragAndDrop{
			EnableFileDrop:     true,
			DisableWebViewDrop: true,
		},
		OnStartup:         app.startup,
		OnShutdown:        app.shutdown,
		HideWindowOnClose: true,
		Bind: []interface{}{
			app,
		},
		Mac: &mac.Options{
			TitleBar: &mac.TitleBar{
				TitlebarAppearsTransparent: true,
				HideTitle:                 true,
				FullSizeContent:           true,
				UseToolbar:                true,
				HideToolbarSeparator:      true,
			},
			WebviewIsTransparent: true,
			WindowIsTranslucent:  true,
			About: &mac.AboutInfo{
				Title:   "lpm — Local Project Manager",
				Message: "",
				Icon:    appIcon,
			},
		},
	})
	if err != nil {
		panic(err)
	}
}
