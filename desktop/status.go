package main

import (
	"context"
	"sort"
	"sync"
	"syscall"
	"time"
)

const (
	StatusRunning = "Running"
	StatusDone    = "Done"
)

type StatusEntry struct {
	Key       string `json:"key"`
	Value     string `json:"value"`
	Icon      string `json:"icon,omitempty"`
	Color     string `json:"color,omitempty"`
	Priority  int    `json:"priority"`
	Timestamp int64  `json:"timestamp"`
	AgentPID  int    `json:"agentPID,omitempty"`
	PaneID    string `json:"paneID,omitempty"`
}

type StatusStore struct {
	mu      sync.RWMutex
	entries map[string]map[string]StatusEntry // projectName → key → entry
}

func NewStatusStore() *StatusStore {
	return &StatusStore{
		entries: make(map[string]map[string]StatusEntry),
	}
}

func shouldReplace(existing, incoming StatusEntry) bool {
	return existing.Value != incoming.Value ||
		existing.Icon != incoming.Icon ||
		existing.Color != incoming.Color ||
		existing.Priority != incoming.Priority
}

func (s *StatusStore) Set(project string, entry StatusEntry) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	bucket, ok := s.entries[project]
	if !ok {
		bucket = make(map[string]StatusEntry)
		s.entries[project] = bucket
	}

	if existing, exists := bucket[entry.Key]; exists {
		if !shouldReplace(existing, entry) {
			return false
		}
	}

	bucket[entry.Key] = entry
	return true
}

func (s *StatusStore) Clear(project, key string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	bucket, ok := s.entries[project]
	if !ok {
		return false
	}

	if _, exists := bucket[key]; !exists {
		return false
	}

	delete(bucket, key)
	if len(bucket) == 0 {
		delete(s.entries, project)
	}
	return true
}

func (s *StatusStore) ClearByPaneValue(project, paneID, value string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	bucket, ok := s.entries[project]
	if !ok {
		return false
	}
	changed := false
	for key, entry := range bucket {
		if entry.Value == value && entry.PaneID == paneID {
			delete(bucket, key)
			changed = true
		}
	}
	if changed && len(bucket) == 0 {
		delete(s.entries, project)
	}
	return changed
}

func (s *StatusStore) List(project string) []StatusEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()

	bucket, ok := s.entries[project]
	if !ok {
		return []StatusEntry{}
	}

	out := make([]StatusEntry, 0, len(bucket))
	for _, e := range bucket {
		out = append(out, e)
	}

	sort.Slice(out, func(i, j int) bool {
		if out[i].Priority != out[j].Priority {
			return out[i].Priority > out[j].Priority
		}
		if out[i].Timestamp != out[j].Timestamp {
			return out[i].Timestamp > out[j].Timestamp
		}
		return out[i].Key < out[j].Key
	})

	return out
}

func (s *StatusStore) StartPIDSweep(ctx context.Context, onClear func(project, key string)) {
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				s.sweepDeadPIDs(onClear)
			}
		}
	}()
}

func (s *StatusStore) sweepDeadPIDs(onClear func(project, key string)) {
	// Collect candidates under a read lock.
	type candidate struct {
		project string
		key     string
		pid     int
	}

	s.mu.RLock()
	var candidates []candidate
	for project, bucket := range s.entries {
		for key, entry := range bucket {
			if entry.AgentPID > 0 {
				candidates = append(candidates, candidate{project, key, entry.AgentPID})
			}
		}
	}
	s.mu.RUnlock()

	// Check each PID outside the lock, then clear as needed.
	for _, c := range candidates {
		err := syscall.Kill(c.pid, 0)
		if err == syscall.ESRCH {
			if s.Clear(c.project, c.key) && onClear != nil {
				onClear(c.project, c.key)
			}
		}
	}
}
