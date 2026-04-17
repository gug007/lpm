package notes

import (
	"context"
	"crypto/rand"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/gug007/lpm/desktop/vault"
)

func newTestKey(t *testing.T) []byte {
	t.Helper()
	key := make([]byte, vault.KeyLen)
	if _, err := rand.Read(key); err != nil {
		t.Fatalf("rand: %v", err)
	}
	return key
}

func newTestStore(t *testing.T) (*Store, []byte) {
	t.Helper()
	key := newTestKey(t)
	dir := t.TempDir()
	s, err := openStoreAt("test", dir, key)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s, key
}

func TestStore_AddAndList(t *testing.T) {
	s, _ := newTestStore(t)
	ctx := context.Background()

	a, err := s.AddMessage(ctx, "hello", nil)
	if err != nil {
		t.Fatalf("add: %v", err)
	}
	b, err := s.AddMessage(ctx, "world", []Attachment{
		{Hash: "deadbeef", Name: "a.txt", Size: 3, MimeType: "text/plain"},
	})
	if err != nil {
		t.Fatalf("add: %v", err)
	}

	msgs, err := s.ListMessages(ctx, 10, "")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(msgs) != 2 {
		t.Fatalf("len = %d, want 2", len(msgs))
	}
	// newest first
	if msgs[0].ID != b.ID || msgs[1].ID != a.ID {
		t.Fatalf("order wrong: got %q, %q", msgs[0].ID, msgs[1].ID)
	}
	if len(msgs[0].Attachments) != 1 || msgs[0].Attachments[0].Hash != "deadbeef" {
		t.Fatalf("attachments missing: %+v", msgs[0].Attachments)
	}
	if len(msgs[1].Attachments) != 0 {
		t.Fatalf("unexpected attachments on a: %+v", msgs[1].Attachments)
	}
}

func TestStore_ListPagination(t *testing.T) {
	s, _ := newTestStore(t)
	ctx := context.Background()

	for i := 0; i < 5; i++ {
		if _, err := s.AddMessage(ctx, "msg", nil); err != nil {
			t.Fatalf("add: %v", err)
		}
	}

	first, err := s.ListMessages(ctx, 2, "")
	if err != nil || len(first) != 2 {
		t.Fatalf("first page: %v len=%d", err, len(first))
	}
	second, err := s.ListMessages(ctx, 2, first[1].ID)
	if err != nil {
		t.Fatalf("second page: %v", err)
	}
	if len(second) != 2 {
		t.Fatalf("second len = %d, want 2", len(second))
	}
	third, err := s.ListMessages(ctx, 2, second[1].ID)
	if err != nil {
		t.Fatalf("third page: %v", err)
	}
	if len(third) != 1 {
		t.Fatalf("third len = %d, want 1 (last message)", len(third))
	}
	seen := map[string]bool{}
	var all []Message
	all = append(all, first...)
	all = append(all, second...)
	all = append(all, third...)
	for _, m := range all {
		if seen[m.ID] {
			t.Fatalf("duplicate id across pages: %s", m.ID)
		}
		seen[m.ID] = true
	}
	if len(seen) != 5 {
		t.Fatalf("saw %d unique ids, want 5", len(seen))
	}
}

func TestStore_EditAndDelete(t *testing.T) {
	s, _ := newTestStore(t)
	ctx := context.Background()

	m, err := s.AddMessage(ctx, "original", nil)
	if err != nil {
		t.Fatalf("add: %v", err)
	}
	if err := s.EditMessage(ctx, m.ID, "updated"); err != nil {
		t.Fatalf("edit: %v", err)
	}
	msgs, _ := s.ListMessages(ctx, 10, "")
	if msgs[0].Text != "updated" {
		t.Fatalf("text = %q, want updated", msgs[0].Text)
	}
	if msgs[0].EditedAt == nil {
		t.Fatalf("edited_ts should be set")
	}

	if _, err := s.DeleteMessage(ctx, m.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	msgs, _ = s.ListMessages(ctx, 10, "")
	if len(msgs) != 0 {
		t.Fatalf("messages remain after delete: %+v", msgs)
	}

	if err := s.EditMessage(ctx, m.ID, "x"); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("edit missing: %v, want ErrNoRows", err)
	}
	if _, err := s.DeleteMessage(ctx, m.ID); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("delete missing: %v, want ErrNoRows", err)
	}
}

func TestStore_DeleteReturnsOrphans(t *testing.T) {
	s, _ := newTestStore(t)
	ctx := context.Background()

	// Two messages share hash "shared"; only "solo" is exclusive to m1.
	m1, err := s.AddMessage(ctx, "first", []Attachment{
		{Hash: "shared", Name: "x", Size: 1},
		{Hash: "solo", Name: "y", Size: 2},
	})
	if err != nil {
		t.Fatalf("add m1: %v", err)
	}
	if _, err := s.AddMessage(ctx, "second", []Attachment{
		{Hash: "shared", Name: "x", Size: 1},
	}); err != nil {
		t.Fatalf("add m2: %v", err)
	}

	orphans, err := s.DeleteMessage(ctx, m1.ID)
	if err != nil {
		t.Fatalf("delete: %v", err)
	}
	if len(orphans) != 1 || orphans[0] != "solo" {
		t.Fatalf("orphans = %v, want [solo]", orphans)
	}
}

func TestStore_WrongKeyFailsToOpen(t *testing.T) {
	dir := t.TempDir()
	key := newTestKey(t)

	s, err := openStoreAt("test", dir, key)
	if err != nil {
		t.Fatalf("first open: %v", err)
	}
	if _, err := s.AddMessage(context.Background(), "x", nil); err != nil {
		t.Fatalf("add: %v", err)
	}
	s.Close()

	if _, err := os.Stat(filepath.Join(dir, "notes.db")); err != nil {
		t.Fatalf("db file missing: %v", err)
	}

	wrong := newTestKey(t)
	bad, err := openStoreAt("test", dir, wrong)
	if err == nil {
		bad.Close()
		t.Fatal("opened DB with wrong key; expected ping failure")
	}
}

func TestStore_RejectsBadKeyLength(t *testing.T) {
	if _, err := openStoreAt("test", t.TempDir(), []byte{1, 2, 3}); err == nil {
		t.Fatal("expected error for short key")
	}
}
