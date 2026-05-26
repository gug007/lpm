// Package vault holds the shared 32-byte AES-256 key used by every lpm
// feature that needs at-rest encryption. One entry (not per-feature) in
// the login Keychain means one Touch ID / password prompt per session.
package vault

import (
	"crypto/aes"
	"crypto/cipher"
	"errors"
	"fmt"
)

const KeyLen = 32

var ErrEmptyPassphrase = errors.New("vault: passphrase required")

// NewAEAD returns AES-256-GCM. Callers must use a fresh nonce per message.
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
