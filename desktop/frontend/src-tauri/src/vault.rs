// Shared 32-byte AES-256 vault key — port of desktop/vault/*.go.
//
// One item in the login Keychain (service="lpm", account="vault") holds the key
// every at-rest-encryption feature uses, so the user sees one Touch ID /
// password prompt per session. This module owns the Keychain FFI, AES-256-GCM
// construction, and the passphrase-protected key export/import wire format.
//
// DATA SAFETY: reads/deletes query with kSecAttrSynchronizableAny so an existing
// (possibly iCloud-synced) item is always found — a miss would recreate the key
// and orphan every encrypted note. We never recreate on an access denial.

use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use core_foundation::base::{CFType, TCFType};
use core_foundation::boolean::CFBoolean;
use core_foundation::data::CFData;
use core_foundation::dictionary::CFDictionary;
use core_foundation::string::CFString;
use core_foundation_sys::base::{CFGetTypeID, CFTypeRef, OSStatus};
use core_foundation_sys::string::CFStringRef;
use security_framework_sys::access_control::{
    kSecAttrAccessibleWhenUnlocked, kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
};
use security_framework_sys::base::{errSecDuplicateItem, errSecItemNotFound};
use security_framework_sys::item::{
    kSecAttrAccount, kSecAttrLabel, kSecAttrService, kSecAttrSynchronizable,
    kSecAttrSynchronizableAny, kSecClass, kSecClassGenericPassword, kSecReturnData, kSecValueData,
};
use security_framework_sys::keychain_item::{SecItemAdd, SecItemCopyMatching};
use serde::{Deserialize, Serialize};
use zeroize::Zeroize;

pub const KEY_LEN: usize = 32;

const SERVICE: &str = "lpm";
const ACCOUNT: &str = "vault";
const LABEL: &str = "lpm vault key";

// kSecAttrAccessible (the attribute KEY) isn't re-exported by
// security-framework-sys; declare it directly. Security.framework is already
// linked by that crate, so the symbol resolves.
#[allow(non_upper_case_globals)]
extern "C" {
    static kSecAttrAccessible: CFStringRef;
}

// Apple OSStatus codes not named in security-framework-sys::base.
const ERR_AUTH_FAILED: OSStatus = -25293; // errSecAuthFailed (also in -sys)
const ERR_INTERACTION_NOT_ALLOWED: OSStatus = -25308;
const ERR_NO_ACCESS_FOR_ITEM: OSStatus = -25243;
const ERR_USER_CANCELED: OSStatus = -128;
const ERR_MISSING_ENTITLEMENT: OSStatus = -34018;

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
            VaultError::Denied => write!(
                f,
                "vault: keychain item exists but access was denied (open Keychain Access, delete 'lpm vault key', then retry)"
            ),
            VaultError::WrongPassphrase => write!(f, "vault: wrong passphrase or corrupted export"),
            VaultError::EmptyPassphrase => write!(f, "vault: passphrase required"),
            VaultError::KeyConflict => write!(
                f,
                "vault: local keychain holds a different vault key; delete it before importing"
            ),
            VaultError::NotFound => write!(f, "vault: keychain item not found"),
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

fn is_access_denied(status: OSStatus) -> bool {
    matches!(
        status,
        ERR_AUTH_FAILED | ERR_INTERACTION_NOT_ALLOWED | ERR_NO_ACCESS_FOR_ITEM | ERR_USER_CANCELED
    )
}

// --- Keychain helpers --------------------------------------------------------

/// Wrap a static CFStringRef constant (get rule) as a CFType for dict keys/values.
fn cf_const(s: CFStringRef) -> CFType {
    unsafe { CFString::wrap_under_get_rule(s).as_CFType() }
}

/// Fetch the 32-byte key. Err(NotFound) when absent; Err(Other) carries OSStatus.
fn fetch_key() -> Result<[u8; KEY_LEN], VaultError> {
    let pairs = [
        (cf_const(unsafe { kSecClass }), cf_const(unsafe { kSecClassGenericPassword })),
        (cf_const(unsafe { kSecAttrService }), CFString::new(SERVICE).as_CFType()),
        (cf_const(unsafe { kSecAttrAccount }), CFString::new(ACCOUNT).as_CFType()),
        (
            cf_const(unsafe { kSecAttrSynchronizable }),
            cf_const(unsafe { kSecAttrSynchronizableAny }),
        ),
        (cf_const(unsafe { kSecReturnData }), CFBoolean::true_value().as_CFType()),
    ];
    let query = CFDictionary::from_CFType_pairs(&pairs);

    let mut result: CFTypeRef = std::ptr::null();
    let status = unsafe { SecItemCopyMatching(query.as_concrete_TypeRef(), &mut result) };
    if status != 0 {
        if status == errSecItemNotFound {
            return Err(VaultError::NotFound);
        }
        if is_access_denied(status) {
            return Err(VaultError::Denied);
        }
        return Err(VaultError::Other(format!("vault: read keychain: status {status}")));
    }
    if result.is_null() {
        return Err(VaultError::NotFound);
    }
    // With kSecReturnData and the default match limit (one), the result is CFData.
    if unsafe { CFGetTypeID(result) } != CFData::type_id() {
        unsafe { core_foundation_sys::base::CFRelease(result) };
        return Err(VaultError::Other("vault: keychain returned non-data".into()));
    }
    let data = unsafe { CFData::wrap_under_create_rule(result as core_foundation_sys::data::CFDataRef) };
    let bytes = data.bytes();
    if bytes.len() != KEY_LEN {
        return Err(VaultError::Other(format!(
            "vault: keychain key has wrong length {}",
            bytes.len()
        )));
    }
    let mut key = [0u8; KEY_LEN];
    key.copy_from_slice(bytes);
    Ok(key)
}

/// Add the key item. Returns the raw OSStatus so callers can branch on it.
fn add_item(key: &[u8], accessible: CFStringRef, synchronizable: bool) -> OSStatus {
    let sync = if synchronizable {
        CFBoolean::true_value()
    } else {
        CFBoolean::false_value()
    };
    let pairs = [
        (cf_const(unsafe { kSecClass }), cf_const(unsafe { kSecClassGenericPassword })),
        (cf_const(unsafe { kSecAttrService }), CFString::new(SERVICE).as_CFType()),
        (cf_const(unsafe { kSecAttrAccount }), CFString::new(ACCOUNT).as_CFType()),
        (cf_const(unsafe { kSecAttrLabel }), CFString::new(LABEL).as_CFType()),
        (cf_const(unsafe { kSecValueData }), CFData::from_buffer(key).as_CFType()),
        (cf_const(unsafe { kSecAttrAccessible }), cf_const(accessible)),
        (cf_const(unsafe { kSecAttrSynchronizable }), sync.as_CFType()),
    ];
    let attrs = CFDictionary::from_CFType_pairs(&pairs);
    let mut result: CFTypeRef = std::ptr::null();
    let status = unsafe { SecItemAdd(attrs.as_concrete_TypeRef(), &mut result) };
    if !result.is_null() {
        unsafe { core_foundation_sys::base::CFRelease(result) };
    }
    status
}

/// Write a fresh key, mirroring writeKey: WhenUnlocked+Sync, falling back to
/// ThisDeviceOnly+NoSync when the iCloud-sync entitlement is missing. A
/// duplicate means an existing item we can't see — surface it, never overwrite.
fn write_key(key: &[u8]) -> Result<(), VaultError> {
    let mut status = add_item(key, unsafe { kSecAttrAccessibleWhenUnlocked }, true);
    if status == ERR_MISSING_ENTITLEMENT {
        status = add_item(key, unsafe { kSecAttrAccessibleWhenUnlockedThisDeviceOnly }, false);
    }
    match status {
        0 => Ok(()),
        s if s == errSecDuplicateItem => Err(VaultError::Denied),
        s => Err(VaultError::Other(format!("vault: write keychain item: status {s}"))),
    }
}

/// The shared key, created on first use. Get-or-create, mirroring vault.Key().
pub fn key() -> Result<[u8; KEY_LEN], VaultError> {
    match fetch_key() {
        Ok(k) => Ok(k),
        Err(VaultError::NotFound) => create_key(),
        Err(e) => Err(e),
    }
}

fn create_key() -> Result<[u8; KEY_LEN], VaultError> {
    let mut key = [0u8; KEY_LEN];
    getrandom::fill(&mut key)
        .map_err(|e| VaultError::Other(format!("vault: generate key: {e}")))?;
    write_key(&key)?;
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

fn argon2_kek(passphrase: &str, salt: &[u8], m: u32, t: u32, p: u32, l: u32) -> Result<[u8; KEY_LEN], VaultError> {
    if l as usize != KEY_LEN {
        return Err(VaultError::Other(format!("vault: unsupported key length {l}")));
    }
    let params = argon2::Params::new(m, t, p, Some(KEY_LEN))
        .map_err(|e| VaultError::Other(format!("vault: argon2 params: {e}")))?;
    let a2 = argon2::Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params);
    let mut kek = [0u8; KEY_LEN];
    a2.hash_password_into(passphrase.as_bytes(), salt, &mut kek)
        .map_err(|e| VaultError::Other(format!("vault: argon2: {e}")))?;
    Ok(kek)
}

fn wrap_key(passphrase: &str, key: &[u8; KEY_LEN]) -> Result<String, VaultError> {
    let mut salt = [0u8; SALT_LEN];
    getrandom::fill(&mut salt)
        .map_err(|e| VaultError::Other(format!("vault: rand salt: {e}")))?;
    let mut kek = argon2_kek(passphrase, &salt, ARGON2_MEMORY, ARGON2_TIME, ARGON2_PAR, KEY_LEN as u32)?;

    let cipher = Aes256Gcm::new_from_slice(&kek)
        .map_err(|_| VaultError::Other("vault: new cipher".into()))?;
    kek.zeroize();
    let mut nonce = [0u8; 12];
    getrandom::fill(&mut nonce)
        .map_err(|e| VaultError::Other(format!("vault: rand nonce: {e}")))?;
    let ciphertext = cipher
        .encrypt(
            &Nonce::try_from(nonce.as_slice()).expect("nonce is 12 bytes"),
            Payload { msg: key, aad: AAD_PREFIX },
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
    serde_json::to_string_pretty(&out).map_err(|e| VaultError::Other(format!("vault: marshal export: {e}")))
}

fn unwrap_key(passphrase: &str, data: &[u8]) -> Result<[u8; KEY_LEN], VaultError> {
    let ek: ExportedKey = serde_json::from_slice(data)
        .map_err(|e| VaultError::Other(format!("vault: parse export: {e}")))?;
    if ek.v != EXPORT_VERSION {
        return Err(VaultError::Other(format!("vault: unsupported export version {}", ek.v)));
    }
    if ek.kind != EXPORT_KIND {
        return Err(VaultError::Other(format!("vault: unexpected export kind {:?}", ek.kind)));
    }
    if ek.kdf.alg != KDF_ALGO {
        return Err(VaultError::Other(format!("vault: unsupported kdf {:?}", ek.kdf.alg)));
    }
    if ek.enc.alg != ENC_ALGO {
        return Err(VaultError::Other(format!("vault: unsupported cipher {:?}", ek.enc.alg)));
    }
    if ek.kdf.l as usize != KEY_LEN {
        return Err(VaultError::Other(format!("vault: unsupported key length {}", ek.kdf.l)));
    }
    let salt = B64.decode(ek.kdf.salt.as_bytes()).map_err(|e| VaultError::Other(format!("vault: bad salt: {e}")))?;
    let nonce = B64.decode(ek.enc.nonce.as_bytes()).map_err(|e| VaultError::Other(format!("vault: bad nonce: {e}")))?;
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
            Payload { msg: &ciphertext, aad: AAD_PREFIX },
        )
        .map_err(|_| VaultError::WrongPassphrase)?;
    if plain.len() != KEY_LEN {
        return Err(VaultError::Other(format!("vault: decrypted key has wrong length {}", plain.len())));
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
    match fetch_key() {
        Ok(existing) if existing == key => Ok(()),
        Ok(_) => Err(VaultError::KeyConflict),
        Err(_) => write_key(&key),
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
        let kek = argon2_kek("password", b"0123456789abcdef", ARGON2_MEMORY, ARGON2_TIME, ARGON2_PAR, 32).unwrap();
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
