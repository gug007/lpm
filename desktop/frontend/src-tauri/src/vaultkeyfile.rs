// Non-macOS vault key storage: a 0600 file at ~/.lpm/vault-key. Backend for
// vault.rs wherever there is no login Keychain (the headless Linux host);
// vaultkeychain.rs is the macOS counterpart.
//
// SECURITY POSTURE: on a headless host there is no OS keystore to hold the key —
// no unlocked login keyring, no user to prompt. The key is therefore protected by
// file permissions alone (0600, owner-only), which is strictly weaker than the
// macOS Keychain. Setting LPM_VAULT_PASSPHRASE upgrades the file to the same
// Argon2id + AES-256-GCM envelope `export_key` produces, so the at-rest bytes are
// useless without the passphrase; the trade is that the passphrase must reach the
// process (systemd credential, EnvironmentFile) on every start.
//
// DATA SAFETY: write_key never overwrites an existing file — mirroring the
// Keychain backend's duplicate-item refusal, so a partial read can never orphan
// every encrypted note by minting a second key over the first.

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::io::ErrorKind;
use std::path::PathBuf;
use zeroize::Zeroize;

use crate::vault::{unwrap_key, wrap_key, VaultError, KEY_LEN};
use crate::{config, fsatomic};

/// Set to wrap the stored key under a passphrase instead of storing it bare.
const PASSPHRASE_ENV: &str = "LPM_VAULT_PASSPHRASE";

const LOCAL_VERSION: u32 = 1;
/// Distinct from export.go's "lpm-vault-key" so the two shapes never alias: a
/// bare key file must not be mistaken for a passphrase-wrapped export.
const LOCAL_KIND: &str = "lpm-vault-key-local";
const WRAPPED_KIND: &str = "lpm-vault-key";

#[derive(Serialize, Deserialize)]
struct LocalKey {
    v: u32,
    kind: String,
    key: String,
}

pub fn key_path() -> PathBuf {
    config::lpm_dir().join("vault-key")
}

fn passphrase() -> Option<String> {
    std::env::var(PASSPHRASE_ENV).ok().filter(|s| !s.is_empty())
}

/// Serialize the key for disk: passphrase-wrapped when one is configured, else a
/// bare base64 envelope.
fn encode_blob(key: &[u8; KEY_LEN], passphrase: Option<&str>) -> Result<Vec<u8>, VaultError> {
    match passphrase {
        Some(p) => wrap_key(p, key).map(String::into_bytes),
        None => {
            let out = LocalKey {
                v: LOCAL_VERSION,
                kind: LOCAL_KIND.into(),
                key: B64.encode(key),
            };
            serde_json::to_vec_pretty(&out)
                .map_err(|e| VaultError::Other(format!("vault: marshal key file: {e}")))
        }
    }
}

/// Parse a key file, dispatching on `kind` so a passphrase added or removed
/// between runs produces a clear error rather than a corrupt-looking key.
fn decode_blob(bytes: &[u8], passphrase: Option<&str>) -> Result<[u8; KEY_LEN], VaultError> {
    let probe: serde_json::Value = serde_json::from_slice(bytes)
        .map_err(|e| VaultError::Other(format!("vault: parse key file: {e}")))?;
    let kind = probe.get("kind").and_then(|k| k.as_str()).unwrap_or("");
    match kind {
        WRAPPED_KIND => {
            let Some(p) = passphrase else {
                return Err(VaultError::Other(format!(
                    "vault: key file is passphrase-protected — set {PASSPHRASE_ENV}"
                )));
            };
            unwrap_key(p, bytes)
        }
        LOCAL_KIND => {
            let parsed: LocalKey = serde_json::from_slice(bytes)
                .map_err(|e| VaultError::Other(format!("vault: parse key file: {e}")))?;
            if parsed.v != LOCAL_VERSION {
                return Err(VaultError::Other(format!(
                    "vault: unsupported key file version {}",
                    parsed.v
                )));
            }
            let mut raw = B64
                .decode(parsed.key.as_bytes())
                .map_err(|e| VaultError::Other(format!("vault: bad key file encoding: {e}")))?;
            if raw.len() != KEY_LEN {
                raw.zeroize();
                return Err(VaultError::Other(
                    "vault: key file holds a wrong-length key".into(),
                ));
            }
            let mut key = [0u8; KEY_LEN];
            key.copy_from_slice(&raw);
            raw.zeroize();
            Ok(key)
        }
        other => Err(VaultError::Other(format!(
            "vault: unexpected key file kind {other:?}"
        ))),
    }
}

/// Fetch the 32-byte key. Err(NotFound) when the file is absent.
pub fn fetch_key() -> Result<[u8; KEY_LEN], VaultError> {
    let bytes = match std::fs::read(key_path()) {
        Ok(b) => b,
        Err(e) if e.kind() == ErrorKind::NotFound => return Err(VaultError::NotFound),
        Err(e) if e.kind() == ErrorKind::PermissionDenied => return Err(VaultError::Denied),
        Err(e) => return Err(VaultError::Other(format!("vault: read key file: {e}"))),
    };
    decode_blob(&bytes, passphrase().as_deref())
}

/// Write a fresh key. An existing file is never overwritten — that would orphan
/// everything encrypted under the key already on disk.
pub fn write_key(key: &[u8]) -> Result<(), VaultError> {
    let path = key_path();
    if path.exists() {
        return Err(VaultError::Denied);
    }
    let key: &[u8; KEY_LEN] = key
        .try_into()
        .map_err(|_| VaultError::Other("vault: key must be 32 bytes".into()))?;
    let mut blob = encode_blob(key, passphrase().as_deref())?;

    let dir = config::lpm_dir();
    if let Err(e) = std::fs::create_dir_all(&dir) {
        blob.zeroize();
        return Err(VaultError::Other(format!("vault: create {dir:?}: {e}")));
    }
    let result = fsatomic::write(&path, &blob, fsatomic::Mode::Exact(0o600));
    blob.zeroize();
    result.map_err(|e| VaultError::Other(format!("vault: write key file: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bare_roundtrip() {
        let key = [7u8; KEY_LEN];
        let blob = encode_blob(&key, None).unwrap();
        let text = String::from_utf8(blob.clone()).unwrap();
        assert!(text.contains(LOCAL_KIND));
        assert_eq!(decode_blob(&blob, None).unwrap(), key);
    }

    #[test]
    fn passphrase_roundtrip() {
        let key = [3u8; KEY_LEN];
        let blob = encode_blob(&key, Some("correct horse battery staple")).unwrap();
        assert_eq!(
            decode_blob(&blob, Some("correct horse battery staple")).unwrap(),
            key
        );
        assert!(matches!(
            decode_blob(&blob, Some("wrong pass")).unwrap_err(),
            VaultError::WrongPassphrase
        ));
    }

    // Losing the passphrase between runs must say so, not look like corruption.
    #[test]
    fn wrapped_without_passphrase_is_explicit() {
        let blob = encode_blob(&[1u8; KEY_LEN], Some("hunter2pass")).unwrap();
        let err = decode_blob(&blob, None).unwrap_err().to_string();
        assert!(err.contains(PASSPHRASE_ENV), "{err}");
    }

    #[test]
    fn rejects_unknown_kind() {
        let blob = br#"{"v":1,"kind":"something-else","key":"AA=="}"#;
        assert!(decode_blob(blob, None).is_err());
    }

    #[test]
    fn rejects_wrong_length_key() {
        let blob = format!(
            r#"{{"v":1,"kind":"{LOCAL_KIND}","key":"{}"}}"#,
            B64.encode([1u8; 16])
        );
        assert!(decode_blob(blob.as_bytes(), None).is_err());
    }
}
