//go:build darwin

package vault

import (
	"crypto/rand"
	"errors"
	"fmt"

	"github.com/keybase/go-keychain"
)

const (
	keychainService = "lpm"
	keychainAccount = "vault"
	keychainLabel   = "lpm vault key"
)

// errSecMissingEntitlement. go-keychain doesn't export a constant for it.
const errMissingEntitlement = keychain.Error(-34018)

// All Keychain ops use SynchronizableAny on read/delete so legacy local-only
// items still match. New items are written as Synchronizable so they ride
// the user's iCloud Keychain to their other Macs / iOS devices.

// Key returns the shared lpm encryption key, creating it on first use.
func Key() ([]byte, error) {
	key, err := fetchKey()
	if err == nil {
		return key, nil
	}
	if !errors.Is(err, keychain.ErrorItemNotFound) {
		return nil, fmt.Errorf("vault: read keychain: %w", err)
	}
	return createKey()
}

// DeleteKey returns nil on missing key so factory-reset / migration paths
// can call it unconditionally. Deletes both local and synced items in one
// pass via SynchronizableAny.
func DeleteKey() error {
	q := baseQuery()
	q.SetSynchronizable(keychain.SynchronizableAny)
	err := keychain.DeleteItem(q)
	if err == nil || errors.Is(err, keychain.ErrorItemNotFound) {
		return nil
	}
	return fmt.Errorf("vault: delete keychain item: %w", err)
}

func baseQuery() keychain.Item {
	q := keychain.NewItem()
	q.SetSecClass(keychain.SecClassGenericPassword)
	q.SetService(keychainService)
	q.SetAccount(keychainAccount)
	return q
}

func fetchKey() ([]byte, error) {
	q := baseQuery()
	q.SetSynchronizable(keychain.SynchronizableAny)
	q.SetMatchLimit(keychain.MatchLimitOne)
	q.SetReturnData(true)
	results, err := keychain.QueryItem(q)
	if err != nil {
		return nil, err
	}
	if len(results) == 0 {
		return nil, keychain.ErrorItemNotFound
	}
	data := results[0].Data
	if len(data) != KeyLen {
		return nil, fmt.Errorf("vault: keychain key has wrong length %d", len(data))
	}
	out := make([]byte, KeyLen)
	copy(out, data)
	return out, nil
}

func createKey() ([]byte, error) {
	key := make([]byte, KeyLen)
	if _, err := rand.Read(key); err != nil {
		return nil, fmt.Errorf("vault: generate key: %w", err)
	}
	if err := writeKey(key); err != nil {
		return nil, err
	}
	out := make([]byte, KeyLen)
	copy(out, key)
	return out, nil
}

func writeKey(key []byte) error {
	item := baseQuery()
	item.SetLabel(keychainLabel)
	item.SetData(key)
	// AccessibleWhenUnlocked (not the *ThisDeviceOnly variant) is required
	// for the item to participate in iCloud Keychain sync.
	item.SetAccessible(keychain.AccessibleWhenUnlocked)
	item.SetSynchronizable(keychain.SynchronizableYes)
	err := keychain.AddItem(item)
	// Unsigned / dev builds lack the keychain-access-groups entitlement
	// required for iCloud Keychain sync, so fall back to a local-only item.
	if errors.Is(err, errMissingEntitlement) {
		item.SetAccessible(keychain.AccessibleWhenUnlockedThisDeviceOnly)
		item.SetSynchronizable(keychain.SynchronizableNo)
		err = keychain.AddItem(item)
	}
	if err == nil || errors.Is(err, keychain.ErrorDuplicateItem) {
		return nil
	}
	return fmt.Errorf("vault: write keychain item: %w", err)
}
