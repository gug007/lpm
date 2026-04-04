package main

/*
#cgo LDFLAGS: -framework Cocoa
#include <stdlib.h>

extern void setupDockMenu(void);
extern void updateDockMenuProjects(const char **names, const int *running, int count);
*/
import "C"

import (
	"os"
	"strings"
	"sync/atomic"
	"unsafe"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

var dockApp *App
var lastDockSig atomic.Value // string — skip CGo when unchanged

//export dockMenuItemClicked
func dockMenuItemClicked(name *C.char) {
	if dockApp != nil && dockApp.ctx != nil {
		projectName := C.GoString(name)
		go func() {
			wailsRuntime.WindowShow(dockApp.ctx)
			wailsRuntime.EventsEmit(dockApp.ctx, "dock-project-selected", projectName)
		}()
	}
}

//export hideMainWindow
func hideMainWindow() {
	if dockApp != nil && dockApp.ctx != nil {
		go wailsRuntime.WindowHide(dockApp.ctx)
	}
}

//export quitApp
func quitApp() {
	go func() {
		if dockApp != nil && dockApp.ctx != nil {
			dockApp.shutdown(dockApp.ctx)
		}
		os.Exit(0)
	}()
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
