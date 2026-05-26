package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"errors"
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
	"golang.org/x/sync/errgroup"
)

// maxDroppedAttachmentBytes mirrors the MAX_ATTACHMENT_BYTES limit in the
// frontend — drops from the OS bypass the browser's File-picker path.
const maxDroppedAttachmentBytes = 100 * 1024 * 1024

// stashConcurrency bounds parallel blob writes so a multi-file send doesn't
// spike memory by encrypting every attachment at once.
const stashConcurrency = 4

// notesState caches the vault key so one Keychain prompt is reused across
// every project this session.
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

	// Retry loop covers the race where invalidateKey fires while we're
	// opening: we'd otherwise publish a store built with a stale key.
	for attempt := 0; attempt < 3; attempt++ {
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
		keyAtOpen := n.key
		n.mu.Unlock()

		// Opening runs migrations, which can take seconds on a large legacy
		// DB. Doing this outside the lock prevents an unrelated project's
		// first open from blocking every other notes call.
		store, err := notes.Open(ctx, project, keyAtOpen)
		if err != nil {
			return nil, err
		}
		blobs, err := notes.NewBlobStore(store.BlobsDir(), keyAtOpen)
		if err != nil {
			store.Close()
			return nil, err
		}

		n.mu.Lock()
		// Another caller may have raced us and published first — reuse theirs.
		if existing, ok := n.stores[project]; ok {
			n.mu.Unlock()
			store.Close()
			return existing, nil
		}
		// Key was invalidated mid-open (import / key rotation). Our store
		// holds the old key; discard it and retry with the fresh key.
		if !bytes.Equal(n.key, keyAtOpen) {
			n.mu.Unlock()
			store.Close()
			continue
		}
		b := &notesBundle{store: store, blobs: blobs}
		n.stores[project] = b
		n.mu.Unlock()
		return b, nil
	}
	return nil, errors.New("notes: vault key invalidated repeatedly during open")
}

func (n *notesState) forget(project string) {
	n.mu.Lock()
	defer n.mu.Unlock()
	if b, ok := n.stores[project]; ok {
		b.store.Close()
		delete(n.stores, project)
	}
}

// invalidateKey: next access re-fetches from Keychain. Called after key import.
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

// NotesAttachmentInput: Data is base64 (std, padded). Wails' []byte handling
// is a type-only lie (generated TS says Array<number> but Go json.Marshal
// emits a base64 string), so we use an explicit string to avoid the mismatch.
type NotesAttachmentInput struct {
	Name     string `json:"name"`
	MimeType string `json:"mimeType"`
	Data     string `json:"data"`
}

// NotesAddMessage: on failure, successfully-written blobs may remain as
// orphans until the next delete GCs them.
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

func (a *App) NotesSearch(project, query string, limit int) ([]notes.SearchHit, error) {
	b, err := a.notes.open(a.ctx, project)
	if err != nil {
		return nil, err
	}
	hits, err := b.store.Search(a.ctx, query, limit)
	if err != nil {
		return nil, err
	}
	if hits == nil {
		hits = []notes.SearchHit{}
	}
	return hits, nil
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
	// Belt-and-suspenders sweep: removes any blob with no DB reference,
	// including pre-existing orphans from a failed AddMessage write or a
	// previous chat-delete whose blob removal returned an error.
	b.sweepUnreferencedBlobs(a.ctx)
	return nil
}

// gcOrphanBlobs: failures are tolerated; the next GC sweep cleans up.
func (b *notesBundle) gcOrphanBlobs(hashes []string) {
	for _, h := range hashes {
		if err := b.blobs.Delete(h); err != nil {
			fmt.Fprintf(os.Stderr, "warning: notes: delete orphan blob %s: %v\n", h, err)
		}
	}
}

func (b *notesBundle) sweepUnreferencedBlobs(ctx context.Context) {
	refs, err := b.store.AllAttachmentHashes(ctx)
	if err != nil {
		fmt.Fprintf(os.Stderr, "warning: notes: list attachment refs: %v\n", err)
		return
	}
	if _, err := b.blobs.GC(refs); err != nil {
		fmt.Fprintf(os.Stderr, "warning: notes: blob sweep: %v\n", err)
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

// NotesReadFileAsInput: Wails delivers OS file paths rather than File blobs
// for native drag-and-drop, so we read it ourselves.
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

// NotesReadAttachment returns base64; see NotesAttachmentInput for rationale.
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

// NotesSaveAttachment uses OpenDirectoryDialog because native SaveFileDialog
// is flaky on newer macOS. Returns "" when the dialog is cancelled.
func (a *App) NotesSaveAttachment(project, hash, name string) (result string, err error) {
	defer recoverAs("save attachment", &err)

	dir, err := a.chooseFolder("Save attachment to folder", true)
	if err != nil {
		return "", err
	}
	if dir == "" {
		return "", nil
	}

	b, err := a.notes.open(a.ctx, project)
	if err != nil {
		return "", err
	}
	data, err := b.blobs.Read(hash)
	if err != nil {
		return "", err
	}

	path := filepath.Join(dir, filepath.Base(name))
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return "", err
	}
	return path, nil
}

func (a *App) VaultExportKey(passphrase string) (result string, err error) {
	defer recoverAs("vault export", &err)

	dir, err := a.chooseFolder("Choose folder for lpm vault key", true)
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

// VaultImportKey errors if the Keychain already holds a different key
// (caller must delete it first).
func (a *App) VaultImportKey(passphrase string) (err error) {
	defer recoverAs("vault import", &err)

	path, err := a.wails.Dialog.OpenFile().
		SetTitle("Import lpm vault key").
		AddFilter("JSON (*.json)", "*.json").
		PromptForSingleSelection()
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

// removeNotes intentionally leaves the shared vault key intact.
func (a *App) removeNotes(project string) {
	a.notes.forget(project)

	dir := config.NotesDir(project)
	if err := removeAllWithRetry(dir); err != nil {
		fmt.Fprintf(os.Stderr, "warning: notes: remove dir %q: %v\n", dir, err)
	}
}

// stashAttachments: on error, blobs written so far stay on disk as orphans
// until the next delete GCs them.
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
