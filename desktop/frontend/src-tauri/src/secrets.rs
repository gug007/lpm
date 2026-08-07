// Named secrets (API keys) kept out of settings.json: the macOS login Keychain
// on this platform, a 0600 file under ~/.lpm on every other. Mirrors the
// vault.rs / vaultkeychain.rs / vaultkeyfile.rs split, but stores arbitrary
// strings under a caller-chosen account name rather than one fixed 32-byte key.
//
// Values are write-only from the UI's point of view: `get` exists for the
// synthesizer, `has` is what the frontend asks so a key is never sent back to a
// renderer that only needs to know whether one is set.

pub const OPENAI_API_KEY: &str = "openai-api-key";

#[cfg(target_os = "macos")]
mod imp {
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

#[cfg(not(target_os = "macos"))]
mod imp {
    use std::io::Write;
    use std::path::PathBuf;

    fn path(account: &str) -> Result<PathBuf, String> {
        let home = std::env::var("HOME").map_err(|_| "HOME is not set".to_string())?;
        let dir = PathBuf::from(home).join(".lpm").join("secrets");
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

pub fn get(account: &str) -> Result<Option<String>, String> {
    imp::get(account)
}

pub fn set(account: &str, value: &str) -> Result<(), String> {
    let value = value.trim();
    if value.is_empty() {
        return imp::delete(account);
    }
    imp::set(account, value)
}

pub fn delete(account: &str) -> Result<(), String> {
    imp::delete(account)
}

pub fn has(account: &str) -> bool {
    matches!(imp::get(account), Ok(Some(_)))
}
