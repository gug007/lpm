package node

import (
	"io"
	"net"
	"time"
)

// halfCloseGrace is how long the second direction may keep flowing after the
// first one ends, before both are torn down.
const halfCloseGrace = 5 * time.Second

// Pipe copies both ways between a and b until both directions end, then closes
// both. When one side finishes it half-closes the other, so a peer that is
// still sending gets its last bytes through.
func Pipe(a, b net.Conn) {
	done := make(chan struct{}, 2)
	go copyHalf(a, b, done)
	go copyHalf(b, a, done)
	<-done
	t := time.NewTimer(halfCloseGrace)
	select {
	case <-done:
	case <-t.C:
	}
	t.Stop()
	a.Close()
	b.Close()
}

func copyHalf(dst, src net.Conn, done chan<- struct{}) {
	io.Copy(dst, src)
	if cw, ok := dst.(interface{ CloseWrite() error }); ok {
		cw.CloseWrite()
	} else {
		dst.Close()
	}
	done <- struct{}{}
}
