package main

/*
#include <stdlib.h>
#cgo LDFLAGS: -framework Cocoa
extern void installCheckForUpdatesMenuItem(void);
extern void setAboutVersion(const char *version);
*/
import "C"

import (
	"unsafe"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

//export checkForUpdatesClicked
func checkForUpdatesClicked() {
	if dockApp != nil && dockApp.ctx != nil {
		ctx := dockApp.ctx
		go func() {
			wailsRuntime.WindowShow(ctx)
			dockApp.checkForUpdateAndEmit()
		}()
	}
}

//export openSettingsClicked
func openSettingsClicked() {
	if dockApp != nil && dockApp.ctx != nil {
		ctx := dockApp.ctx
		go func() {
			wailsRuntime.WindowShow(ctx)
			wailsRuntime.EventsEmit(ctx, "menu-open-settings")
		}()
	}
}

func installAppMenuExtras() {
	cVersion := C.CString(Version)
	C.setAboutVersion(cVersion)
	C.free(unsafe.Pointer(cVersion))
	C.installCheckForUpdatesMenuItem()
}
