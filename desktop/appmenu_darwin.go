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
	if dockApp == nil {
		return
	}
	go func() {
		dockApp.showMainWindow()
		dockApp.checkForUpdateAndEmit()
	}()
}

//export openSettingsClicked
func openSettingsClicked() {
	if dockApp == nil {
		return
	}
	go func() {
		dockApp.showMainWindow()
		dockApp.emit("menu-open-settings")
	}()
}

//export sendFeedbackClicked
func sendFeedbackClicked() {
	if dockApp == nil {
		return
	}
	go func() {
		dockApp.showMainWindow()
		dockApp.emit("menu-open-feedback")
	}()
}

func installAppMenuExtras() {
	cVersion := C.CString(Version)
	C.setAboutVersion(cVersion)
	C.free(unsafe.Pointer(cVersion))
	C.installCheckForUpdatesMenuItem()
}
