package main

import (
	"strings"

	"github.com/google/uuid"
)

// resumeRecipe describes how to transform a user's terminal command into
// a pair of commands: one that starts a new resumable session tagged with
// a given id, and one that resumes that same session later.
//
// Adding a new recipe is the only place lpm learns how to restore a new
// kind of program. Recipes are matched by the leading program token of
// the user's cmd (env-var assignments are skipped, so `FOO=1 claude` still
// matches "claude").
type resumeRecipe struct {
	program string
	start   func(userCmd, id string) string
	resume  func(userCmd, id string) string
}

var resumeRegistry = []resumeRecipe{
	{
		program: "claude",
		start: func(userCmd, id string) string {
			return injectArgs(userCmd, "--session-id", id)
		},
		resume: func(userCmd, id string) string {
			return injectArgs(userCmd, "--resume", id)
		},
	},
}

// programToken returns the index and value of the first non-env-assignment
// token in a whitespace-split cmd. It returns -1 and "" if none is found.
func programToken(fields []string) (int, string) {
	for i, f := range fields {
		if strings.Contains(f, "=") {
			continue
		}
		return i, f
	}
	return -1, ""
}

// injectArgs inserts flag and value immediately after the program token,
// preserving env-var prefixes and trailing args. e.g.
//
//	injectArgs("FOO=1 claude --verbose", "--session-id", "uuid")
//	→ "FOO=1 claude --session-id uuid --verbose"
//
// Note: uses strings.Fields and does not understand shell quoting.
// Quoted arguments with embedded whitespace will be split. Recipes should
// only target programs whose typical invocations are whitespace-safe.
func injectArgs(userCmd, flag, value string) string {
	fields := strings.Fields(userCmd)
	idx, _ := programToken(fields)
	if idx < 0 {
		return userCmd
	}
	out := make([]string, 0, len(fields)+2)
	out = append(out, fields[:idx+1]...)
	out = append(out, flag, value)
	out = append(out, fields[idx+1:]...)
	return strings.Join(out, " ")
}

// resolveRestoreCmds maps a user-authored cmd through the resume registry.
// If the leading program is recognized, it returns a pair of rewritten
// commands wired to a freshly generated session id. If the program is
// unknown, resumeCmd is empty — the frontend then treats the terminal as
// non-restorable and skips persistence, so restore:true on an unrecognized
// program silently no-ops rather than falling back to a cold re-run.
func resolveRestoreCmds(cmd string) (startCmd, resumeCmd string) {
	_, prog := programToken(strings.Fields(cmd))
	for _, r := range resumeRegistry {
		if r.program == prog {
			id := uuid.NewString()
			return r.start(cmd, id), r.resume(cmd, id)
		}
	}
	return cmd, ""
}
