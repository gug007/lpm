package notes

import (
	"context"
	"crypto/rand"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

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
	s, err := openStoreAt(context.Background(), "test", dir, key)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s, key
}

// newTestChat seeds a fresh chat in s so message-focused tests don't need to
// interleave chat setup with the behavior they're actually checking.
func newTestChat(t *testing.T, s *Store) string {
	t.Helper()
	c, err := s.CreateChat(context.Background(), "test")
	if err != nil {
		t.Fatalf("create chat: %v", err)
	}
	return c.ID
}

func TestStore_AddAndList(t *testing.T) {
	s, _ := newTestStore(t)
	ctx := context.Background()
	chat := newTestChat(t, s)

	a, err := s.AddMessage(ctx, chat, "hello", nil)
	if err != nil {
		t.Fatalf("add: %v", err)
	}
	b, err := s.AddMessage(ctx, chat, "world", []Attachment{
		{Hash: "deadbeef", Name: "a.txt", Size: 3, MimeType: "text/plain"},
	})
	if err != nil {
		t.Fatalf("add: %v", err)
	}

	msgs, err := s.ListMessages(ctx, chat, 10, "")
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
	chat := newTestChat(t, s)

	for i := 0; i < 5; i++ {
		if _, err := s.AddMessage(ctx, chat, "msg", nil); err != nil {
			t.Fatalf("add: %v", err)
		}
	}

	first, err := s.ListMessages(ctx, chat, 2, "")
	if err != nil || len(first) != 2 {
		t.Fatalf("first page: %v len=%d", err, len(first))
	}
	second, err := s.ListMessages(ctx, chat, 2, first[1].ID)
	if err != nil {
		t.Fatalf("second page: %v", err)
	}
	if len(second) != 2 {
		t.Fatalf("second len = %d, want 2", len(second))
	}
	third, err := s.ListMessages(ctx, chat, 2, second[1].ID)
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
	chat := newTestChat(t, s)

	m, err := s.AddMessage(ctx, chat, "original", nil)
	if err != nil {
		t.Fatalf("add: %v", err)
	}
	if err := s.EditMessage(ctx, m.ID, "updated"); err != nil {
		t.Fatalf("edit: %v", err)
	}
	msgs, _ := s.ListMessages(ctx, chat, 10, "")
	if msgs[0].Text != "updated" {
		t.Fatalf("text = %q, want updated", msgs[0].Text)
	}
	if msgs[0].EditedAt == nil {
		t.Fatalf("edited_ts should be set")
	}

	if _, err := s.DeleteMessage(ctx, m.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	msgs, _ = s.ListMessages(ctx, chat, 10, "")
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
	chat := newTestChat(t, s)

	// Two messages share hash "shared"; only "solo" is exclusive to m1.
	m1, err := s.AddMessage(ctx, chat, "first", []Attachment{
		{Hash: "shared", Name: "x", Size: 1},
		{Hash: "solo", Name: "y", Size: 2},
	})
	if err != nil {
		t.Fatalf("add m1: %v", err)
	}
	if _, err := s.AddMessage(ctx, chat, "second", []Attachment{
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

	s, err := openStoreAt(context.Background(), "test", dir, key)
	if err != nil {
		t.Fatalf("first open: %v", err)
	}
	ctx := context.Background()
	chat, err := s.CreateChat(ctx, "c")
	if err != nil {
		t.Fatalf("create chat: %v", err)
	}
	if _, err := s.AddMessage(ctx, chat.ID, "x", nil); err != nil {
		t.Fatalf("add: %v", err)
	}
	s.Close()

	if _, err := os.Stat(filepath.Join(dir, "notes.db")); err != nil {
		t.Fatalf("db file missing: %v", err)
	}

	wrong := newTestKey(t)
	bad, err := openStoreAt(context.Background(), "test", dir, wrong)
	if err == nil {
		bad.Close()
		t.Fatal("opened DB with wrong key; expected ping failure")
	}
}

func TestStore_RejectsBadKeyLength(t *testing.T) {
	if _, err := openStoreAt(context.Background(), "test", t.TempDir(), []byte{1, 2, 3}); err == nil {
		t.Fatal("expected error for short key")
	}
}

func TestStore_ChatCRUDAndOrdering(t *testing.T) {
	s, _ := newTestStore(t)
	ctx := context.Background()

	a, err := s.CreateChat(ctx, "alpha")
	if err != nil {
		t.Fatalf("create a: %v", err)
	}
	// Force a millisecond gap so updated_ts orderings are unambiguous —
	// CreateChat/AddMessage both stamp with time.Now().UnixMilli() and two
	// calls in the same ms will tie-break on id (random UUID).
	time.Sleep(2 * time.Millisecond)
	b, err := s.CreateChat(ctx, "beta")
	if err != nil {
		t.Fatalf("create b: %v", err)
	}

	chats, err := s.ListChats(ctx)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(chats) != 2 {
		t.Fatalf("len = %d, want 2", len(chats))
	}
	// beta created after alpha — newer first
	if chats[0].ID != b.ID || chats[1].ID != a.ID {
		t.Fatalf("order = [%s,%s], want [%s,%s]", chats[0].ID, chats[1].ID, b.ID, a.ID)
	}

	// Adding a message to alpha should bump alpha to the top.
	time.Sleep(2 * time.Millisecond)
	if _, err := s.AddMessage(ctx, a.ID, "hi", nil); err != nil {
		t.Fatalf("add: %v", err)
	}
	chats, _ = s.ListChats(ctx)
	if chats[0].ID != a.ID {
		t.Fatalf("after message, top = %s, want %s", chats[0].ID, a.ID)
	}

	if err := s.RenameChat(ctx, a.ID, "renamed"); err != nil {
		t.Fatalf("rename: %v", err)
	}
	chats, _ = s.ListChats(ctx)
	if chats[0].Title != "renamed" {
		t.Fatalf("title = %q, want renamed", chats[0].Title)
	}

	if err := s.RenameChat(ctx, "missing", "x"); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("rename missing: %v, want ErrNoRows", err)
	}
}

func TestStore_DeleteChatReturnsOrphans(t *testing.T) {
	s, _ := newTestStore(t)
	ctx := context.Background()
	a := newTestChat(t, s)
	b := newTestChat(t, s)

	// "shared" is referenced by both chats; "solo" only by a. Deleting a
	// should orphan "solo" but keep "shared" alive.
	if _, err := s.AddMessage(ctx, a, "m1", []Attachment{
		{Hash: "shared", Name: "x", Size: 1},
		{Hash: "solo", Name: "y", Size: 2},
	}); err != nil {
		t.Fatalf("add a/m1: %v", err)
	}
	if _, err := s.AddMessage(ctx, b, "m2", []Attachment{
		{Hash: "shared", Name: "x", Size: 1},
	}); err != nil {
		t.Fatalf("add b/m2: %v", err)
	}

	orphans, err := s.DeleteChat(ctx, a)
	if err != nil {
		t.Fatalf("delete: %v", err)
	}
	if len(orphans) != 1 || orphans[0] != "solo" {
		t.Fatalf("orphans = %v, want [solo]", orphans)
	}

	chats, _ := s.ListChats(ctx)
	if len(chats) != 1 || chats[0].ID != b {
		t.Fatalf("remaining chats = %+v, want just b", chats)
	}

	msgs, _ := s.ListMessages(ctx, b, 10, "")
	if len(msgs) != 1 {
		t.Fatalf("b msgs = %d, want 1", len(msgs))
	}

	if _, err := s.DeleteChat(ctx, "missing"); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("delete missing: %v, want ErrNoRows", err)
	}
}

func TestStore_AddMessageRejectsUnknownChat(t *testing.T) {
	s, _ := newTestStore(t)
	if _, err := s.AddMessage(context.Background(), "missing", "hi", nil); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("add unknown chat: %v, want ErrNoRows", err)
	}
}

// Simulates an on-disk DB created before chats existed. After reopening with
// the current schema, every pre-existing message should have been backfilled
// into a single "General" chat.
func TestStore_BackfillsLegacyMessagesIntoDefaultChat(t *testing.T) {
	key := newTestKey(t)
	dir := t.TempDir()
	ctx := context.Background()

	// Open with the real schema, then hand-roll the legacy state: drop chat_id
	// from existing rows and delete the chats table so the next open sees a
	// pre-chats DB.
	s, err := openStoreAt(ctx, "legacy", dir, key)
	if err != nil {
		t.Fatalf("first open: %v", err)
	}
	chat, err := s.CreateChat(ctx, "seed")
	if err != nil {
		t.Fatalf("seed chat: %v", err)
	}
	if _, err := s.AddMessage(ctx, chat.ID, "hello", nil); err != nil {
		t.Fatalf("seed message: %v", err)
	}
	if _, err := s.AddMessage(ctx, chat.ID, "world", nil); err != nil {
		t.Fatalf("seed message: %v", err)
	}
	if _, err := s.db.ExecContext(ctx, `UPDATE messages SET chat_id = NULL`); err != nil {
		t.Fatalf("nuke chat_id: %v", err)
	}
	if _, err := s.db.ExecContext(ctx, `DELETE FROM chats`); err != nil {
		t.Fatalf("nuke chats: %v", err)
	}
	s.Close()

	// Reopen — migrate() should create a default chat and backfill.
	s2, err := openStoreAt(ctx, "legacy", dir, key)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer s2.Close()

	chats, err := s2.ListChats(ctx)
	if err != nil {
		t.Fatalf("list chats: %v", err)
	}
	if len(chats) != 1 || chats[0].Title != "General" {
		t.Fatalf("chats = %+v, want one General chat", chats)
	}
	msgs, err := s2.ListMessages(ctx, chats[0].ID, 10, "")
	if err != nil {
		t.Fatalf("list msgs: %v", err)
	}
	if len(msgs) != 2 {
		t.Fatalf("msgs = %d, want 2", len(msgs))
	}
}
