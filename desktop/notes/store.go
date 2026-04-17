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

// Store — pair Open with Close.
type Store struct {
	db      *sql.DB
	project string
	dir     string
}

// Open: callers fetch vault.Key() once and reuse it across every project
// they open, so we don't round-trip the Keychain per project.
func Open(project string, key []byte) (*Store, error) {
	if project == "" {
		return nil, errors.New("notes: project name is empty")
	}
	return openStoreAt(project, config.NotesDir(project), key)
}

// openStoreAt is the concrete opener shared by production and tests. Tests
// pass a tmp dir and a fake key so they never touch the user's real tree.
func openStoreAt(project, dir string, key []byte) (*Store, error) {
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

	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("notes: ping db (bad key or corrupted file?): %w", err)
	}

	s := &Store{db: db, project: project, dir: dir}
	if err := s.migrate(); err != nil {
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

func (s *Store) migrate() error {
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
		`PRAGMA foreign_keys = ON`,
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	for _, stmt := range stmts {
		if _, err := s.db.ExecContext(ctx, stmt); err != nil {
			return fmt.Errorf("notes: migrate %q: %w", stmt, err)
		}
	}
	return nil
}

// AddMessage records metadata only — caller must have written attachment
// blobs first.
func (s *Store) AddMessage(ctx context.Context, text string, attachments []Attachment) (*Message, error) {
	msg := &Message{
		ID:          uuid.NewString(),
		Timestamp:   time.Now().UnixMilli(),
		Text:        text,
		Attachments: append([]Attachment(nil), attachments...),
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx,
		`INSERT INTO messages (id, ts, text) VALUES (?, ?, ?)`,
		msg.ID, msg.Timestamp, msg.Text); err != nil {
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

// ListMessages returns newest-first. Pass beforeID="" for the latest page.
// Slice shorter than limit ⇒ start of stream reached.
func (s *Store) ListMessages(ctx context.Context, limit int, beforeID string) ([]Message, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}

	var (
		rows *sql.Rows
		err  error
	)
	if beforeID != "" {
		rows, err = s.db.QueryContext(ctx,
			`SELECT id, ts, text, edited_ts FROM messages
			 WHERE seq < (SELECT seq FROM messages WHERE id = ?)
			 ORDER BY seq DESC LIMIT ?`, beforeID, limit)
	} else {
		rows, err = s.db.QueryContext(ctx,
			`SELECT id, ts, text, edited_ts FROM messages
			 ORDER BY seq DESC LIMIT ?`, limit)
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
		if err := rows.Scan(&m.ID, &m.Timestamp, &m.Text, &edited); err != nil {
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

	var orphans []string
	for _, h := range hashes {
		var count int
		if err := tx.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM attachments WHERE hash = ?`, h).Scan(&count); err != nil {
			return nil, fmt.Errorf("notes: count refs for %s: %w", h, err)
		}
		if count == 0 {
			orphans = append(orphans, h)
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return orphans, nil
}
