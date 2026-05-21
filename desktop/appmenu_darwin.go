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
)

//export checkForUpdatesClicked
func checkForUpdatesClicked() {
	if dockApp == nil || dockApp.mainWindow == nil {
		return
	}
	go func() {
		dockApp.mainWindow.Show()
		dockApp.checkForUpdateAndEmit()
	}()
}

//export openSettingsClicked
func openSettingsClicked() { dockApp.showAndEmit("menu-open-settings") }

//export sendFeedbackClicked
func sendFeedbackClicked() { dockApp.showAndEmit("menu-open-feedback") }

func installAppMenuExtras() {
	cVersion := C.CString(Version)
	C.setAboutVersion(cVersion)
	C.free(unsafe.Pointer(cVersion))
	C.installCheckForUpdatesMenuItem()
}
