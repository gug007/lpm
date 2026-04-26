// Package notes stores per-project encrypted chat-style notes and their
// attachments under ~/.lpm/notes/<project>/. Encryption uses the shared
// lpm vault key (see github.com/gug007/lpm/desktop/vault) — the same key
// backs every project and every future vault-backed feature.
package notes

// blobExt is the on-disk suffix for encrypted attachment files. Only files
// matching this extension participate in blob GC.
const blobExt = ".enc"
