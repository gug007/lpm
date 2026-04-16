package main

/*
#cgo LDFLAGS: -framework Cocoa
#include <stdlib.h>

extern void setupDockMenu(void);
extern void updateDockMenuProjects(const char **names, const int *running, int count);
extern void forceTerminateApp(void);
*/
import "C"

import (
	"os"
	"strings"
	"sync/atomic"
	"time"
	"unsafe"
)

var dockApp *App
var lastDockSig atomic.Value // string — skip CGo when unchanged

//export dockMenuItemClicked
func dockMenuItemClicked(name *C.char) {
	if dockApp == nil {
		return
	}
	projectName := C.GoString(name)
	go func() {
		dockApp.showMainWindow()
		dockApp.emit("dock-project-selected", projectName)
	}()
}

//export showMainWindow
func showMainWindow() {
	if dockApp == nil {
		return
	}
	go dockApp.showMainWindow()
}

//export quitApp
func quitApp() {
	go func() {
		if dockApp != nil {
			// Hard deadline: exit even if shutdown hangs.
			go func() {
				time.Sleep(3 * time.Second)
				os.Exit(0)
			}()
			dockApp.shutdown()
		}
		os.Exit(0)
	}()
}

// forceTerminate triggers a proper Cocoa termination so the dock icon
// is cleaned up before the updated app instance launches.
func forceTerminate() {
	C.forceTerminateApp()
}

func initDockMenu(app *App) {
	dockApp = app
	C.setupDockMenu()
}

func dockMenuSig(projects []ProjectInfo) string {
	var b strings.Builder
	for _, p := range projects {
		b.WriteString(p.Name)
		if p.Running {
			b.WriteByte('1')
		} else {
			b.WriteByte('0')
		}
		b.WriteByte(',')
	}
	return b.String()
}

func refreshDockMenu(projects []ProjectInfo) {
	sig := dockMenuSig(projects)
	if prev, _ := lastDockSig.Load().(string); prev == sig {
		return
	}
	lastDockSig.Store(sig)

	if len(projects) == 0 {
		C.updateDockMenuProjects(nil, nil, 0)
		return
	}

	cNames := make([]*C.char, len(projects))
	cRunning := make([]C.int, len(projects))
	for i, p := range projects {
		cNames[i] = C.CString(p.Name)
		if p.Running {
			cRunning[i] = 1
		}
	}

	// Safe: C side copies strings synchronously before the async dispatch.
	C.updateDockMenuProjects(
		(**C.char)(unsafe.Pointer(&cNames[0])),
		(*C.int)(unsafe.Pointer(&cRunning[0])),
		C.int(len(projects)),
	)

	for _, cn := range cNames {
		C.free(unsafe.Pointer(cn))
	}
}
