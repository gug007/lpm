//go:build !darwin

package vault

import "errors"

var errUnsupported = errors.New("vault: keychain is only supported on darwin")

func Key() ([]byte, error)       { return nil, errUnsupported }
func DeleteKey() error           { return errUnsupported }
func fetchKey() ([]byte, error)  { return nil, errUnsupported }
func writeKey(key []byte) error  { return errUnsupported }
