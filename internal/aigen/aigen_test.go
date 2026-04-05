package aigen

import "testing"

func TestExtractYAML(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "bare yaml",
			input: "name: foo\nroot: /tmp\nservices:\n  dev: npm run dev\n",
			want:  "name: foo\nroot: /tmp\nservices:\n  dev: npm run dev",
		},
		{
			name:  "fenced yaml with language tag",
			input: "```yaml\nname: foo\nroot: /tmp\n```",
			want:  "name: foo\nroot: /tmp",
		},
		{
			name:  "fenced without language tag",
			input: "```\nname: foo\nroot: /tmp\n```",
			want:  "name: foo\nroot: /tmp",
		},
		{
			name:  "preamble before yaml",
			input: "Here is your config:\n\nname: foo\nroot: /tmp\nservices:\n  web: bun dev\n",
			want:  "name: foo\nroot: /tmp\nservices:\n  web: bun dev",
		},
		{
			name:  "preamble with fence wins over key search",
			input: "Sure! Here:\n```yaml\nname: foo\n```\nThanks!",
			want:  "name: foo",
		},
		{
			name:  "services only",
			input: "services:\n  web: npm start",
			want:  "services:\n  web: npm start",
		},
		{
			name:  "no yaml markers returns trimmed input",
			input: "  just some text  ",
			want:  "just some text",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := extractYAML(tc.input)
			if got != tc.want {
				t.Errorf("extractYAML(%q)\n  got:  %q\n  want: %q", tc.input, got, tc.want)
			}
		})
	}
}

func TestTruncate(t *testing.T) {
	if got := truncate("hello", 10); got != "hello" {
		t.Errorf("short string: got %q", got)
	}
	if got := truncate("hello world", 5); got != "hello…" {
		t.Errorf("truncated: got %q", got)
	}
	if got := truncate("  padded  ", 10); got != "padded" {
		t.Errorf("trimmed: got %q", got)
	}
}

func TestCodexProgressLine(t *testing.T) {
	empty := []string{"", "  ", "--------", "user", "codex", "tokens used",
		"model: gpt-5", "session id: abc", "OpenAI Codex v1.0", "Shell cwd was reset to /foo"}
	for _, s := range empty {
		if got := codexProgressLine(s); got != "" {
			t.Errorf("codexProgressLine(%q) = %q, want empty", s, got)
		}
	}
	if got := codexProgressLine("Reading package.json"); got != "Reading package.json" {
		t.Errorf("kept line: got %q", got)
	}
}

func TestDetect_InvalidCLI(t *testing.T) {
	if _, err := Detect("invalid"); err == nil {
		t.Error("expected error for invalid CLI")
	}
}
