package notes

import (
	"context"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/gug007/lpm/desktop/vault"
	"github.com/gug007/lpm/internal/config"

	_ "github.com/mutecomm/go-sqlcipher/v4"
)

type Message struct {
	ID          string       `json:"id"`
	ChatID      string       `json:"chatId"`
	Timestamp   int64        `json:"ts"`       // unix millis
	Text        string       `json:"text"`
	EditedAt    *int64       `json:"editedAt,omitempty"`
	Attachments []Attachment `json:"attachments,omitempty"`
}

// Attachment is metadata only; the bytes live in the blob store keyed by Hash.
type Attachment struct {
	Hash     string `json:"hash"`
	Name     string `json:"name"`
	Size     int64  `json:"size"`
	MimeType string `json:"mimeType"`
}

// Chat is a named conversation within a project. Messages belong to exactly
// one chat; chats are per-project (not shared across projects).
type Chat struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	CreatedAt int64  `json:"createdAt"`
	UpdatedAt int64  `json:"updatedAt"`
}

// DefaultChatTitle is used by the migration when backfilling legacy messages
// and by callers that want to create a project's first chat with a sensible
// default label.
const DefaultChatTitle = "General"

// Store — pair Open with Close.
type Store struct {
	db      *sql.DB
	project string
	dir     string
}

// Open: callers fetch vault.Key() once and reuse it across every project
// they open, so we don't round-trip the Keychain per project. The ctx bounds
// schema migration — pass a real one (not Background) so shutdown cancels
// a slow legacy backfill cleanly.
func Open(ctx context.Context, project string, key []byte) (*Store, error) {
	if project == "" {
		return nil, errors.New("notes: project name is empty")
	}
	return openStoreAt(ctx, project, config.NotesDir(project), key)
}

// openStoreAt is the concrete opener shared by production and tests. Tests
// pass a tmp dir and a fake key so they never touch the user's real tree.
func openStoreAt(ctx context.Context, project, dir string, key []byte) (*Store, error) {
	if len(key) != vault.KeyLen {
		return nil, fmt.Errorf("notes: key length = %d, want %d", len(key), vault.KeyLen)
	}
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, fmt.Errorf("notes: create dir: %w", err)
	}

	dbPath := filepath.Join(dir, "notes.db")
	dsn := buildDSN(dbPath, key)
	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return nil, fmt.Errorf("notes: open db: %w", err)
	}
	db.SetMaxOpenConns(1)

	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("notes: ping db (bad key or corrupted file?): %w", err)
	}

	s := &Store{db: db, project: project, dir: dir}
	if err := s.migrate(ctx); err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}

// buildDSN returns a SQLCipher DSN pinning the key and a conservative cipher
// page size. Uses the file:// URI form so pragma params ride the query string.
func buildDSN(dbPath string, key []byte) string {
	keyLiteral := "x'" + hex.EncodeToString(key) + "'"
	q := url.Values{}
	q.Set("_pragma_key", keyLiteral)
	q.Set("_pragma_cipher_page_size", "4096")
	return "file:" + dbPath + "?" + q.Encode()
}

func (s *Store) BlobsDir() string {
	return filepath.Join(s.dir, "blobs")
}

func (s *Store) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}

func (s *Store) migrate(ctx context.Context) error {
	stmts := []string{
		// seq is the monotonic row key; id is the public handle used by the
		// API and attachment FK. Ordering and pagination use seq so messages
		// added in the same millisecond still have a stable total order.
		`CREATE TABLE IF NOT EXISTS messages (
			seq INTEGER PRIMARY KEY AUTOINCREMENT,
			id TEXT UNIQUE NOT NULL,
			ts INTEGER NOT NULL,
			text TEXT NOT NULL,
			edited_ts INTEGER
		)`,
		`CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(ts)`,
		`CREATE TABLE IF NOT EXISTS attachments (
			message_id TEXT NOT NULL,
			hash TEXT NOT NULL,
			name TEXT NOT NULL,
			size INTEGER NOT NULL,
			mime_type TEXT,
			PRIMARY KEY (message_id, hash),
			FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
		)`,
		`CREATE INDEX IF NOT EXISTS idx_attachments_hash ON attachments(hash)`,
		`CREATE TABLE IF NOT EXISTS chats (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL,
			created_ts INTEGER NOT NULL,
			updated_ts INTEGER NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_chats_updated ON chats(updated_ts)`,
		`PRAGMA foreign_keys = ON`,
	}
	for _, stmt := range stmts {
		if _, err := s.db.ExecContext(ctx, stmt); err != nil {
			return fmt.Errorf("notes: migrate %q: %w", stmt, err)
		}
	}
	if err := s.ensureChatIDColumn(ctx); err != nil {
		return err
	}
	return s.backfillDefaultChat(ctx)
}

// ensureChatIDColumn adds messages.chat_id on first boot of a DB that predates
// the chats feature. Idempotent — safe to run on every open.
func (s *Store) ensureChatIDColumn(ctx context.Context) error {
	rows, err := s.db.QueryContext(ctx, `PRAGMA table_info(messages)`)
	if err != nil {
		return fmt.Errorf("notes: probe messages schema: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var (
			cid, notnull, pk int
			name, ctype      string
			dflt             sql.NullString
		)
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pk); err != nil {
			return err
		}
		if name == "chat_id" {
			return rows.Err()
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if _, err := s.db.ExecContext(ctx, `ALTER TABLE messages ADD COLUMN chat_id TEXT`); err != nil {
		return fmt.Errorf("notes: add chat_id column: %w", err)
	}
	if _, err := s.db.ExecContext(ctx,
		`CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, seq)`); err != nil {
		return fmt.Errorf("notes: create chat index: %w", err)
	}
	return nil
}

// backfillDefaultChat moves any pre-chats messages into a newly created
// "General" chat. Runs only when unassigned messages exist.
func (s *Store) backfillDefaultChat(ctx context.Context) error {
	var unassigned int
	if err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM messages WHERE chat_id IS NULL`).Scan(&unassigned); err != nil {
		return fmt.Errorf("notes: count unassigned messages: %w", err)
	}
	if unassigned == 0 {
		return nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	id := uuid.NewString()
	now := time.Now().UnixMilli()
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO chats (id, title, created_ts, updated_ts) VALUES (?, ?, ?, ?)`,
		id, DefaultChatTitle, now, now); err != nil {
		return fmt.Errorf("notes: create default chat: %w", err)
	}
	if _, err := tx.ExecContext(ctx,
		`UPDATE messages SET chat_id = ? WHERE chat_id IS NULL`, id); err != nil {
		return fmt.Errorf("notes: backfill chat_id: %w", err)
	}
	return tx.Commit()
}

// AddMessage records metadata only — caller must have written attachment
// blobs first. Also bumps the owning chat's updated_ts so chat lists can
// order by recency.
func (s *Store) AddMessage(ctx context.Context, chatID, text string, attachments []Attachment) (*Message, error) {
	if chatID == "" {
		return nil, errors.New("notes: chat id is empty")
	}
	msg := &Message{
		ID:          uuid.NewString(),
		ChatID:      chatID,
		Timestamp:   time.Now().UnixMilli(),
		Text:        text,
		Attachments: append([]Attachment(nil), attachments...),
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	// UPDATE serves as existence check: RowsAffected == 0 ⇒ no such chat.
	// Cheaper than a separate COUNT(*) round-trip and avoids TOCTOU.
	res, err := tx.ExecContext(ctx,
		`UPDATE chats SET updated_ts = ? WHERE id = ?`, msg.Timestamp, chatID)
	if err != nil {
		return nil, fmt.Errorf("notes: bump chat: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, sql.ErrNoRows
	}

	if _, err := tx.ExecContext(ctx,
		`INSERT INTO messages (id, chat_id, ts, text) VALUES (?, ?, ?, ?)`,
		msg.ID, msg.ChatID, msg.Timestamp, msg.Text); err != nil {
		return nil, fmt.Errorf("notes: insert message: %w", err)
	}
	for _, att := range attachments {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO attachments (message_id, hash, name, size, mime_type)
			 VALUES (?, ?, ?, ?, ?)`,
			msg.ID, att.Hash, att.Name, att.Size, att.MimeType); err != nil {
			return nil, fmt.Errorf("notes: insert attachment: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return msg, nil
}

// ListMessages returns newest-first within a chat. Pass beforeID="" for the
// latest page. Slice shorter than limit ⇒ start of stream reached.
func (s *Store) ListMessages(ctx context.Context, chatID string, limit int, beforeID string) ([]Message, error) {
	if chatID == "" {
		return nil, errors.New("notes: chat id is empty")
	}
	if limit <= 0 || limit > 500 {
		limit = 100
	}

	var (
		rows *sql.Rows
		err  error
	)
	if beforeID != "" {
		rows, err = s.db.QueryContext(ctx,
			`SELECT id, chat_id, ts, text, edited_ts FROM messages
			 WHERE chat_id = ?
			   AND seq < (SELECT seq FROM messages WHERE id = ?)
			 ORDER BY seq DESC LIMIT ?`, chatID, beforeID, limit)
	} else {
		rows, err = s.db.QueryContext(ctx,
			`SELECT id, chat_id, ts, text, edited_ts FROM messages
			 WHERE chat_id = ?
			 ORDER BY seq DESC LIMIT ?`, chatID, limit)
	}
	if err != nil {
		return nil, fmt.Errorf("notes: list messages: %w", err)
	}
	defer rows.Close()

	var (
		msgs []Message
		ids  []string
	)
	for rows.Next() {
		var m Message
		var edited sql.NullInt64
		if err := rows.Scan(&m.ID, &m.ChatID, &m.Timestamp, &m.Text, &edited); err != nil {
			return nil, err
		}
		if edited.Valid {
			v := edited.Int64
			m.EditedAt = &v
		}
		msgs = append(msgs, m)
		ids = append(ids, m.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if len(ids) == 0 {
		return msgs, nil
	}

	byID := make(map[string]*Message, len(msgs))
	for i := range msgs {
		byID[msgs[i].ID] = &msgs[i]
	}
	if err := s.loadAttachments(ctx, ids, byID); err != nil {
		return nil, err
	}
	return msgs, nil
}

func (s *Store) loadAttachments(ctx context.Context, ids []string, byID map[string]*Message) error {
	placeholders := strings.Repeat("?,", len(ids)-1) + "?"
	args := make([]any, len(ids))
	for i, id := range ids {
		args[i] = id
	}
	query := `SELECT message_id, hash, name, size, mime_type
	          FROM attachments WHERE message_id IN (` + placeholders + `)`

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("notes: load attachments: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var msgID string
		var att Attachment
		var mime sql.NullString
		if err := rows.Scan(&msgID, &att.Hash, &att.Name, &att.Size, &mime); err != nil {
			return err
		}
		if mime.Valid {
			att.MimeType = mime.String
		}
		if m, ok := byID[msgID]; ok {
			m.Attachments = append(m.Attachments, att)
		}
	}
	return rows.Err()
}

// EditMessage returns sql.ErrNoRows if the message does not exist.
func (s *Store) EditMessage(ctx context.Context, id, text string) error {
	res, err := s.db.ExecContext(ctx,
		`UPDATE messages SET text = ?, edited_ts = ? WHERE id = ?`,
		text, time.Now().UnixMilli(), id)
	if err != nil {
		return fmt.Errorf("notes: edit message: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// DeleteMessage removes a message (its attachment rows cascade) and returns
// the hashes of any attachments that no other message still references. The
// caller should pass those hashes to the blob store to free disk space.
// Returns sql.ErrNoRows if the message does not exist.
func (s *Store) DeleteMessage(ctx context.Context, id string) ([]string, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	rows, err := tx.QueryContext(ctx,
		`SELECT hash FROM attachments WHERE message_id = ?`, id)
	if err != nil {
		return nil, fmt.Errorf("notes: read attachment hashes: %w", err)
	}
	var hashes []string
	for rows.Next() {
		var h string
		if err := rows.Scan(&h); err != nil {
			rows.Close()
			return nil, err
		}
		hashes = append(hashes, h)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	res, err := tx.ExecContext(ctx, `DELETE FROM messages WHERE id = ?`, id)
	if err != nil {
		return nil, fmt.Errorf("notes: delete message: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return nil, sql.ErrNoRows
	}

	orphans, err := orphansAmong(ctx, tx, hashes)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return orphans, nil
}

// ListChats returns chats ordered by most-recently-updated first.
func (s *Store) ListChats(ctx context.Context) ([]Chat, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, title, created_ts, updated_ts FROM chats ORDER BY updated_ts DESC, id`)
	if err != nil {
		return nil, fmt.Errorf("notes: list chats: %w", err)
	}
	defer rows.Close()
	var chats []Chat
	for rows.Next() {
		var c Chat
		if err := rows.Scan(&c.ID, &c.Title, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		chats = append(chats, c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("notes: list chats rows: %w", err)
	}
	return chats, nil
}

// ChatExists reports whether a chat with the given id is in the store.
// Callers use it as a cheap precondition check — e.g. before stashing
// attachments for a message that would otherwise land on a deleted chat.
func (s *Store) ChatExists(ctx context.Context, id string) (bool, error) {
	var n int
	if err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM chats WHERE id = ?`, id).Scan(&n); err != nil {
		return false, fmt.Errorf("notes: chat exists: %w", err)
	}
	return n > 0, nil
}

// CreateChat creates a chat with the given title. Empty/whitespace titles
// are rejected so callers that want a default must be explicit.
func (s *Store) CreateChat(ctx context.Context, title string) (*Chat, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		return nil, errors.New("notes: chat title is empty")
	}
	c := &Chat{
		ID:        uuid.NewString(),
		Title:     title,
		CreatedAt: time.Now().UnixMilli(),
	}
	c.UpdatedAt = c.CreatedAt
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO chats (id, title, created_ts, updated_ts) VALUES (?, ?, ?, ?)`,
		c.ID, c.Title, c.CreatedAt, c.UpdatedAt); err != nil {
		return nil, fmt.Errorf("notes: create chat: %w", err)
	}
	return c, nil
}

// RenameChat returns sql.ErrNoRows if the chat does not exist. Empty titles
// are rejected.
func (s *Store) RenameChat(ctx context.Context, id, title string) error {
	title = strings.TrimSpace(title)
	if title == "" {
		return errors.New("notes: chat title is empty")
	}
	res, err := s.db.ExecContext(ctx,
		`UPDATE chats SET title = ? WHERE id = ?`, title, id)
	if err != nil {
		return fmt.Errorf("notes: rename chat: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// DeleteChat removes a chat and every message (and attachment row) it owns,
// returning blob hashes that no remaining attachment row references. Callers
// should pass those to the blob store to free disk space. Returns
// sql.ErrNoRows if the chat does not exist.
func (s *Store) DeleteChat(ctx context.Context, id string) ([]string, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	// Snapshot candidate hashes before the cascade wipes attachment rows.
	rows, err := tx.QueryContext(ctx,
		`SELECT DISTINCT hash FROM attachments
		 WHERE message_id IN (SELECT id FROM messages WHERE chat_id = ?)`, id)
	if err != nil {
		return nil, fmt.Errorf("notes: read chat attachments: %w", err)
	}
	var candidates []string
	for rows.Next() {
		var h string
		if err := rows.Scan(&h); err != nil {
			rows.Close()
			return nil, err
		}
		candidates = append(candidates, h)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Messages cascade to attachments via the existing FK.
	if _, err := tx.ExecContext(ctx,
		`DELETE FROM messages WHERE chat_id = ?`, id); err != nil {
		return nil, fmt.Errorf("notes: delete chat messages: %w", err)
	}
	res, err := tx.ExecContext(ctx, `DELETE FROM chats WHERE id = ?`, id)
	if err != nil {
		return nil, fmt.Errorf("notes: delete chat: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return nil, sql.ErrNoRows
	}

	orphans, err := orphansAmong(ctx, tx, candidates)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return orphans, nil
}

// orphansAmong returns the subset of candidates no longer referenced by any
// attachment row. One round-trip regardless of candidate count.
func orphansAmong(ctx context.Context, tx *sql.Tx, candidates []string) ([]string, error) {
	if len(candidates) == 0 {
		return nil, nil
	}
	placeholders := strings.Repeat("?,", len(candidates)-1) + "?"
	args := make([]any, len(candidates))
	for i, h := range candidates {
		args[i] = h
	}
	rows, err := tx.QueryContext(ctx,
		`SELECT DISTINCT hash FROM attachments WHERE hash IN (`+placeholders+`)`, args...)
	if err != nil {
		return nil, fmt.Errorf("notes: count orphan refs: %w", err)
	}
	defer rows.Close()
	stillRef := make(map[string]struct{}, len(candidates))
	for rows.Next() {
		var h string
		if err := rows.Scan(&h); err != nil {
			return nil, err
		}
		stillRef[h] = struct{}{}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	var orphans []string
	for _, h := range candidates {
		if _, keep := stillRef[h]; !keep {
			orphans = append(orphans, h)
		}
	}
	return orphans, nil
}
