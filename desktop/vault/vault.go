// Package vault holds the single shared 32-byte AES-256 key used by every
// lpm feature that needs at-rest encryption (notes today, future env-var
// storage, etc.). The key lives in the macOS Keychain under
// service="lpm", account="vault" and is created on first use.
//
// Why one key instead of per-feature or per-project keys: all keys would
// live in the same login Keychain anyway, so per-feature isolation is
// theoretical — a reader with Keychain access already has every key.
// One entry means one Touch ID / password prompt per session.
package vault

import (
	"crypto/aes"
	"crypto/cipher"
	"errors"
	"fmt"
)

// KeyLen is the AES-256 key size in bytes.
const KeyLen = 32

var ErrEmptyPassphrase = errors.New("vault: passphrase required")

// NewAEAD builds the AES-256-GCM primitive. Callers generate fresh nonces
// per message.
func NewAEAD(key []byte) (cipher.AEAD, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("vault: new cipher: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("vault: new gcm: %w", err)
	}
	return aead, nil
}
