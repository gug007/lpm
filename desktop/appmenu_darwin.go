package main

/*
#cgo LDFLAGS: -framework Cocoa
extern void installCheckForUpdatesMenuItem(void);
*/
import "C"

import (
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

//export checkForUpdatesClicked
func checkForUpdatesClicked() {
	if dockApp != nil && dockApp.ctx != nil {
		ctx := dockApp.ctx
		go func() {
			wailsRuntime.WindowShow(ctx)
			wailsRuntime.EventsEmit(ctx, "menu-check-for-updates")
		}()
	}
}

func installAppMenuExtras() {
	C.installCheckForUpdatesMenuItem()
}
