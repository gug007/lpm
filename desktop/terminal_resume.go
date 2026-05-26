package main

import (
	"strings"

	"github.com/google/uuid"
)

// resumeRecipe transforms a user's terminal command into a start/resume
// pair tagged with a session id. Recipes are matched by the leading program
// token (env-var assignments are skipped, so `FOO=1 claude` matches "claude").
type resumeRecipe struct {
	program string
	start   func(userCmd, id string) string
	resume  func(userCmd, id string) string
}

// resumeRegistry lists programs lpm knows how to restore. The session id is
// a UUID minted once per terminal and persisted by the frontend, so both
// rewrites must round-trip the same id unchanged.
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
// token, or -1 and "" if none.
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
// preserving env-var prefixes and trailing args.
//
// Uses strings.Fields and does not understand shell quoting — recipes
// should only target programs whose typical invocations are whitespace-safe.
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

// resolveRestoreCmds maps a user cmd through the resume registry. Unknown
// programs return empty resumeCmd; the frontend then skips persistence so
// restore:true silently no-ops rather than falling back to a cold re-run.
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
