package main

import (
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/gug007/lpm/desktop/notes"
	"github.com/gug007/lpm/desktop/vault"
	"github.com/gug007/lpm/internal/config"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/sync/errgroup"
)

// stashConcurrency bounds parallel blob writes so a multi-file send doesn't
// spike memory by encrypting every attachment at once (100MB * N = bad).
const stashConcurrency = 4

// notesState owns the per-project Store/BlobStore handles plus a cached
// copy of the shared vault key. One Keychain prompt, reused across every
// project opened during the session.
type notesState struct {
	mu     sync.Mutex
	key    []byte
	stores map[string]*notesBundle
}

type notesBundle struct {
	store *notes.Store
	blobs *notes.BlobStore
}

func newNotesState() *notesState {
	return &notesState{stores: map[string]*notesBundle{}}
}

func (n *notesState) open(project string) (*notesBundle, error) {
	n.mu.Lock()
	defer n.mu.Unlock()

	if b, ok := n.stores[project]; ok {
		return b, nil
	}

	if n.key == nil {
		key, err := vault.Key()
		if err != nil {
			return nil, err
		}
		n.key = key
	}

	store, err := notes.Open(project, n.key)
	if err != nil {
		return nil, err
	}
	blobs, err := notes.NewBlobStore(store.BlobsDir(), n.key)
	if err != nil {
		store.Close()
		return nil, err
	}

	b := &notesBundle{store: store, blobs: blobs}
	n.stores[project] = b
	return b, nil
}

// forget drops the cached bundle so the next access reopens against current
// on-disk state. Required after project removal.
func (n *notesState) forget(project string) {
	n.mu.Lock()
	defer n.mu.Unlock()
	if b, ok := n.stores[project]; ok {
		b.store.Close()
		delete(n.stores, project)
	}
}

// invalidateKey discards the cached vault key and every open store. Used
// after a successful key import so the next access re-fetches from Keychain.
func (n *notesState) invalidateKey() {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.key = nil
	for name, b := range n.stores {
		b.store.Close()
		delete(n.stores, name)
	}
}

func (n *notesState) closeAll() {
	n.mu.Lock()
	defer n.mu.Unlock()
	for name, b := range n.stores {
		b.store.Close()
		delete(n.stores, name)
	}
}

// NotesAttachmentInput is the frontend-shaped payload for a new attachment.
// Data is base64 (std, padded) — Wails' []byte handling is a type-only lie
// (the generated TS says Array<number> but Go's json.Marshal actually emits
// a base64 string), so we use an explicit string to avoid the mismatch.
type NotesAttachmentInput struct {
	Name     string `json:"name"`
	MimeType string `json:"mimeType"`
	Data     string `json:"data"`
}

// NotesAddMessage: on failure no message row is written, but successfully-
// written blobs may remain as orphans until the next delete GCs them.
func (a *App) NotesAddMessage(project, text string, attachments []NotesAttachmentInput) (*notes.Message, error) {
	b, err := a.notes.open(project)
	if err != nil {
		return nil, err
	}
	attMeta, err := a.stashAttachments(b, attachments)
	if err != nil {
		return nil, err
	}
	return b.store.AddMessage(a.ctx, text, attMeta)
}

func (a *App) NotesListMessages(project string, limit int, beforeID string) ([]notes.Message, error) {
	b, err := a.notes.open(project)
	if err != nil {
		return nil, err
	}
	msgs, err := b.store.ListMessages(a.ctx, limit, beforeID)
	if err != nil {
		return nil, err
	}
	if msgs == nil {
		msgs = []notes.Message{}
	}
	return msgs, nil
}

func (a *App) NotesEditMessage(project, id, text string) error {
	b, err := a.notes.open(project)
	if err != nil {
		return err
	}
	return b.store.EditMessage(a.ctx, id, text)
}

func (a *App) NotesDeleteMessage(project, id string) error {
	b, err := a.notes.open(project)
	if err != nil {
		return err
	}
	orphans, err := b.store.DeleteMessage(a.ctx, id)
	if err != nil {
		return err
	}
	for _, h := range orphans {
		if err := b.blobs.Delete(h); err != nil {
			fmt.Fprintf(os.Stderr, "warning: notes: delete orphan blob %s: %v\n", h, err)
		}
	}
	return nil
}

// NotesReadAttachment returns base64. See NotesAttachmentInput for the
// bridge-format rationale.
func (a *App) NotesReadAttachment(project, hash string) (string, error) {
	b, err := a.notes.open(project)
	if err != nil {
		return "", err
	}
	data, err := b.blobs.Read(hash)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(data), nil
}

// VaultExportKey prompts for a folder and writes a passphrase-wrapped copy
// of the vault key. The exported file decrypts every lpm feature that uses
// the vault (notes today, future env vars, ...).
func (a *App) VaultExportKey(passphrase string) (result string, err error) {
	defer recoverAs("vault export", &err)

	dir, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title:                "Choose folder for lpm vault key",
		CanCreateDirectories: true,
	})
	if err != nil {
		return "", err
	}
	if dir == "" {
		return "", nil
	}

	data, err := vault.ExportKey(passphrase)
	if err != nil {
		return "", err
	}

	host, _ := os.Hostname()
	if host == "" {
		host = "mac"
	}
	filename := fmt.Sprintf("lpm-vault-%s-%s.json",
		sanitizeHost(host), time.Now().Format("20060102-150405"))
	path := filepath.Join(dir, filename)
	if err := os.WriteFile(path, data, 0600); err != nil {
		return "", err
	}
	return path, nil
}

// VaultImportKey prompts for a file and writes the unwrapped key into the
// local Keychain. On success any cached notes handles are invalidated so
// subsequent access uses the fresh key. Returns an error if the Keychain
// already holds a different key (caller must delete it first).
func (a *App) VaultImportKey(passphrase string) (err error) {
	defer recoverAs("vault import", &err)

	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Import lpm vault key",
		Filters: []runtime.FileFilter{
			{DisplayName: "JSON (*.json)", Pattern: "*.json"},
		},
	})
	if err != nil {
		return err
	}
	if path == "" {
		return nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if err := vault.ImportKey(passphrase, data); err != nil {
		return err
	}
	a.notes.invalidateKey()
	return nil
}

// removeNotes closes any cached handle and deletes the project's notes
// directory. The vault key is shared and intentionally survives removal.
// Failures are logged but never returned — the parent RemoveProject flow
// has already succeeded by the time this runs and should not be blocked.
func (a *App) removeNotes(project string) {
	a.notes.forget(project)

	dir := config.NotesDir(project)
	if err := removeAllWithRetry(dir); err != nil {
		fmt.Fprintf(os.Stderr, "warning: notes: remove dir %q: %v\n", dir, err)
	}
}

// stashAttachments: on error, blobs written so far stay on disk as orphans
// (unreachable until the next delete GCs them).
func (a *App) stashAttachments(b *notesBundle, inputs []NotesAttachmentInput) ([]notes.Attachment, error) {
	if len(inputs) == 0 {
		return nil, nil
	}
	out := make([]notes.Attachment, len(inputs))
	var eg errgroup.Group
	eg.SetLimit(stashConcurrency)
	for i, in := range inputs {
		i, in := i, in
		eg.Go(func() error {
			raw, err := base64.StdEncoding.DecodeString(in.Data)
			if err != nil {
				return fmt.Errorf("notes: bad base64 for %q: %w", in.Name, err)
			}
			hash, size, err := b.blobs.Put(raw)
			if err != nil {
				return fmt.Errorf("notes: store attachment %q: %w", in.Name, err)
			}
			out[i] = notes.Attachment{
				Hash:     hash,
				Name:     in.Name,
				Size:     size,
				MimeType: in.MimeType,
			}
			return nil
		})
	}
	if err := eg.Wait(); err != nil {
		return nil, err
	}
	return out, nil
}
