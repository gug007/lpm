// Named secrets (API keys) kept out of settings.json: the login Keychain on
// macOS, Credential Manager on Windows, a 0600 file under the data directory on
// Linux — and on every platform for a copy of lpm on a data directory of its own
// (a lesson, a test), which so never reads the real app's secrets or asks the
// user to let it.
// Mirrors the vault.rs backend split, but stores arbitrary strings under a
// caller-chosen account name rather than one fixed 32-byte key.
//
// Values are write-only from the UI's point of view: `get` exists for the
// synthesizer, `has` is what the frontend asks so a key is never sent back to a
// renderer that only needs to know whether one is set.
//
// On macOS reading a value asks the user to allow it whenever the item's access
// list doesn't name the running build — and a locally built lpm is a new build
// every time. So `has` reads the item's attributes only, which never asks, and a
// value read once is kept for the life of the process.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

pub const OPENAI_API_KEY: &str = "openai-api-key";
pub const TELEGRAM_BOT_TOKEN: &str = "telegram-bot-token";
pub const GEMINI_API_KEY: &str = "gemini-api-key";

#[cfg(target_os = "macos")]
mod native {
    use core_foundation::base::{CFType, TCFType};
    use core_foundation::boolean::CFBoolean;
    use core_foundation::data::CFData;
    use core_foundation::dictionary::CFDictionary;
    use core_foundation::string::CFString;
    use core_foundation_sys::base::{CFGetTypeID, CFTypeRef, OSStatus};
    use core_foundation_sys::string::CFStringRef;
    use security_framework_sys::base::errSecItemNotFound;
    use security_framework_sys::item::{
        kSecAttrAccount, kSecAttrLabel, kSecAttrService, kSecClass, kSecClassGenericPassword,
        kSecReturnData, kSecValueData,
    };
    use security_framework_sys::keychain_item::{
        SecItemAdd, SecItemCopyMatching, SecItemDelete,
    };

    const SERVICE: &str = "lpm";

    fn cf_const(s: CFStringRef) -> CFType {
        unsafe { CFString::wrap_under_get_rule(s).as_CFType() }
    }

    fn query_pairs(account: &str) -> Vec<(CFType, CFType)> {
        vec![
            (
                cf_const(unsafe { kSecClass }),
                cf_const(unsafe { kSecClassGenericPassword }),
            ),
            (
                cf_const(unsafe { kSecAttrService }),
                CFString::new(SERVICE).as_CFType(),
            ),
            (
                cf_const(unsafe { kSecAttrAccount }),
                CFString::new(account).as_CFType(),
            ),
        ]
    }

    pub fn exists(account: &str) -> Result<bool, String> {
        let query = CFDictionary::from_CFType_pairs(&query_pairs(account));
        let status = unsafe { SecItemCopyMatching(query.as_concrete_TypeRef(), std::ptr::null_mut()) };
        match status {
            0 => Ok(true),
            s if s == errSecItemNotFound => Ok(false),
            s => Err(format!("read keychain: status {s}")),
        }
    }

    pub fn get(account: &str) -> Result<Option<String>, String> {
        let mut pairs = query_pairs(account);
        pairs.push((
            cf_const(unsafe { kSecReturnData }),
            CFBoolean::true_value().as_CFType(),
        ));
        let query = CFDictionary::from_CFType_pairs(&pairs);

        let mut result: CFTypeRef = std::ptr::null();
        let status = unsafe { SecItemCopyMatching(query.as_concrete_TypeRef(), &mut result) };
        if status == errSecItemNotFound {
            return Ok(None);
        }
        if status != 0 {
            return Err(format!("read keychain: status {status}"));
        }
        if result.is_null() {
            return Ok(None);
        }
        if unsafe { CFGetTypeID(result) } != CFData::type_id() {
            unsafe { core_foundation_sys::base::CFRelease(result) };
            return Err("keychain returned non-data".into());
        }
        let data = unsafe {
            CFData::wrap_under_create_rule(result as core_foundation_sys::data::CFDataRef)
        };
        String::from_utf8(data.bytes().to_vec())
            .map(Some)
            .map_err(|_| "keychain value is not valid UTF-8".into())
    }

    /// Delete-then-add rather than SecItemUpdate: one code path for both the
    /// first save and every later rotation.
    pub fn set(account: &str, value: &str) -> Result<(), String> {
        let _ = delete(account);
        let mut pairs = query_pairs(account);
        pairs.push((
            cf_const(unsafe { kSecAttrLabel }),
            CFString::new(&format!("lpm {account}")).as_CFType(),
        ));
        pairs.push((
            cf_const(unsafe { kSecValueData }),
            CFData::from_buffer(value.as_bytes()).as_CFType(),
        ));
        let attrs = CFDictionary::from_CFType_pairs(&pairs);
        let status = unsafe { SecItemAdd(attrs.as_concrete_TypeRef(), std::ptr::null_mut()) };
        if status != 0 {
            return Err(format!("write keychain: status {status}"));
        }
        Ok(())
    }

    pub fn delete(account: &str) -> Result<(), String> {
        let query = CFDictionary::from_CFType_pairs(&query_pairs(account));
        let status: OSStatus = unsafe { SecItemDelete(query.as_concrete_TypeRef()) };
        if status != 0 && status != errSecItemNotFound {
            return Err(format!("delete keychain item: status {status}"));
        }
        Ok(())
    }
}

#[cfg(windows)]
mod native {
    use crate::wincred;

    pub fn get(account: &str) -> Result<Option<String>, String> {
        match wincred::read(account) {
            Ok(None) => Ok(None),
            Ok(Some(bytes)) => String::from_utf8(bytes)
                .map(|s| Some(s).filter(|s| !s.is_empty()))
                .map_err(|_| "stored secret is not valid UTF-8".into()),
            Err(code) => Err(format!("read Credential Manager: error {code}")),
        }
    }

    pub fn set(account: &str, value: &str) -> Result<(), String> {
        wincred::write(account, &format!("lpm {account}"), value.as_bytes())
    }

    pub fn delete(account: &str) -> Result<(), String> {
        wincred::delete(account)
    }
}

mod file {
    use std::io::Write;
    use std::path::PathBuf;

    fn path(account: &str) -> Result<PathBuf, String> {
        let dir = crate::config::lpm_dir().join("secrets");
        std::fs::create_dir_all(&dir).map_err(|e| format!("create secrets dir: {e}"))?;
        Ok(dir.join(account))
    }

    pub fn get(account: &str) -> Result<Option<String>, String> {
        match std::fs::read_to_string(path(account)?) {
            Ok(s) => Ok(Some(s.trim().to_string()).filter(|s| !s.is_empty())),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(format!("read secret: {e}")),
        }
    }

    pub fn set(account: &str, value: &str) -> Result<(), String> {
        let p = path(account)?;
        let mut opts = std::fs::OpenOptions::new();
        opts.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            opts.mode(0o600);
        }
        let mut f = opts.open(&p).map_err(|e| format!("write secret: {e}"))?;
        f.write_all(value.as_bytes())
            .map_err(|e| format!("write secret: {e}"))
    }

    pub fn delete(account: &str) -> Result<(), String> {
        match std::fs::remove_file(path(account)?) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(format!("delete secret: {e}")),
        }
    }
}

// Whether this process uses the OS keystore; see the note at the top.
#[cfg(any(target_os = "macos", windows))]
fn native_store() -> bool {
    !crate::config::own_data_dir()
}

fn read(account: &str) -> Result<Option<String>, String> {
    #[cfg(any(target_os = "macos", windows))]
    if native_store() {
        return native::get(account);
    }
    file::get(account)
}

fn write(account: &str, value: &str) -> Result<(), String> {
    #[cfg(any(target_os = "macos", windows))]
    if native_store() {
        return native::set(account, value);
    }
    file::set(account, value)
}

fn remove(account: &str) -> Result<(), String> {
    #[cfg(any(target_os = "macos", windows))]
    if native_store() {
        return native::delete(account);
    }
    file::delete(account)
}

// Values this process has read or written. Only lpm writes these items, and only
// from the app process, so a value seen once stays right until it sets or
// deletes it here.
fn cache() -> std::sync::MutexGuard<'static, HashMap<String, String>> {
    static CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    CACHE
        .get_or_init(Default::default)
        .lock()
        .unwrap_or_else(|e| e.into_inner())
}

pub fn get(account: &str) -> Result<Option<String>, String> {
    if let Some(value) = cache().get(account) {
        return Ok(Some(value.clone()));
    }
    let value = read(account)?;
    if let Some(v) = &value {
        cache().insert(account.to_string(), v.clone());
    }
    Ok(value)
}

pub fn set(account: &str, value: &str) -> Result<(), String> {
    let value = value.trim();
    if value.is_empty() {
        return delete(account);
    }
    write(account, value)?;
    cache().insert(account.to_string(), value.to_string());
    Ok(())
}

pub fn delete(account: &str) -> Result<(), String> {
    cache().remove(account);
    remove(account)
}

pub fn has(account: &str) -> bool {
    if cache().contains_key(account) {
        return true;
    }
    #[cfg(target_os = "macos")]
    if native_store() {
        return matches!(native::exists(account), Ok(true));
    }
    matches!(read(account), Ok(Some(_)))
}
