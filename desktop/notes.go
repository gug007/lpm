package main

import (
	"context"
	"database/sql"
	"encoding/base64"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gug007/lpm/desktop/notes"
	"github.com/gug007/lpm/desktop/vault"
	"github.com/gug007/lpm/internal/config"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/sync/errgroup"
)

// maxDroppedAttachmentBytes mirrors the MAX_ATTACHMENT_BYTES limit in the
// frontend — drops from the OS bypass the browser's File-picker path so we
// re-enforce the same cap here before loading the file into memory.
const maxDroppedAttachmentBytes = 100 * 1024 * 1024

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

func (n *notesState) open(ctx context.Context, project string) (*notesBundle, error) {
	if err := config.ValidateName(project); err != nil {
		return nil, err
	}

	// Fast path: hit the cache and release the lock before any slow work.
	n.mu.Lock()
	if b, ok := n.stores[project]; ok {
		n.mu.Unlock()
		return b, nil
	}
	if n.key == nil {
		key, err := vault.Key()
		if err != nil {
			n.mu.Unlock()
			return nil, err
		}
		n.key = key
	}
	key := n.key
	n.mu.Unlock()

	// Opening runs migrations, which can take seconds on a large legacy DB.
	// Doing this outside the lock prevents an unrelated project's first open
	// from blocking every other notes call.
	store, err := notes.Open(ctx, project, key)
	if err != nil {
		return nil, err
	}
	blobs, err := notes.NewBlobStore(store.BlobsDir(), key)
	if err != nil {
		store.Close()
		return nil, err
	}

	n.mu.Lock()
	defer n.mu.Unlock()
	// Another caller may have raced us and published first — reuse theirs.
	if existing, ok := n.stores[project]; ok {
		store.Close()
		return existing, nil
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
func (a *App) NotesAddMessage(project, chatID, text string, attachments []NotesAttachmentInput) (*notes.Message, error) {
	b, err := a.notes.open(a.ctx, project)
	if err != nil {
		return nil, err
	}
	// Reject up-front so a send to a deleted chat doesn't leave ~100MB of
	// encrypted blob orphans behind before the insert fails.
	if len(attachments) > 0 {
		exists, err := b.store.ChatExists(a.ctx, chatID)
		if err != nil {
			return nil, err
		}
		if !exists {
			return nil, sql.ErrNoRows
		}
	}
	attMeta, err := a.stashAttachments(b, attachments)
	if err != nil {
		return nil, err
	}
	return b.store.AddMessage(a.ctx, chatID, text, attMeta)
}

func (a *App) NotesListMessages(project, chatID string, limit int, beforeID string) ([]notes.Message, error) {
	b, err := a.notes.open(a.ctx, project)
	if err != nil {
		return nil, err
	}
	msgs, err := b.store.ListMessages(a.ctx, chatID, limit, beforeID)
	if err != nil {
		return nil, err
	}
	if msgs == nil {
		msgs = []notes.Message{}
	}
	return msgs, nil
}

func (a *App) NotesListChats(project string) ([]notes.Chat, error) {
	b, err := a.notes.open(a.ctx, project)
	if err != nil {
		return nil, err
	}
	chats, err := b.store.ListChats(a.ctx)
	if err != nil {
		return nil, err
	}
	if chats == nil {
		chats = []notes.Chat{}
	}
	return chats, nil
}

func (a *App) NotesCreateChat(project, title string) (*notes.Chat, error) {
	b, err := a.notes.open(a.ctx, project)
	if err != nil {
		return nil, err
	}
	return b.store.CreateChat(a.ctx, title)
}

func (a *App) NotesRenameChat(project, chatID, title string) error {
	b, err := a.notes.open(a.ctx, project)
	if err != nil {
		return err
	}
	return b.store.RenameChat(a.ctx, chatID, title)
}

func (a *App) NotesDeleteChat(project, chatID string) error {
	b, err := a.notes.open(a.ctx, project)
	if err != nil {
		return err
	}
	orphans, err := b.store.DeleteChat(a.ctx, chatID)
	if err != nil {
		return err
	}
	b.gcOrphanBlobs(orphans)
	return nil
}

// gcOrphanBlobs best-effort-deletes every blob referenced by a now-empty
// attachment set. A single failure shouldn't block the rest — the blob store
// tolerates missing files on the next GC sweep.
func (b *notesBundle) gcOrphanBlobs(hashes []string) {
	for _, h := range hashes {
		if err := b.blobs.Delete(h); err != nil {
			fmt.Fprintf(os.Stderr, "warning: notes: delete orphan blob %s: %v\n", h, err)
		}
	}
}

func (a *App) NotesEditMessage(project, id, text string) error {
	b, err := a.notes.open(a.ctx, project)
	if err != nil {
		return err
	}
	return b.store.EditMessage(a.ctx, id, text)
}

func (a *App) NotesDeleteMessage(project, id string) error {
	b, err := a.notes.open(a.ctx, project)
	if err != nil {
		return err
	}
	orphans, err := b.store.DeleteMessage(a.ctx, id)
	if err != nil {
		return err
	}
	b.gcOrphanBlobs(orphans)
	return nil
}

// NotesReadFileAsInput reads a file from disk and returns a ready-to-attach
// payload. Used by the frontend when files arrive via native drag-and-drop
// (Wails delivers OS file paths rather than File blobs).
func (a *App) NotesReadFileAsInput(path string) (*NotesAttachmentInput, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	if info.IsDir() {
		return nil, fmt.Errorf("%s is a directory", info.Name())
	}
	if info.Size() > maxDroppedAttachmentBytes {
		return nil, fmt.Errorf("%s exceeds 100MB limit", info.Name())
	}
	data, err := readFileCapped(path, maxDroppedAttachmentBytes)
	if err != nil {
		return nil, err
	}
	mimeType := mime.TypeByExtension(strings.ToLower(filepath.Ext(path)))
	if mimeType == "" {
		sniffLen := len(data)
		if sniffLen > 512 {
			sniffLen = 512
		}
		mimeType = http.DetectContentType(data[:sniffLen])
	}
	return &NotesAttachmentInput{
		Name:     filepath.Base(path),
		MimeType: mimeType,
		Data:     base64.StdEncoding.EncodeToString(data),
	}, nil
}

// NotesReadAttachment returns base64. See NotesAttachmentInput for the
// bridge-format rationale.
func (a *App) NotesReadAttachment(project, hash string) (string, error) {
	b, err := a.notes.open(a.ctx, project)
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

// readFileCapped reads at most cap bytes; if the file grew past cap between
// stat and read (TOCTOU), it returns an error rather than a silently truncated
// payload.
func readFileCapped(path string, cap int64) ([]byte, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, cap+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > cap {
		return nil, fmt.Errorf("%s exceeds %d byte limit", filepath.Base(path), cap)
	}
	return data, nil
}
