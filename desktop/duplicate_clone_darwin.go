package main

import (
	"errors"

	"golang.org/x/sys/unix"
)

// fastClone performs an APFS copy-on-write clone via clonefile(2). The kernel
// clones the entire hierarchy in one syscall — effectively free regardless of
// tree size, since data blocks are shared until one side writes. Returns
// errCloneUnsupported for ENOTSUP (non-APFS) and EXDEV (cross-device).
func fastClone(src, dst string) error {
	if err := unix.Clonefile(src, dst, 0); err != nil {
		if errors.Is(err, unix.ENOTSUP) || errors.Is(err, unix.EXDEV) {
			return errCloneUnsupported
		}
		return err
	}
	return nil
}
