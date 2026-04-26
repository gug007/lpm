package notes

import (
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/gug007/lpm/desktop/vault"
)

// MaxBlobSize caps a single attachment at 100MiB. Notes are a personal chat,
// not a file server; past this size the UX (memory use, encrypt-then-write
// latency) gets bad and the user should be using dedicated storage.
const MaxBlobSize = 100 * 1024 * 1024

var ErrBlobTooLarge = errors.New("notes: attachment exceeds max size")
var ErrBlobNotFound = errors.New("notes: blob not found")

// BlobStore writes content-addressed, AES-GCM-encrypted files under dir using
// a shared key. The filename is the hex sha256 of the plaintext, so the same
// plaintext uploaded twice collapses to one file.
type BlobStore struct {
	dir  string
	aead cipher.AEAD
}

// NewBlobStore: dir is created lazily on first Put.
func NewBlobStore(dir string, key []byte) (*BlobStore, error) {
	if len(key) != vault.KeyLen {
		return nil, fmt.Errorf("notes: blob key length = %d, want %d", len(key), vault.KeyLen)
	}
	aead, err := vault.NewAEAD(key)
	if err != nil {
		return nil, err
	}
	return &BlobStore{dir: dir, aead: aead}, nil
}

// Put dedups by sha256 of plaintext — same content writes once.
func (b *BlobStore) Put(data []byte) (hash string, size int64, err error) {
	if int64(len(data)) > MaxBlobSize {
		return "", 0, ErrBlobTooLarge
	}
	sum := sha256.Sum256(data)
	hash = hex.EncodeToString(sum[:])
	size = int64(len(data))

	path := b.path(hash)
	if _, err := os.Stat(path); err == nil {
		return hash, size, nil // already present
	}

	if err := os.MkdirAll(b.dir, 0700); err != nil {
		return "", 0, fmt.Errorf("notes: mkdir blobs: %w", err)
	}

	nonce := make([]byte, b.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", 0, fmt.Errorf("notes: rand nonce: %w", err)
	}
	sealed := b.aead.Seal(nil, nonce, data, []byte(hash))

	// Write to a temp file then rename so a crash mid-write can't leave a
	// half-blob at the canonical name.
	tmp, err := os.CreateTemp(b.dir, ".blob-*.tmp")
	if err != nil {
		return "", 0, fmt.Errorf("notes: temp file: %w", err)
	}
	tmpName := tmp.Name()
	cleanup := func() { os.Remove(tmpName) }

	if _, err := tmp.Write(nonce); err != nil {
		tmp.Close()
		cleanup()
		return "", 0, fmt.Errorf("notes: write nonce: %w", err)
	}
	if _, err := tmp.Write(sealed); err != nil {
		tmp.Close()
		cleanup()
		return "", 0, fmt.Errorf("notes: write cipher: %w", err)
	}
	if err := tmp.Close(); err != nil {
		cleanup()
		return "", 0, fmt.Errorf("notes: close tmp: %w", err)
	}
	if err := os.Rename(tmpName, path); err != nil {
		cleanup()
		return "", 0, fmt.Errorf("notes: rename tmp: %w", err)
	}
	return hash, size, nil
}

// Read returns ErrBlobNotFound when the file does not exist.
func (b *BlobStore) Read(hash string) ([]byte, error) {
	if !validHash(hash) {
		return nil, fmt.Errorf("notes: invalid hash %q", hash)
	}
	f, err := os.Open(b.path(hash))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, ErrBlobNotFound
		}
		return nil, err
	}
	defer f.Close()

	raw, err := io.ReadAll(f)
	if err != nil {
		return nil, err
	}
	ns := b.aead.NonceSize()
	if len(raw) < ns+b.aead.Overhead() {
		return nil, fmt.Errorf("notes: blob %s truncated", hash)
	}
	nonce, sealed := raw[:ns], raw[ns:]
	plain, err := b.aead.Open(nil, nonce, sealed, []byte(hash))
	if err != nil {
		return nil, fmt.Errorf("notes: decrypt %s: %w", hash, err)
	}
	return plain, nil
}

func (b *BlobStore) Exists(hash string) bool {
	if !validHash(hash) {
		return false
	}
	_, err := os.Stat(b.path(hash))
	return err == nil
}

// Delete treats a missing file as success so callers can use it for GC.
func (b *BlobStore) Delete(hash string) error {
	if !validHash(hash) {
		return fmt.Errorf("notes: invalid hash %q", hash)
	}
	err := os.Remove(b.path(hash))
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// GC removes blob files whose hash is not in `referenced`. Missing dir is
// not an error.
func (b *BlobStore) GC(referenced map[string]struct{}) (int, error) {
	entries, err := os.ReadDir(b.dir)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, err
	}
	removed := 0
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if filepath.Ext(name) != blobExt {
			continue
		}
		hash := name[:len(name)-len(blobExt)]
		if !validHash(hash) {
			continue
		}
		if _, keep := referenced[hash]; keep {
			continue
		}
		if err := os.Remove(filepath.Join(b.dir, name)); err != nil {
			return removed, err
		}
		removed++
	}
	return removed, nil
}

func (b *BlobStore) path(hash string) string {
	return filepath.Join(b.dir, hash+blobExt)
}

// validHash accepts only 64-character lowercase hex — the exact shape of a
// sha256 digest. Guards against path traversal via crafted hash strings.
func validHash(h string) bool {
	if len(h) != 64 {
		return false
	}
	for i := 0; i < len(h); i++ {
		c := h[i]
		if !(c >= '0' && c <= '9') && !(c >= 'a' && c <= 'f') {
			return false
		}
	}
	return true
}
