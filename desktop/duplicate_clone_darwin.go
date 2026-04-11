package main

import (
	"errors"

	"golang.org/x/sys/unix"
)

// fastClone performs an APFS copy-on-write clone of src to dst via
// clonefile(2). When src is a directory, the kernel clones the entire
// hierarchy in one syscall — effectively free regardless of tree size,
// since data blocks are shared until one side writes. Returns
// errCloneUnsupported for the two conditions the caller can recover from:
// non-APFS filesystems (ENOTSUP) and cross-device copies (EXDEV). Any
// other error propagates.
func fastClone(src, dst string) error {
	if err := unix.Clonefile(src, dst, 0); err != nil {
		if errors.Is(err, unix.ENOTSUP) || errors.Is(err, unix.EXDEV) {
			return errCloneUnsupported
		}
		return err
	}
	return nil
}
