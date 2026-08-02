// Shared 32-byte AES-256 vault key — port of desktop/vault/*.go.
//
// One key backs every at-rest-encryption feature. Where it lives is platform-
// specific: the login Keychain on macOS (vaultkeychain.rs), a 0600 file on a
// headless host with no keystore (vaultkeyfile.rs). This module owns the portable
// half — get-or-create, AES-256-GCM construction, and the passphrase-protected
// export/import wire format both backends share.

use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde::{Deserialize, Serialize};
use zeroize::Zeroize;

#[cfg(target_os = "macos")]
use crate::vaultkeychain as store;
#[cfg(not(target_os = "macos"))]
use crate::vaultkeyfile as store;

pub const KEY_LEN: usize = 32;

// --- export wire format constants (must match vault/export.go byte-for-byte) --
const EXPORT_VERSION: u32 = 1;
const EXPORT_KIND: &str = "lpm-vault-key";
const ARGON2_MEMORY: u32 = 64 * 1024; // KiB
const ARGON2_TIME: u32 = 3;
const ARGON2_PAR: u32 = 4;
const SALT_LEN: usize = 16;
const MIN_PASSPHRASE_LEN: usize = 8;
const KDF_ALGO: &str = "argon2id";
const ENC_ALGO: &str = "aes-256-gcm";
const AAD_PREFIX: &[u8] = b"lpm-vault";

#[derive(Debug)]
pub enum VaultError {
    /// Item exists but the OS denied access (bundle-id / signing-identity change).
    Denied,
    WrongPassphrase,
    EmptyPassphrase,
    KeyConflict,
    NotFound,
    Other(String),
}

impl std::fmt::Display for VaultError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            #[cfg(target_os = "macos")]
            VaultError::Denied => write!(
                f,
                "vault: keychain item exists but access was denied (open Keychain Access, delete 'lpm vault key', then retry)"
            ),
            #[cfg(not(target_os = "macos"))]
            VaultError::Denied => write!(
                f,
                "vault: a vault key already exists but could not be read (check ownership and permissions of ~/.lpm/vault-key)"
            ),
            VaultError::WrongPassphrase => write!(f, "vault: wrong passphrase or corrupted export"),
            VaultError::EmptyPassphrase => write!(f, "vault: passphrase required"),
            #[cfg(target_os = "macos")]
            VaultError::KeyConflict => write!(
                f,
                "vault: local keychain holds a different vault key; delete it before importing"
            ),
            #[cfg(not(target_os = "macos"))]
            VaultError::KeyConflict => write!(
                f,
                "vault: this machine holds a different vault key; remove ~/.lpm/vault-key before importing"
            ),
            #[cfg(target_os = "macos")]
            VaultError::NotFound => write!(f, "vault: keychain item not found"),
            #[cfg(not(target_os = "macos"))]
            VaultError::NotFound => write!(f, "vault: no vault key stored on this machine"),
            VaultError::Other(s) => write!(f, "{s}"),
        }
    }
}

impl std::error::Error for VaultError {}

impl From<VaultError> for String {
    fn from(e: VaultError) -> String {
        e.to_string()
    }
}

/// The shared key, created on first use. Get-or-create, mirroring vault.Key().
pub fn key() -> Result<[u8; KEY_LEN], VaultError> {
    match store::fetch_key() {
        Ok(k) => Ok(k),
        Err(VaultError::NotFound) => create_key(),
        Err(e) => Err(e),
    }
}

fn create_key() -> Result<[u8; KEY_LEN], VaultError> {
    let mut key = [0u8; KEY_LEN];
    getrandom::fill(&mut key)
        .map_err(|e| VaultError::Other(format!("vault: generate key: {e}")))?;
    store::write_key(&key)?;
    Ok(key)
}

// --- AEAD + export/import ----------------------------------------------------

#[derive(Serialize, Deserialize)]
struct ExportedKey {
    v: u32,
    kind: String,
    kdf: Kdf,
    enc: Enc,
}

#[derive(Serialize, Deserialize)]
struct Kdf {
    alg: String,
    salt: String,
    m: u32,
    t: u32,
    p: u32,
    l: u32,
}

#[derive(Serialize, Deserialize)]
struct Enc {
    alg: String,
    nonce: String,
    ciphertext: String,
}

fn argon2_kek(
    passphrase: &str,
    salt: &[u8],
    m: u32,
    t: u32,
    p: u32,
    l: u32,
) -> Result<[u8; KEY_LEN], VaultError> {
    if l as usize != KEY_LEN {
        return Err(VaultError::Other(format!(
            "vault: unsupported key length {l}"
        )));
    }
    let params = argon2::Params::new(m, t, p, Some(KEY_LEN))
        .map_err(|e| VaultError::Other(format!("vault: argon2 params: {e}")))?;
    let a2 = argon2::Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params);
    let mut kek = [0u8; KEY_LEN];
    a2.hash_password_into(passphrase.as_bytes(), salt, &mut kek)
        .map_err(|e| VaultError::Other(format!("vault: argon2: {e}")))?;
    Ok(kek)
}

pub(crate) fn wrap_key(passphrase: &str, key: &[u8; KEY_LEN]) -> Result<String, VaultError> {
    let mut salt = [0u8; SALT_LEN];
    getrandom::fill(&mut salt).map_err(|e| VaultError::Other(format!("vault: rand salt: {e}")))?;
    let mut kek = argon2_kek(
        passphrase,
        &salt,
        ARGON2_MEMORY,
        ARGON2_TIME,
        ARGON2_PAR,
        KEY_LEN as u32,
    )?;

    let cipher = Aes256Gcm::new_from_slice(&kek)
        .map_err(|_| VaultError::Other("vault: new cipher".into()))?;
    kek.zeroize();
    let mut nonce = [0u8; 12];
    getrandom::fill(&mut nonce)
        .map_err(|e| VaultError::Other(format!("vault: rand nonce: {e}")))?;
    let ciphertext = cipher
        .encrypt(
            &Nonce::try_from(nonce.as_slice()).expect("nonce is 12 bytes"),
            Payload {
                msg: key,
                aad: AAD_PREFIX,
            },
        )
        .map_err(|_| VaultError::Other("vault: seal export".into()))?;

    let out = ExportedKey {
        v: EXPORT_VERSION,
        kind: EXPORT_KIND.into(),
        kdf: Kdf {
            alg: KDF_ALGO.into(),
            salt: B64.encode(salt),
            m: ARGON2_MEMORY,
            t: ARGON2_TIME,
            p: ARGON2_PAR,
            l: KEY_LEN as u32,
        },
        enc: Enc {
            alg: ENC_ALGO.into(),
            nonce: B64.encode(nonce),
            ciphertext: B64.encode(ciphertext),
        },
    };
    serde_json::to_string_pretty(&out)
        .map_err(|e| VaultError::Other(format!("vault: marshal export: {e}")))
}

pub(crate) fn unwrap_key(passphrase: &str, data: &[u8]) -> Result<[u8; KEY_LEN], VaultError> {
    let ek: ExportedKey = serde_json::from_slice(data)
        .map_err(|e| VaultError::Other(format!("vault: parse export: {e}")))?;
    if ek.v != EXPORT_VERSION {
        return Err(VaultError::Other(format!(
            "vault: unsupported export version {}",
            ek.v
        )));
    }
    if ek.kind != EXPORT_KIND {
        return Err(VaultError::Other(format!(
            "vault: unexpected export kind {:?}",
            ek.kind
        )));
    }
    if ek.kdf.alg != KDF_ALGO {
        return Err(VaultError::Other(format!(
            "vault: unsupported kdf {:?}",
            ek.kdf.alg
        )));
    }
    if ek.enc.alg != ENC_ALGO {
        return Err(VaultError::Other(format!(
            "vault: unsupported cipher {:?}",
            ek.enc.alg
        )));
    }
    if ek.kdf.l as usize != KEY_LEN {
        return Err(VaultError::Other(format!(
            "vault: unsupported key length {}",
            ek.kdf.l
        )));
    }
    let salt = B64
        .decode(ek.kdf.salt.as_bytes())
        .map_err(|e| VaultError::Other(format!("vault: bad salt: {e}")))?;
    let nonce = B64
        .decode(ek.enc.nonce.as_bytes())
        .map_err(|e| VaultError::Other(format!("vault: bad nonce: {e}")))?;
    let ciphertext = B64
        .decode(ek.enc.ciphertext.as_bytes())
        .map_err(|e| VaultError::Other(format!("vault: bad ciphertext: {e}")))?;

    let mut kek = argon2_kek(passphrase, &salt, ek.kdf.m, ek.kdf.t, ek.kdf.p, ek.kdf.l)?;
    let cipher = Aes256Gcm::new_from_slice(&kek)
        .map_err(|_| VaultError::Other("vault: new cipher".into()))?;
    kek.zeroize();
    let plain = cipher
        .decrypt(
            &Nonce::try_from(nonce.as_slice()).expect("nonce is 12 bytes"),
            Payload {
                msg: &ciphertext,
                aad: AAD_PREFIX,
            },
        )
        .map_err(|_| VaultError::WrongPassphrase)?;
    if plain.len() != KEY_LEN {
        return Err(VaultError::Other(format!(
            "vault: decrypted key has wrong length {}",
            plain.len()
        )));
    }
    let mut key = [0u8; KEY_LEN];
    key.copy_from_slice(&plain);
    Ok(key)
}

/// Export the vault key wrapped under a passphrase (Argon2id + AES-256-GCM).
pub fn export_key(passphrase: &str) -> Result<String, VaultError> {
    if passphrase.len() < MIN_PASSPHRASE_LEN {
        return Err(VaultError::Other(format!(
            "vault: passphrase must be at least {MIN_PASSPHRASE_LEN} characters"
        )));
    }
    let key = key()?;
    wrap_key(passphrase, &key)
}

/// Import a wrapped key. No-op when the keychain already holds the same key;
/// ErrKeyConflict (KeyConflict) when it holds a different one.
pub fn import_key(passphrase: &str, data: &[u8]) -> Result<(), VaultError> {
    if passphrase.is_empty() {
        return Err(VaultError::EmptyPassphrase);
    }
    let key = unwrap_key(passphrase, data)?;
    match store::fetch_key() {
        Ok(existing) if existing == key => Ok(()),
        Ok(_) => Err(VaultError::KeyConflict),
        Err(_) => store::write_key(&key),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wrap_unwrap_roundtrip() {
        let key = [9u8; KEY_LEN];
        let json = wrap_key("correct horse battery staple", &key).unwrap();
        assert!(json.contains("\"kind\": \"lpm-vault-key\""));
        assert!(json.contains("\"alg\": \"argon2id\""));
        assert!(json.contains("\"m\": 65536"));
        let back = unwrap_key("correct horse battery staple", json.as_bytes()).unwrap();
        assert_eq!(back, key);
        assert!(matches!(
            unwrap_key("wrong pass", json.as_bytes()).unwrap_err(),
            VaultError::WrongPassphrase
        ));
    }

    // Argon2id KEK must equal Go's golang.org/x/crypto/argon2.IDKey for the same
    // inputs — the highest interop risk (version/param/unit mismatch).
    // Golden: argon2.IDKey("password","0123456789abcdef",t=3,m=65536,p=4,len=32).
    #[test]
    fn argon2_matches_go_golden() {
        const GOLDEN: &str = "b8a64b68dea6b88ca8c8862be706aac37cbecda0db7bd68b48f8fa2e7feb6f3e";
        let kek = argon2_kek(
            "password",
            b"0123456789abcdef",
            ARGON2_MEMORY,
            ARGON2_TIME,
            ARGON2_PAR,
            32,
        )
        .unwrap();
        assert_eq!(hex::encode(kek), GOLDEN);
    }

    // A full export blob produced by Go's vault.wrapKey (passphrase "hunter2pass",
    // key = 32×0x42) must decrypt here — proves the whole wire format interops.
    #[test]
    fn decrypts_go_export() {
        const EXPORT_GOLDEN_B64: &str = "ewogICJ2IjogMSwKICAia2luZCI6ICJscG0tdmF1bHQta2V5IiwKICAia2RmIjogewogICAgImFsZyI6ICJhcmdvbjJpZCIsCiAgICAic2FsdCI6ICJsVTFmcUFWdjFRV0V0ZU93a1M2cEJ3PT0iLAogICAgIm0iOiA2NTUzNiwKICAgICJ0IjogMywKICAgICJwIjogNCwKICAgICJsIjogMzIKICB9LAogICJlbmMiOiB7CiAgICAiYWxnIjogImFlcy0yNTYtZ2NtIiwKICAgICJub25jZSI6ICJtRk1Hb3BxSmZ2czBZU2l2IiwKICAgICJjaXBoZXJ0ZXh0IjogImJzYVdNbGR2R25JL3ZheVhLRWNzTURuRUZTS29EZ2xKM28wUW92Rm84V3pmbEVGeUk5UFFLL1cxWW5vQ3FLNWwiCiAgfQp9";
        let json = B64.decode(EXPORT_GOLDEN_B64).unwrap();
        let key = unwrap_key("hunter2pass", &json).unwrap();
        assert_eq!(key, [0x42u8; KEY_LEN]);
        assert!(matches!(
            unwrap_key("bad", &json).unwrap_err(),
            VaultError::WrongPassphrase
        ));
    }
}
