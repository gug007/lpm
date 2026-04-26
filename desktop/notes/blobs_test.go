package notes

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func newTestBlobs(t *testing.T) (*BlobStore, string) {
	t.Helper()
	dir := filepath.Join(t.TempDir(), "blobs")
	b, err := NewBlobStore(dir, newTestKey(t))
	if err != nil {
		t.Fatalf("new: %v", err)
	}
	return b, dir
}

func TestBlobs_PutReadRoundTrip(t *testing.T) {
	b, _ := newTestBlobs(t)
	data := []byte("hello, encrypted world")

	hash, size, err := b.Put(data)
	if err != nil {
		t.Fatalf("put: %v", err)
	}
	if size != int64(len(data)) {
		t.Fatalf("size = %d, want %d", size, len(data))
	}
	expected := hex.EncodeToString(sha256Sum(data))
	if hash != expected {
		t.Fatalf("hash = %s, want %s", hash, expected)
	}

	got, err := b.Read(hash)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if !bytes.Equal(got, data) {
		t.Fatalf("round-trip mismatch: got %q want %q", got, data)
	}
}

func TestBlobs_PutIsDedup(t *testing.T) {
	b, dir := newTestBlobs(t)
	data := []byte("dup me")

	h1, _, err := b.Put(data)
	if err != nil {
		t.Fatalf("put 1: %v", err)
	}
	info1, _ := os.Stat(filepath.Join(dir, h1+".enc"))
	h2, _, err := b.Put(data)
	if err != nil {
		t.Fatalf("put 2: %v", err)
	}
	if h1 != h2 {
		t.Fatalf("hash changed on second put: %s vs %s", h1, h2)
	}
	info2, _ := os.Stat(filepath.Join(dir, h2+".enc"))
	if !info1.ModTime().Equal(info2.ModTime()) {
		t.Fatalf("dedup didn't short-circuit: file was rewritten")
	}
}

func TestBlobs_DifferentPlaintextProducesDifferentCiphertext(t *testing.T) {
	b, dir := newTestBlobs(t)
	h1, _, err := b.Put([]byte("one"))
	if err != nil {
		t.Fatalf("put 1: %v", err)
	}
	h2, _, err := b.Put([]byte("two"))
	if err != nil {
		t.Fatalf("put 2: %v", err)
	}
	if h1 == h2 {
		t.Fatal("distinct plaintext collapsed to same hash")
	}
	c1, _ := os.ReadFile(filepath.Join(dir, h1+".enc"))
	c2, _ := os.ReadFile(filepath.Join(dir, h2+".enc"))
	if bytes.Equal(c1, c2) {
		t.Fatal("ciphertext identical for distinct plaintext")
	}
}

func TestBlobs_NoncesAreUnique(t *testing.T) {
	// Writing the same plaintext with two stores (different keys) must still
	// use independent, random nonces — guards against a future bug that
	// derives nonces deterministically from hash or similar.
	dir1 := filepath.Join(t.TempDir(), "a")
	dir2 := filepath.Join(t.TempDir(), "b")
	b1, err := NewBlobStore(dir1, newTestKey(t))
	if err != nil {
		t.Fatalf("new 1: %v", err)
	}
	b2, err := NewBlobStore(dir2, newTestKey(t))
	if err != nil {
		t.Fatalf("new 2: %v", err)
	}
	data := []byte("same bytes, different keys")
	h1, _, _ := b1.Put(data)
	h2, _, _ := b2.Put(data)
	if h1 != h2 {
		t.Fatal("sha256 somehow differs across stores")
	}
	c1, _ := os.ReadFile(filepath.Join(dir1, h1+".enc"))
	c2, _ := os.ReadFile(filepath.Join(dir2, h2+".enc"))
	nsize := 12
	if bytes.Equal(c1[:nsize], c2[:nsize]) {
		t.Fatal("nonces collided; should be random per write")
	}
}

func TestBlobs_ReadWithWrongKeyFails(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "blobs")
	keyA := newTestKey(t)
	a, err := NewBlobStore(dir, keyA)
	if err != nil {
		t.Fatalf("new a: %v", err)
	}
	hash, _, err := a.Put([]byte("secret"))
	if err != nil {
		t.Fatalf("put: %v", err)
	}

	b, err := NewBlobStore(dir, newTestKey(t))
	if err != nil {
		t.Fatalf("new b: %v", err)
	}
	if _, err := b.Read(hash); err == nil {
		t.Fatal("read with wrong key should fail auth tag check")
	}
}

func TestBlobs_RejectsOversizedPut(t *testing.T) {
	b, _ := newTestBlobs(t)
	big := make([]byte, MaxBlobSize+1)
	if _, _, err := b.Put(big); !errors.Is(err, ErrBlobTooLarge) {
		t.Fatalf("got %v, want ErrBlobTooLarge", err)
	}
}

func TestBlobs_ReadMissing(t *testing.T) {
	b, _ := newTestBlobs(t)
	h := strings.Repeat("a", 64)
	if _, err := b.Read(h); !errors.Is(err, ErrBlobNotFound) {
		t.Fatalf("got %v, want ErrBlobNotFound", err)
	}
}

func TestBlobs_ReadRejectsInvalidHash(t *testing.T) {
	b, _ := newTestBlobs(t)
	cases := []string{
		"../etc/passwd",
		"short",
		strings.Repeat("Z", 64),
		strings.Repeat("a", 63),
	}
	for _, h := range cases {
		if _, err := b.Read(h); err == nil {
			t.Fatalf("read(%q): expected error", h)
		}
	}
}

func TestBlobs_GCRemovesOrphans(t *testing.T) {
	b, dir := newTestBlobs(t)

	keep, _, _ := b.Put([]byte("keep"))
	drop, _, _ := b.Put([]byte("drop"))

	removed, err := b.GC(map[string]struct{}{keep: {}})
	if err != nil {
		t.Fatalf("gc: %v", err)
	}
	if removed != 1 {
		t.Fatalf("removed = %d, want 1", removed)
	}
	if _, err := os.Stat(filepath.Join(dir, keep+".enc")); err != nil {
		t.Fatalf("kept file gone: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, drop+".enc")); !os.IsNotExist(err) {
		t.Fatalf("dropped file still present: err=%v", err)
	}
}

func TestBlobs_GCOnMissingDir(t *testing.T) {
	b, err := NewBlobStore(filepath.Join(t.TempDir(), "never-created"), newTestKey(t))
	if err != nil {
		t.Fatalf("new: %v", err)
	}
	removed, err := b.GC(nil)
	if err != nil {
		t.Fatalf("gc: %v", err)
	}
	if removed != 0 {
		t.Fatalf("removed = %d, want 0", removed)
	}
}

func sha256Sum(b []byte) []byte {
	s := sha256.Sum256(b)
	return s[:]
}
