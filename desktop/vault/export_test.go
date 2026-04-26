package vault

import (
	"bytes"
	"crypto/rand"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func newTestKey(t *testing.T) []byte {
	t.Helper()
	key := make([]byte, KeyLen)
	if _, err := rand.Read(key); err != nil {
		t.Fatalf("rand: %v", err)
	}
	return key
}

func TestWrapUnwrap_RoundTrip(t *testing.T) {
	key := newTestKey(t)
	blob, err := wrapKey("correct horse battery staple", key)
	if err != nil {
		t.Fatalf("wrap: %v", err)
	}
	got, err := unwrapKey("correct horse battery staple", blob)
	if err != nil {
		t.Fatalf("unwrap: %v", err)
	}
	if !bytes.Equal(got, key) {
		t.Fatal("round-trip key mismatch")
	}
}

func TestWrapUnwrap_WrongPassphrase(t *testing.T) {
	key := newTestKey(t)
	blob, err := wrapKey("right passphrase", key)
	if err != nil {
		t.Fatalf("wrap: %v", err)
	}
	if _, err := unwrapKey("wrong passphrase", blob); !errors.Is(err, ErrWrongPassphrase) {
		t.Fatalf("got %v, want ErrWrongPassphrase", err)
	}
}

func TestUnwrap_RejectsBadKind(t *testing.T) {
	blob := []byte(`{"v":1,"kind":"lpm-notes-key","kdf":{"alg":"argon2id"},"enc":{"alg":"aes-256-gcm"}}`)
	if _, err := unwrapKey("passphrase", blob); err == nil || !strings.Contains(err.Error(), "kind") {
		t.Fatalf("got %v, want kind mismatch", err)
	}
}

func TestExportKey_RejectsShortPassphrase(t *testing.T) {
	if _, err := ExportKey("short"); err == nil {
		t.Fatal("expected error for short passphrase")
	}
}

func TestWrappedBlobShape(t *testing.T) {
	blob, err := wrapKey("passphrase", newTestKey(t))
	if err != nil {
		t.Fatalf("wrap: %v", err)
	}
	var ek ExportedKey
	if err := json.Unmarshal(blob, &ek); err != nil {
		t.Fatalf("parse: %v", err)
	}
	if ek.Version != 1 {
		t.Errorf("version = %d, want 1", ek.Version)
	}
	if ek.Kind != "lpm-vault-key" {
		t.Errorf("kind = %q, want lpm-vault-key", ek.Kind)
	}
	if ek.KDF.Algo != "argon2id" || ek.Enc.Algo != "aes-256-gcm" {
		t.Errorf("algos = %q / %q", ek.KDF.Algo, ek.Enc.Algo)
	}
	if ek.KDF.Memory == 0 || ek.KDF.Time == 0 || ek.KDF.Par == 0 {
		t.Errorf("kdf params not populated: %+v", ek.KDF)
	}
}
