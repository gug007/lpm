// Windows Credential Manager (generic credentials), the Windows counterpart of
// the login Keychain items vaultkeychain.rs and secrets.rs keep on macOS. Items
// are named `lpm/<account>`, mirroring the Keychain's service "lpm" + account.
// Credentials persist per user on this machine (DPAPI-protected, not roaming).
use std::ptr;
use windows_sys::Win32::Foundation::{GetLastError, ERROR_NOT_FOUND};
use windows_sys::Win32::Security::Credentials::{
    CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE,
    CRED_TYPE_GENERIC,
};

/// CRED_MAX_CREDENTIAL_BLOB_SIZE: 5 * 512 bytes.
const MAX_BLOB: usize = 5 * 512;

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn target(account: &str) -> Vec<u16> {
    wide(&format!("lpm/{account}"))
}

/// The stored bytes, Ok(None) when no such credential exists, Err(win32 error)
/// for anything else (e.g. no credential store in this logon session).
pub fn read(account: &str) -> Result<Option<Vec<u8>>, u32> {
    let name = target(account);
    let mut cred: *mut CREDENTIALW = ptr::null_mut();
    unsafe {
        if CredReadW(name.as_ptr(), CRED_TYPE_GENERIC, 0, &mut cred) == 0 {
            let err = GetLastError();
            return if err == ERROR_NOT_FOUND {
                Ok(None)
            } else {
                Err(err)
            };
        }
        let c = &*cred;
        let len = c.CredentialBlobSize as usize;
        let bytes = if len == 0 || c.CredentialBlob.is_null() {
            Vec::new()
        } else {
            let out = std::slice::from_raw_parts(c.CredentialBlob, len).to_vec();
            ptr::write_bytes(c.CredentialBlob, 0, len);
            out
        };
        CredFree(cred as *const _);
        Ok(Some(bytes))
    }
}

/// Create or replace the credential.
pub fn write(account: &str, label: &str, blob: &[u8]) -> Result<(), String> {
    if blob.len() > MAX_BLOB {
        return Err(format!(
            "value is too long for Credential Manager ({} bytes, max {MAX_BLOB})",
            blob.len()
        ));
    }
    let mut name = target(account);
    let mut user = wide(account);
    let mut comment = wide(label);
    let cred = CREDENTIALW {
        Type: CRED_TYPE_GENERIC,
        TargetName: name.as_mut_ptr(),
        Comment: comment.as_mut_ptr(),
        CredentialBlobSize: blob.len() as u32,
        CredentialBlob: blob.as_ptr() as *mut u8,
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        UserName: user.as_mut_ptr(),
        ..Default::default()
    };
    if unsafe { CredWriteW(&cred, 0) } == 0 {
        return Err(format!(
            "Credential Manager write failed (error {})",
            unsafe { GetLastError() }
        ));
    }
    Ok(())
}

/// Remove the credential. Absent is success.
pub fn delete(account: &str) -> Result<(), String> {
    let name = target(account);
    if unsafe { CredDeleteW(name.as_ptr(), CRED_TYPE_GENERIC, 0) } == 0 {
        let err = unsafe { GetLastError() };
        if err != ERROR_NOT_FOUND {
            return Err(format!("Credential Manager delete failed (error {err})"));
        }
    }
    Ok(())
}
