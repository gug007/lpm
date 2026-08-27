// Installed monospace font families for the terminal font picker. Core Text
// enumerates every family and filters by the monospace symbolic trait; other
// platforms return an empty list and the frontend falls back to canvas-probing
// a list of well-known families.

#[cfg(target_os = "macos")]
mod imp {
    use core_foundation::array::CFArray;
    use core_foundation::base::TCFType;
    use core_foundation::string::CFString;
    use core_foundation_sys::array::CFArrayRef;
    use core_foundation_sys::base::{CFRelease, CFTypeRef};
    use core_foundation_sys::string::CFStringRef;
    use std::ffi::c_void;

    type CTFontRef = CFTypeRef;

    const MONO_SPACE_TRAIT: u32 = 1 << 10; // kCTFontTraitMonoSpace

    #[link(name = "CoreText", kind = "framework")]
    extern "C" {
        fn CTFontManagerCopyAvailableFontFamilyNames() -> CFArrayRef;
        fn CTFontCreateWithName(name: CFStringRef, size: f64, matrix: *const c_void)
            -> CTFontRef;
        fn CTFontGetSymbolicTraits(font: CTFontRef) -> u32;
    }

    pub fn monospace_families() -> Vec<String> {
        let names: CFArray<CFString> = unsafe {
            let arr = CTFontManagerCopyAvailableFontFamilyNames();
            if arr.is_null() {
                return Vec::new();
            }
            CFArray::wrap_under_create_rule(arr)
        };

        let mut out = Vec::new();
        for name in names.iter() {
            let family = name.to_string();
            // Dot-prefixed families are hidden system fonts CSS can't reference.
            if family.starts_with('.') {
                continue;
            }
            let mono = unsafe {
                let font = CTFontCreateWithName(name.as_concrete_TypeRef(), 0.0, std::ptr::null());
                if font.is_null() {
                    continue;
                }
                let mono = CTFontGetSymbolicTraits(font) & MONO_SPACE_TRAIT != 0;
                CFRelease(font);
                mono
            };
            if mono {
                out.push(family);
            }
        }
        out
    }
}

#[tauri::command]
pub async fn list_monospace_fonts() -> Vec<String> {
    #[cfg(target_os = "macos")]
    {
        imp::monospace_families()
    }
    #[cfg(not(target_os = "macos"))]
    {
        Vec::new()
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    #[test]
    fn finds_system_monospace_families() {
        let families = super::imp::monospace_families();
        assert!(families.iter().any(|f| f == "Menlo"), "{families:?}");
        assert!(families.iter().all(|f| !f.starts_with('.')));
    }
}
