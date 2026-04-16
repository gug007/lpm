package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
	"sync"
	"syscall"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// ttsState constants emitted via the "tts-state" event.
const (
	ttsStatePlaying = "playing"
	ttsStatePaused  = "paused"
	ttsStateStopped = "stopped"
	ttsStateError   = "error"
)

type ttsSession struct {
	cmd    *exec.Cmd
	cancel context.CancelFunc
	mu     sync.Mutex
	state  string // playing, paused, stopped
}

type ttsChunk struct {
	Type  string `json:"type"`            // "audio", "done", "error"
	Audio string `json:"audio,omitempty"` // base64-encoded WAV data
	Error string `json:"error,omitempty"`
}

// ttsScript is the Python one-liner that streams Kokoro output as JSON lines.
// Each chunk is a JSON object: {"type":"audio","audio":"<base64>"} or
// {"type":"progress","percent":50} or {"type":"done"}.
const ttsScript = `
import sys, json, base64, io
try:
    import soundfile as sf
    from kokoro import KPipeline
except ImportError as e:
    print(json.dumps({"type":"error","error":"Missing dependency: "+str(e)+". Install with: pip install kokoro soundfile"}))
    sys.exit(1)

text = sys.argv[1]
voice = sys.argv[2]
speed = float(sys.argv[3])

try:
    pipeline = KPipeline(lang_code=voice[0])
    for gs, ps, audio in pipeline(text, voice=voice, speed=speed):
        buf = io.BytesIO()
        sf.write(buf, audio, 24000, format="WAV")
        b64 = base64.b64encode(buf.getvalue()).decode()
        print(json.dumps({"type":"audio","audio":b64}))
        sys.stdout.flush()
    print(json.dumps({"type":"done","percent":100}))
except Exception as e:
    print(json.dumps({"type":"error","error":str(e)}))
    sys.exit(1)
`

// StartTTS begins text-to-speech synthesis, reading voice and speed from
// the user's saved settings. It delegates to startTTS which spawns the
// Kokoro subprocess.
func (a *App) StartTTS(text string) error {
	a.settingsMu.Lock()
	s := a.loadSettingsLocked()
	a.settingsMu.Unlock()

	voice := s.TTSVoice
	speed := s.TTSSpeed
	return a.startTTS(text, voice, speed)
}

// startTTS begins text-to-speech synthesis. It spawns a Python subprocess
// running Kokoro, streaming audio chunks and progress back to the frontend
// via Wails events. Only one TTS session is active at a time; calling
// startTTS while one is running stops the previous session first.
func (a *App) startTTS(text string, voice string, speed float64) error {
	if strings.TrimSpace(text) == "" {
		return fmt.Errorf("text is empty")
	}
	if voice == "" {
		voice = "af_heart"
	}
	if speed <= 0 {
		speed = 1.0
	}

	// Stop any existing session
	a.stopTTSLocked()

	ctx, cancel := context.WithCancel(context.Background())

	cmd := exec.CommandContext(ctx, "python3", "-c", ttsScript, text, voice, fmt.Sprintf("%.2f", speed))

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		return fmt.Errorf("create stdout pipe: %w", err)
	}
	cmd.Stderr = nil // ignore stderr; errors come as JSON on stdout

	if err := cmd.Start(); err != nil {
		cancel()
		return fmt.Errorf("start tts process: %w", err)
	}

	sess := &ttsSession{
		cmd:    cmd,
		cancel: cancel,
		state:  ttsStatePlaying,
	}

	a.ttsMu.Lock()
	a.ttsSession = sess
	a.ttsMu.Unlock()

	runtime.EventsEmit(a.ctx, "tts-state", ttsStatePlaying)

	// Read goroutine: parse JSON lines from the Python process
	go func() {
		scanner := bufio.NewScanner(stdout)
		// Allow large audio chunks (up to 10MB per line)
		scanner.Buffer(make([]byte, 0, 64*1024), 10*1024*1024)

		for scanner.Scan() {
			var chunk ttsChunk
			if err := json.Unmarshal(scanner.Bytes(), &chunk); err != nil {
				continue
			}

			switch chunk.Type {
			case "audio":
				runtime.EventsEmit(a.ctx, "tts-audio", chunk.Audio)
			case "done":
				// synthesis complete; playback may still be ongoing
			case "error":
				runtime.EventsEmit(a.ctx, "tts-state", ttsStateError)
				runtime.EventsEmit(a.ctx, "tts-error", chunk.Error)
			}
		}

		// Wait for process exit
		_ = cmd.Wait()

		// Mark session stopped unless already cleaned up
		a.ttsMu.Lock()
		if a.ttsSession == sess {
			a.ttsSession = nil
		}
		a.ttsMu.Unlock()

		sess.mu.Lock()
		wasPlaying := sess.state == ttsStatePlaying
		sess.state = ttsStateStopped
		sess.mu.Unlock()

		if wasPlaying {
			// Normal completion
			runtime.EventsEmit(a.ctx, "tts-state", ttsStateStopped)
		}
	}()

	return nil
}

// StopTTS terminates the current TTS session.
func (a *App) StopTTS() {
	a.stopTTSLocked()
}

// stopTTSLocked stops the active TTS session if one exists.
func (a *App) stopTTSLocked() {
	a.ttsMu.Lock()
	sess := a.ttsSession
	a.ttsSession = nil
	a.ttsMu.Unlock()

	if sess == nil {
		return
	}

	sess.mu.Lock()
	sess.state = ttsStateStopped
	sess.mu.Unlock()

	// Resume if paused so the process can be killed cleanly
	if sess.cmd.Process != nil {
		_ = sess.cmd.Process.Signal(syscall.SIGCONT)
	}
	sess.cancel()

	runtime.EventsEmit(a.ctx, "tts-state", ttsStateStopped)
}

// PauseTTS pauses the current TTS session by sending SIGSTOP to the
// Python subprocess.
func (a *App) PauseTTS() error {
	a.ttsMu.Lock()
	sess := a.ttsSession
	a.ttsMu.Unlock()

	if sess == nil {
		return fmt.Errorf("no active tts session")
	}

	sess.mu.Lock()
	defer sess.mu.Unlock()

	if sess.state != ttsStatePlaying {
		return fmt.Errorf("tts is not playing (state: %s)", sess.state)
	}

	if sess.cmd.Process != nil {
		if err := sess.cmd.Process.Signal(syscall.SIGSTOP); err != nil {
			return fmt.Errorf("pause tts: %w", err)
		}
	}
	sess.state = ttsStatePaused
	runtime.EventsEmit(a.ctx, "tts-state", ttsStatePaused)
	return nil
}

// ResumeTTS resumes a paused TTS session by sending SIGCONT to the
// Python subprocess.
func (a *App) ResumeTTS() error {
	a.ttsMu.Lock()
	sess := a.ttsSession
	a.ttsMu.Unlock()

	if sess == nil {
		return fmt.Errorf("no active tts session")
	}

	sess.mu.Lock()
	defer sess.mu.Unlock()

	if sess.state != ttsStatePaused {
		return fmt.Errorf("tts is not paused (state: %s)", sess.state)
	}

	if sess.cmd.Process != nil {
		if err := sess.cmd.Process.Signal(syscall.SIGCONT); err != nil {
			return fmt.Errorf("resume tts: %w", err)
		}
	}
	sess.state = ttsStatePlaying
	runtime.EventsEmit(a.ctx, "tts-state", ttsStatePlaying)
	return nil
}

func (a *App) CheckKokoroInstalled() bool {
	cmd := exec.Command("python3", "-c", "from kokoro import KPipeline; import soundfile")
	return cmd.Run() == nil
}

// InstallKokoro installs the kokoro and soundfile Python packages.
func (a *App) InstallKokoro() error {
	cmd := exec.Command("pip3", "install", "kokoro", "soundfile")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("pip3 install failed: %s\n%s", err, string(out))
	}
	return nil
}

func (a *App) UninstallKokoro() error {
	cmd := exec.Command("pip3", "uninstall", "-y", "kokoro", "soundfile")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("pip3 uninstall failed: %s\n%s", err, string(out))
	}
	return nil
}
