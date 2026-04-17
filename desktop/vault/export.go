package vault

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"

	"golang.org/x/crypto/argon2"
)

const (
	exportVersion    = 1
	exportKind       = "lpm-vault-key"
	argon2Memory     = 64 * 1024
	argon2Time       = 3
	argon2Par        = 4
	saltLen          = 16
	minPassphraseLen = 8
	kdfAlgo          = "argon2id"
	encAlgo          = "aes-256-gcm"
	aadPrefix        = "lpm-vault"
)

// ErrWrongPassphrase is returned by ImportKey when the AEAD auth tag fails.
// Most likely a wrong passphrase; could also be file corruption.
var ErrWrongPassphrase = errors.New("vault: wrong passphrase or corrupted export")

// ErrKeyConflict is returned when the local Keychain already holds a
// different vault key. Callers must resolve manually (DeleteKey first) so
// existing encrypted data isn't silently orphaned.
var ErrKeyConflict = errors.New("vault: local keychain holds a different vault key; delete it before importing")

// ExportedKey is the self-describing JSON shape. Binary fields are base64
// (std, padded); the rest is scalars for easy inspection.
type ExportedKey struct {
	Version int    `json:"v"`
	Kind    string `json:"kind"`
	KDF     struct {
		Algo   string `json:"alg"`
		Salt   string `json:"salt"`
		Memory uint32 `json:"m"`
		Time   uint32 `json:"t"`
		Par    uint8  `json:"p"`
		KeyLen uint32 `json:"l"`
	} `json:"kdf"`
	Enc struct {
		Algo       string `json:"alg"`
		Nonce      string `json:"nonce"`
		Ciphertext string `json:"ciphertext"`
	} `json:"enc"`
}

func ExportKey(passphrase string) ([]byte, error) {
	if err := checkPassphrase(passphrase); err != nil {
		return nil, err
	}
	key, err := Key()
	if err != nil {
		return nil, err
	}
	return wrapKey(passphrase, key)
}

// ImportKey unwraps a blob and stores the resulting key in the local
// Keychain. If the local Keychain already has a matching key, import is a
// no-op. If it holds a different key, returns ErrKeyConflict.
func ImportKey(passphrase string, data []byte) error {
	if passphrase == "" {
		return ErrEmptyPassphrase
	}
	key, err := unwrapKey(passphrase, data)
	if err != nil {
		return err
	}

	existing, err := fetchKey()
	if err == nil {
		if bytes.Equal(existing, key) {
			return nil
		}
		return ErrKeyConflict
	}
	return writeKey(key)
}

// wrapKey is the pure transform behind ExportKey: no Keychain access, so
// unit tests can exercise it without platform gating.
func wrapKey(passphrase string, key []byte) ([]byte, error) {
	if len(key) != KeyLen {
		return nil, fmt.Errorf("vault: key length = %d, want %d", len(key), KeyLen)
	}

	salt := make([]byte, saltLen)
	if _, err := rand.Read(salt); err != nil {
		return nil, fmt.Errorf("vault: rand salt: %w", err)
	}
	kek := argon2.IDKey([]byte(passphrase), salt, argon2Time, argon2Memory, argon2Par, KeyLen)

	aead, err := NewAEAD(kek)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, fmt.Errorf("vault: rand nonce: %w", err)
	}
	ciphertext := aead.Seal(nil, nonce, key, []byte(aadPrefix))

	out := ExportedKey{Version: exportVersion, Kind: exportKind}
	out.KDF.Algo = kdfAlgo
	out.KDF.Salt = base64.StdEncoding.EncodeToString(salt)
	out.KDF.Memory = argon2Memory
	out.KDF.Time = argon2Time
	out.KDF.Par = argon2Par
	out.KDF.KeyLen = KeyLen
	out.Enc.Algo = encAlgo
	out.Enc.Nonce = base64.StdEncoding.EncodeToString(nonce)
	out.Enc.Ciphertext = base64.StdEncoding.EncodeToString(ciphertext)

	return json.MarshalIndent(out, "", "  ")
}

func unwrapKey(passphrase string, data []byte) ([]byte, error) {
	var ek ExportedKey
	if err := json.Unmarshal(data, &ek); err != nil {
		return nil, fmt.Errorf("vault: parse export: %w", err)
	}
	if ek.Version != exportVersion {
		return nil, fmt.Errorf("vault: unsupported export version %d", ek.Version)
	}
	if ek.Kind != exportKind {
		return nil, fmt.Errorf("vault: unexpected export kind %q", ek.Kind)
	}
	if ek.KDF.Algo != kdfAlgo {
		return nil, fmt.Errorf("vault: unsupported kdf %q", ek.KDF.Algo)
	}
	if ek.Enc.Algo != encAlgo {
		return nil, fmt.Errorf("vault: unsupported cipher %q", ek.Enc.Algo)
	}
	if ek.KDF.KeyLen != KeyLen {
		return nil, fmt.Errorf("vault: unsupported key length %d", ek.KDF.KeyLen)
	}

	salt, err := base64.StdEncoding.DecodeString(ek.KDF.Salt)
	if err != nil {
		return nil, fmt.Errorf("vault: bad salt: %w", err)
	}
	nonce, err := base64.StdEncoding.DecodeString(ek.Enc.Nonce)
	if err != nil {
		return nil, fmt.Errorf("vault: bad nonce: %w", err)
	}
	ciphertext, err := base64.StdEncoding.DecodeString(ek.Enc.Ciphertext)
	if err != nil {
		return nil, fmt.Errorf("vault: bad ciphertext: %w", err)
	}

	kek := argon2.IDKey([]byte(passphrase), salt, ek.KDF.Time, ek.KDF.Memory, ek.KDF.Par, ek.KDF.KeyLen)
	aead, err := NewAEAD(kek)
	if err != nil {
		return nil, err
	}
	key, err := aead.Open(nil, nonce, ciphertext, []byte(aadPrefix))
	if err != nil {
		return nil, ErrWrongPassphrase
	}
	if len(key) != KeyLen {
		return nil, fmt.Errorf("vault: decrypted key has wrong length %d", len(key))
	}
	return key, nil
}

func checkPassphrase(p string) error {
	if len(p) < minPassphraseLen {
		return fmt.Errorf("vault: passphrase must be at least %d characters", minPassphraseLen)
	}
	return nil
}
