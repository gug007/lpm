// Package vault holds the shared 32-byte AES-256 key used by every lpm
// feature that needs at-rest encryption. The key lives in the macOS Keychain
// under service="lpm", account="vault" and is created on first use.
//
// One key instead of per-feature/per-project: all keys would live in the
// same login Keychain anyway, so per-feature isolation is theoretical.
// One entry means one Touch ID / password prompt per session.
package vault

import (
	"crypto/aes"
	"crypto/cipher"
	"errors"
	"fmt"
)

const KeyLen = 32

var ErrEmptyPassphrase = errors.New("vault: passphrase required")

// Callers generate fresh nonces per message.
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
