// Package main is lpm Link's built-in Tailscale node, built as a static library
// (-buildmode=c-archive) and called from Swift through include/LpmTailnet.h.
// Strings returned to the caller are malloc'd and released with LpmTailnetFree.
package main

/*
#include <stdlib.h>
*/
import "C"

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"time"
	"unsafe"

	"lpm.cx/tailnet/node"
)

const (
	commandTimeout = 30 * time.Second
	bridgeWindow   = 30 * time.Second
)

var nd = node.New()

func cString(s string) *C.char {
	if s == "" {
		return nil
	}
	return C.CString(s)
}

func errString(err error) *C.char {
	if err == nil {
		return nil
	}
	return C.CString(err.Error())
}

//export LpmTailnetStart
func LpmTailnetStart(dir, hostname *C.char) *C.char {
	return errString(nd.Start(C.GoString(dir), C.GoString(hostname)))
}

//export LpmTailnetStop
func LpmTailnetStop() {
	nd.Stop()
}

//export LpmTailnetRestart
func LpmTailnetRestart(dir, hostname *C.char) *C.char {
	return errString(nd.Restart(C.GoString(dir), C.GoString(hostname)))
}

//export LpmTailnetLogin
func LpmTailnetLogin() *C.char {
	ctx, cancel := context.WithTimeout(context.Background(), commandTimeout)
	defer cancel()
	return errString(nd.Login(ctx))
}

//export LpmTailnetLogout
func LpmTailnetLogout() *C.char {
	ctx, cancel := context.WithTimeout(context.Background(), commandTimeout)
	defer cancel()
	return errString(nd.Logout(ctx))
}

// LpmTailnetWaitStatus blocks until the status changes from version since, or
// timeoutMs passes, and returns it as JSON with its version.
//
//export LpmTailnetWaitStatus
func LpmTailnetWaitStatus(since C.ulonglong, timeoutMs C.int) *C.char {
	st, version := nd.Wait(uint64(since), time.Duration(timeoutMs)*time.Millisecond)
	b, err := json.Marshal(struct {
		node.Status
		Version uint64 `json:"version"`
	}{st, version})
	if err != nil {
		return nil
	}
	return cString(string(b))
}

// LpmTailnetBridge returns a loopback port that reaches host:port across the
// tailnet for the next 30 seconds, or -1.
//
//export LpmTailnetBridge
func LpmTailnetBridge(host *C.char, port C.int) C.int {
	addr := net.JoinHostPort(C.GoString(host), fmt.Sprint(int(port)))
	p, err := nd.Bridge(addr, bridgeWindow)
	if err != nil {
		return -1
	}
	return C.int(p)
}

//export LpmTailnetFree
func LpmTailnetFree(p *C.char) {
	C.free(unsafe.Pointer(p))
}

func main() {}
