// Installed monospace font families for the terminal font picker: Core Text's
// monospace trait on macOS, fontconfig's `spacing=mono` on Linux, GDI's fixed
// pitch on Windows. An empty list makes the frontend fall back to
// canvas-probing a list of well-known families.

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

#[cfg(all(unix, not(target_os = "macos")))]
mod imp {
    pub fn monospace_families() -> Vec<String> {
        match crate::osproc::command("fc-list")
            .args([":spacing=mono", "family"])
            .output()
        {
            Ok(out) if out.status.success() => {
                super::families_from_fc_list(&String::from_utf8_lossy(&out.stdout))
            }
            _ => Vec::new(),
        }
    }
}

#[cfg(windows)]
mod imp {
    use std::collections::BTreeSet;
    use windows_sys::Win32::Foundation::LPARAM;
    use windows_sys::Win32::Graphics::Gdi::{
        EnumFontFamiliesExW, GetDC, ReleaseDC, DEFAULT_CHARSET, LOGFONTW, TEXTMETRICW,
        TMPF_FIXED_PITCH,
    };

    // TMPF_FIXED_PITCH set means *variable* pitch (the name is historical).
    unsafe extern "system" fn collect(
        font: *const LOGFONTW,
        metrics: *const TEXTMETRICW,
        _kind: u32,
        out: LPARAM,
    ) -> i32 {
        let (font, metrics) = unsafe { (&*font, &*metrics) };
        if metrics.tmPitchAndFamily & TMPF_FIXED_PITCH == 0 {
            let len = font.lfFaceName.iter().position(|&c| c == 0).unwrap_or(32);
            let name = String::from_utf16_lossy(&font.lfFaceName[..len]);
            if !name.is_empty() && !name.starts_with('@') {
                let set = unsafe { &mut *(out as *mut BTreeSet<String>) };
                set.insert(name);
            }
        }
        1
    }

    pub fn monospace_families() -> Vec<String> {
        let mut found: BTreeSet<String> = BTreeSet::new();
        let query = LOGFONTW {
            lfCharSet: DEFAULT_CHARSET,
            ..Default::default()
        };
        unsafe {
            let dc = GetDC(std::ptr::null_mut());
            if dc.is_null() {
                return Vec::new();
            }
            EnumFontFamiliesExW(
                dc,
                &query,
                Some(collect),
                &mut found as *mut BTreeSet<String> as LPARAM,
                0,
            );
            ReleaseDC(std::ptr::null_mut(), dc);
        }
        found.into_iter().collect()
    }
}

/// `fc-list : family` prints one font per line as its comma-separated family
/// names (the first is the canonical one), with `\` escaping.
#[cfg(any(test, all(unix, not(target_os = "macos"))))]
fn families_from_fc_list(text: &str) -> Vec<String> {
    let mut families: Vec<String> = text
        .lines()
        .filter_map(|line| {
            let mut name = String::new();
            let mut chars = line.chars();
            while let Some(c) = chars.next() {
                match c {
                    '\\' => name.extend(chars.next()),
                    ',' => break,
                    c => name.push(c),
                }
            }
            let name = name.trim().to_string();
            (!name.is_empty() && !name.starts_with('.')).then_some(name)
        })
        .collect();
    families.sort();
    families.dedup();
    families
}

#[tauri::command]
pub async fn list_monospace_fonts() -> Vec<String> {
    #[cfg(target_os = "macos")]
    {
        imp::monospace_families()
    }
    #[cfg(not(target_os = "macos"))]
    {
        tauri::async_runtime::spawn_blocking(imp::monospace_families)
            .await
            .unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    #[cfg(target_os = "macos")]
    #[test]
    fn finds_system_monospace_families() {
        let families = super::imp::monospace_families();
        assert!(families.iter().any(|f| f == "Menlo"), "{families:?}");
        assert!(families.iter().all(|f| !f.starts_with('.')));
    }

    #[test]
    fn fc_list_lines_keep_the_canonical_family_once() {
        let out = "DejaVu Sans Mono\nUbuntu Sans Mono,Ubuntu Sans Mono Medium\nDejaVu Sans Mono\nFoo\\, Bar Mono\n\n";
        assert_eq!(
            super::families_from_fc_list(out),
            vec!["DejaVu Sans Mono", "Foo, Bar Mono", "Ubuntu Sans Mono"]
        );
    }
}
