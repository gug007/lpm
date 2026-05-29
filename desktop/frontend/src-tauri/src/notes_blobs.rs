// Content-addressed, AES-256-GCM encrypted blob store — port of notes/blobs.go.
// On-disk file = [12B nonce][AES-256-GCM ciphertext || 16B tag]; filename is the
// lowercase-hex sha256 of the PLAINTEXT (so identical uploads dedup); AAD is the
// ASCII of that hex stem. This layout must stay byte-identical to read the
// existing ~/.lpm/notes/<project>/blobs/*.enc files.
use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::io::Write;
use std::path::PathBuf;

pub const MAX_BLOB_SIZE: usize = 100 * 1024 * 1024;
const BLOB_EXT: &str = ".enc";
const NONCE_LEN: usize = 12;
const TAG_LEN: usize = 16;

pub struct BlobStore {
    dir: PathBuf,
    cipher: Aes256Gcm,
}

impl BlobStore {
    pub fn new(dir: PathBuf, key: &[u8; 32]) -> BlobStore {
        let cipher = Aes256Gcm::new_from_slice(key).expect("aes-256-gcm key is 32 bytes");
        BlobStore { dir, cipher }
    }

    /// Returns (hash, size). Dedups: an existing file at the hash is left as-is.
    pub fn put(&self, data: &[u8]) -> Result<(String, i64), String> {
        if data.len() > MAX_BLOB_SIZE {
            return Err("notes: attachment exceeds max size".into());
        }
        let hash = hex::encode(Sha256::digest(data));
        let size = data.len() as i64;
        let path = self.path(&hash);
        if path.exists() {
            return Ok((hash, size));
        }
        std::fs::create_dir_all(&self.dir).map_err(|e| format!("notes: mkdir blobs: {e}"))?;

        let mut nonce = [0u8; NONCE_LEN];
        getrandom::getrandom(&mut nonce).map_err(|e| format!("notes: rand nonce: {e}"))?;
        let sealed = self
            .cipher
            .encrypt(Nonce::from_slice(&nonce), Payload { msg: data, aad: hash.as_bytes() })
            .map_err(|_| "notes: seal blob".to_string())?;

        // Temp-then-rename so a crash mid-write can't leave a half-blob at the
        // canonical name. tempfile creates the temp at mode 0600 (matches Go).
        let mut tmp = tempfile::Builder::new()
            .prefix(".blob-")
            .suffix(".tmp")
            .tempfile_in(&self.dir)
            .map_err(|e| format!("notes: temp file: {e}"))?;
        tmp.write_all(&nonce).map_err(|e| format!("notes: write nonce: {e}"))?;
        tmp.write_all(&sealed).map_err(|e| format!("notes: write cipher: {e}"))?;
        tmp.flush().map_err(|e| format!("notes: flush tmp: {e}"))?;
        tmp.persist(&path).map_err(|e| format!("notes: rename tmp: {e}"))?;
        Ok((hash, size))
    }

    /// Decrypts and returns the plaintext. Err("notes: blob not found") when absent.
    pub fn read(&self, hash: &str) -> Result<Vec<u8>, String> {
        if !valid_hash(hash) {
            return Err(format!("notes: invalid hash {hash:?}"));
        }
        let raw = match std::fs::read(self.path(hash)) {
            Ok(r) => r,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                return Err("notes: blob not found".into())
            }
            Err(e) => return Err(e.to_string()),
        };
        if raw.len() < NONCE_LEN + TAG_LEN {
            return Err(format!("notes: blob {hash} truncated"));
        }
        let (nonce, sealed) = raw.split_at(NONCE_LEN);
        self.cipher
            .decrypt(Nonce::from_slice(nonce), Payload { msg: sealed, aad: hash.as_bytes() })
            .map_err(|_| format!("notes: decrypt {hash}: authentication failed"))
    }

    /// Removes a blob; a missing file is success (so GC can call unconditionally).
    pub fn delete(&self, hash: &str) -> Result<(), String> {
        if !valid_hash(hash) {
            return Err(format!("notes: invalid hash {hash:?}"));
        }
        match std::fs::remove_file(self.path(hash)) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }

    /// Removes every `.enc` blob whose hash is not in `referenced`. Missing dir
    /// is not an error. Returns the count removed.
    pub fn gc(&self, referenced: &HashSet<String>) -> Result<usize, String> {
        let entries = match std::fs::read_dir(&self.dir) {
            Ok(e) => e,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(0),
            Err(e) => return Err(e.to_string()),
        };
        let mut removed = 0;
        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                continue;
            }
            let name = entry.file_name();
            let name = name.to_string_lossy();
            let Some(hash) = name.strip_suffix(BLOB_EXT) else { continue };
            if !valid_hash(hash) || referenced.contains(hash) {
                continue;
            }
            std::fs::remove_file(entry.path()).map_err(|e| e.to_string())?;
            removed += 1;
        }
        Ok(removed)
    }

    fn path(&self, hash: &str) -> PathBuf {
        self.dir.join(format!("{hash}{BLOB_EXT}"))
    }
}

/// Guards against path traversal: exactly 64 lowercase hex chars.
fn valid_hash(h: &str) -> bool {
    h.len() == 64 && h.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn k() -> [u8; 32] {
        [3u8; 32]
    }

    #[test]
    fn put_read_roundtrip_and_dedup() {
        let dir = tempfile::tempdir().unwrap();
        let bs = BlobStore::new(dir.path().to_path_buf(), &k());
        let (h1, sz) = bs.put(b"some bytes here").unwrap();
        assert_eq!(sz, 15);
        assert_eq!(bs.read(&h1).unwrap(), b"some bytes here");
        // dedup: identical content yields the same hash, second put is a no-op
        let (h2, _) = bs.put(b"some bytes here").unwrap();
        assert_eq!(h1, h2);
    }

    #[test]
    fn tamper_is_detected() {
        let dir = tempfile::tempdir().unwrap();
        let bs = BlobStore::new(dir.path().to_path_buf(), &k());
        let (h, _) = bs.put(b"secret").unwrap();
        let path = dir.path().join(format!("{h}.enc"));
        let mut bytes = std::fs::read(&path).unwrap();
        let last = bytes.len() - 1;
        bytes[last] ^= 0xff; // corrupt the GCM tag
        std::fs::write(&path, &bytes).unwrap();
        assert!(bs.read(&h).is_err(), "tag mismatch must fail authentication");
    }

    #[test]
    fn invalid_hash_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let bs = BlobStore::new(dir.path().to_path_buf(), &k());
        assert!(bs.read("../etc/passwd").is_err());
        assert!(bs.read("XYZ").is_err());
        assert!(bs.read(&"0".repeat(64)).is_err()); // valid shape, missing file
    }

    #[test]
    fn gc_removes_unreferenced() {
        let dir = tempfile::tempdir().unwrap();
        let bs = BlobStore::new(dir.path().to_path_buf(), &k());
        let (h1, _) = bs.put(b"keep").unwrap();
        let (h2, _) = bs.put(b"drop").unwrap();
        let mut keep = HashSet::new();
        keep.insert(h1.clone());
        assert_eq!(bs.gc(&keep).unwrap(), 1);
        assert!(bs.read(&h1).is_ok());
        assert!(bs.read(&h2).is_err());
    }

    #[test]
    fn valid_hash_rules() {
        assert!(valid_hash(&"a".repeat(64)));
        assert!(valid_hash(&"0123456789abcdef".repeat(4)));
        assert!(!valid_hash(&"A".repeat(64)), "uppercase rejected");
        assert!(!valid_hash(&"a".repeat(63)), "wrong length");
        assert!(!valid_hash(&"g".repeat(64)), "non-hex char");
    }
}
