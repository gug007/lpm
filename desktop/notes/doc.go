// Package notes stores per-project encrypted chat-style notes and their
// attachments under ~/.lpm/notes/<project>/. Encryption uses the shared
// lpm vault key.
package notes

// Only files with this extension participate in blob GC.
const blobExt = ".enc"
