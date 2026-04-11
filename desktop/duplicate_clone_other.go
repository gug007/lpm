//go:build !darwin

package main

func fastClone(src, dst string) error {
	return errCloneUnsupported
}
