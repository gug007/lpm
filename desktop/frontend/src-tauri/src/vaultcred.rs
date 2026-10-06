// Windows vault key storage: one generic credential in Credential Manager
// (`lpm/vault`). Backend for vault.rs on this platform; vaultkeychain.rs (macOS)
// and vaultkeyfile.rs (Linux) are the counterparts.
//
// DATA SAFETY: CredWriteW silently replaces an existing credential, so write_key
// checks first and refuses when one is present, matching the Keychain backend's
// duplicate-item refusal: a key minted over the first would orphan every note
// encrypted under it.

use zeroize::Zeroize;

use crate::vault::{VaultError, KEY_LEN};
use crate::wincred;

const ACCOUNT: &str = "vault";
const LABEL: &str = "lpm vault key";

/// Fetch the 32-byte key. Err(NotFound) when absent.
pub fn fetch_key() -> Result<[u8; KEY_LEN], VaultError> {
    let mut bytes = match wincred::read(ACCOUNT) {
        Ok(Some(b)) => b,
        Ok(None) => return Err(VaultError::NotFound),
        Err(code) => {
            return Err(VaultError::Other(format!(
                "vault: read Credential Manager: error {code}"
            )))
        }
    };
    if bytes.len() != KEY_LEN {
        let len = bytes.len();
        bytes.zeroize();
        return Err(VaultError::Other(format!(
            "vault: stored key has wrong length {len}"
        )));
    }
    let mut key = [0u8; KEY_LEN];
    key.copy_from_slice(&bytes);
    bytes.zeroize();
    Ok(key)
}

/// Write a fresh key. An existing credential is never replaced.
pub fn write_key(key: &[u8]) -> Result<(), VaultError> {
    if key.len() != KEY_LEN {
        return Err(VaultError::Other("vault: key must be 32 bytes".into()));
    }
    match wincred::read(ACCOUNT) {
        Ok(None) => {}
        Ok(Some(mut existing)) => {
            existing.zeroize();
            return Err(VaultError::Denied);
        }
        Err(code) => {
            return Err(VaultError::Other(format!(
                "vault: read Credential Manager: error {code}"
            )))
        }
    }
    wincred::write(ACCOUNT, LABEL, key).map_err(|e| VaultError::Other(format!("vault: {e}")))?;
    match fetch_key() {
        Ok(stored) if stored.as_slice() == key => Ok(()),
        Ok(_) => Err(VaultError::KeyConflict),
        Err(e) => Err(e),
    }
}
