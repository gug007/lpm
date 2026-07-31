// macOS vault key storage: one item in the login Keychain (service="lpm",
// account="vault"). Backend for vault.rs on this platform; vaultkeyfile.rs is
// the counterpart everywhere else.
//
// DATA SAFETY: reads/deletes query with kSecAttrSynchronizableAny so an existing
// (possibly iCloud-synced) item is always found — a miss would recreate the key
// and orphan every encrypted note. We never recreate on an access denial.

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

use crate::vault::{VaultError, KEY_LEN};

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

fn is_access_denied(status: OSStatus) -> bool {
    matches!(
        status,
        ERR_AUTH_FAILED | ERR_INTERACTION_NOT_ALLOWED | ERR_NO_ACCESS_FOR_ITEM | ERR_USER_CANCELED
    )
}

/// Wrap a static CFStringRef constant (get rule) as a CFType for dict keys/values.
fn cf_const(s: CFStringRef) -> CFType {
    unsafe { CFString::wrap_under_get_rule(s).as_CFType() }
}

/// Fetch the 32-byte key. Err(NotFound) when absent; Err(Other) carries OSStatus.
pub fn fetch_key() -> Result<[u8; KEY_LEN], VaultError> {
    let pairs = [
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
            CFString::new(ACCOUNT).as_CFType(),
        ),
        (
            cf_const(unsafe { kSecAttrSynchronizable }),
            cf_const(unsafe { kSecAttrSynchronizableAny }),
        ),
        (
            cf_const(unsafe { kSecReturnData }),
            CFBoolean::true_value().as_CFType(),
        ),
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
        return Err(VaultError::Other(format!(
            "vault: read keychain: status {status}"
        )));
    }
    if result.is_null() {
        return Err(VaultError::NotFound);
    }
    // With kSecReturnData and the default match limit (one), the result is CFData.
    if unsafe { CFGetTypeID(result) } != CFData::type_id() {
        unsafe { core_foundation_sys::base::CFRelease(result) };
        return Err(VaultError::Other(
            "vault: keychain returned non-data".into(),
        ));
    }
    let data =
        unsafe { CFData::wrap_under_create_rule(result as core_foundation_sys::data::CFDataRef) };
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
            CFString::new(ACCOUNT).as_CFType(),
        ),
        (
            cf_const(unsafe { kSecAttrLabel }),
            CFString::new(LABEL).as_CFType(),
        ),
        (
            cf_const(unsafe { kSecValueData }),
            CFData::from_buffer(key).as_CFType(),
        ),
        (
            cf_const(unsafe { kSecAttrAccessible }),
            cf_const(accessible),
        ),
        (
            cf_const(unsafe { kSecAttrSynchronizable }),
            sync.as_CFType(),
        ),
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
pub fn write_key(key: &[u8]) -> Result<(), VaultError> {
    let mut status = add_item(key, unsafe { kSecAttrAccessibleWhenUnlocked }, true);
    if status == ERR_MISSING_ENTITLEMENT {
        status = add_item(
            key,
            unsafe { kSecAttrAccessibleWhenUnlockedThisDeviceOnly },
            false,
        );
    }
    match status {
        0 => Ok(()),
        s if s == errSecDuplicateItem => Err(VaultError::Denied),
        s => Err(VaultError::Other(format!(
            "vault: write keychain item: status {s}"
        ))),
    }
}
