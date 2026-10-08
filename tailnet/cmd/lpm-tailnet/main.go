// lpm-tailnet is the desktop app's built-in Tailscale node, run as a child
// process. The app drives it over stdin and reads its state from stdout, one
// JSON object per line; closing stdin shuts it down, so it never outlives the
// app.
//
// stdout:
//
//	{"t":"hello","dialPort":P,"token":T}  once, before anything else
//	{"t":"status","status":{...}}         on every change
//	{"t":"done","id":N,"error":"..."}     when command N finishes
//
// stdin:
//
//	{"cmd":"login","id":N}
//	{"cmd":"logout","id":N}
//	{"cmd":"forward","ports":{"8765":"127.0.0.1:8765"}}
//
// The dial port is a loopback service for the app's own outbound tailnet
// connections: send "<token> <host:port>\n", read "OK\n" or "ERR <reason>\n",
// then the socket carries the connection.
package main

import (
	"bufio"
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"lpm.cx/tailnet/node"
)

const (
	commandTimeout = 30 * time.Second
	dialTimeout    = 20 * time.Second
	requestTimeout = 10 * time.Second
	maxRequest     = 512
)

type output struct {
	mu  sync.Mutex
	enc *json.Encoder
}

func (o *output) send(v any) {
	o.mu.Lock()
	defer o.mu.Unlock()
	o.enc.Encode(v)
}

type command struct {
	Cmd   string            `json:"cmd"`
	ID    int64             `json:"id"`
	Ports map[string]string `json:"ports"`
}

func main() {
	dir := flag.String("dir", "", "state directory")
	hostname := flag.String("hostname", "lpm", "device name on the tailnet")
	flag.Parse()
	if *dir == "" {
		fmt.Fprintln(os.Stderr, "lpm-tailnet: -dir is required")
		os.Exit(2)
	}

	out := &output{enc: json.NewEncoder(os.Stdout)}
	n := node.New()
	token := randomToken()
	dialPort, err := serveDial(n, token)
	if err != nil {
		fmt.Fprintf(os.Stderr, "lpm-tailnet: %v\n", err)
		os.Exit(1)
	}
	out.send(map[string]any{"t": "hello", "dialPort": dialPort, "token": token})

	go func() {
		var version uint64
		for {
			var st node.Status
			st, version = n.Wait(version, 0)
			out.send(map[string]any{"t": "status", "status": st})
		}
	}()

	if err := n.Start(*dir, *hostname); err != nil {
		fmt.Fprintf(os.Stderr, "lpm-tailnet: %v\n", err)
		os.Exit(1)
	}

	in := bufio.NewScanner(os.Stdin)
	in.Buffer(make([]byte, 64*1024), 1024*1024)
	for in.Scan() {
		var c command
		if json.Unmarshal(in.Bytes(), &c) != nil {
			continue
		}
		handle(n, out, c)
	}
	n.Stop()
}

func handle(n *node.Node, out *output, c command) {
	run := func(f func(context.Context) error) {
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), commandTimeout)
			defer cancel()
			msg := ""
			if err := f(ctx); err != nil {
				msg = err.Error()
			}
			out.send(map[string]any{"t": "done", "id": c.ID, "error": msg})
		}()
	}
	switch c.Cmd {
	case "login":
		run(n.Login)
	case "logout":
		run(n.Logout)
	case "forward":
		ports := map[uint16]string{}
		for p, target := range c.Ports {
			if v, err := strconv.ParseUint(p, 10, 16); err == nil && v > 0 {
				ports[uint16(v)] = target
			}
		}
		n.SetForwards(ports)
	}
}

func randomToken() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

func serveDial(n *node.Node, token string) (int, error) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go dialFor(n, token, c)
		}
	}()
	return ln.Addr().(*net.TCPAddr).Port, nil
}

func dialFor(n *node.Node, token string, c net.Conn) {
	c.SetDeadline(time.Now().Add(requestTimeout))
	br := bufio.NewReaderSize(c, maxRequest)
	line, err := br.ReadSlice('\n')
	if err != nil {
		c.Close()
		return
	}
	fields := strings.Fields(string(line))
	if len(fields) != 2 || subtle.ConstantTimeCompare([]byte(fields[0]), []byte(token)) != 1 {
		io.WriteString(c, "ERR denied\n")
		c.Close()
		return
	}
	c.SetDeadline(time.Time{})
	ctx, cancel := context.WithTimeout(context.Background(), dialTimeout)
	up, err := n.Dial(ctx, fields[1])
	cancel()
	if err != nil {
		io.WriteString(c, "ERR "+strings.ReplaceAll(err.Error(), "\n", " ")+"\n")
		c.Close()
		return
	}
	if _, err := io.WriteString(c, "OK\n"); err != nil {
		c.Close()
		up.Close()
		return
	}
	node.Pipe(&bufferedConn{Conn: c, r: br}, up)
}

// bufferedConn reads through the bufio.Reader that parsed the request line, so
// bytes a client sent early are not lost.
type bufferedConn struct {
	net.Conn
	r *bufio.Reader
}

func (b *bufferedConn) Read(p []byte) (int, error) { return b.r.Read(p) }

func (b *bufferedConn) CloseWrite() error {
	if cw, ok := b.Conn.(interface{ CloseWrite() error }); ok {
		return cw.CloseWrite()
	}
	return b.Conn.Close()
}
