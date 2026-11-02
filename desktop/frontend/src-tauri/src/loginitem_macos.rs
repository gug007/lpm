// SMAppService.mainAppService (macOS 13+) puts lpm in System Settings ›
// General › Login Items › Open at Login. Older macOS has no such class, so the
// row stays hidden there.
use super::LoginItem;
use objc2::msg_send;
use objc2::rc::{autoreleasepool, Retained};
use objc2::runtime::{AnyClass, AnyObject};
use objc2_foundation::NSString;

#[link(name = "ServiceManagement", kind = "framework")]
extern "C" {}

// SMAppServiceStatus
const ENABLED: isize = 1;
const REQUIRES_APPROVAL: isize = 2;

fn service_class() -> Option<&'static AnyClass> {
    AnyClass::get(c"SMAppService")
}

fn main_app(class: &AnyClass) -> Option<Retained<AnyObject>> {
    unsafe { msg_send![class, mainAppService] }
}

pub fn state() -> LoginItem {
    autoreleasepool(|_| {
        let Some(service) = service_class().and_then(main_app) else {
            return LoginItem::default();
        };
        let status: isize = unsafe { msg_send![&*service, status] };
        LoginItem {
            supported: true,
            enabled: status == ENABLED,
            needs_approval: status == REQUIRES_APPROVAL,
        }
    })
}

pub fn set(enabled: bool) -> Result<(), String> {
    autoreleasepool(|_| {
        let class = service_class().ok_or("Open at login needs macOS 13 or later.")?;
        let status = apply(class, enabled)?;
        if enabled && status == REQUIRES_APPROVAL {
            let _: () = unsafe { msg_send![class, openSystemSettingsLoginItems] };
        }
        Ok(())
    })
}

// Nobody asked for this one, so System Settings never opens, and an lpm the
// user switched off there before stays off.
pub fn enable_by_default() -> Result<(), String> {
    autoreleasepool(|_| {
        let class = service_class().ok_or("Open at login needs macOS 13 or later.")?;
        if apply(class, true)? == REQUIRES_APPROVAL {
            apply(class, false)?;
        }
        Ok(())
    })
}

fn apply(class: &AnyClass, enabled: bool) -> Result<isize, String> {
    let service = main_app(class).ok_or("Login Items aren't available.")?;
    let mut error: *mut AnyObject = std::ptr::null_mut();
    let ok: bool = unsafe {
        if enabled {
            msg_send![&*service, registerAndReturnError: &mut error]
        } else {
            msg_send![&*service, unregisterAndReturnError: &mut error]
        }
    };
    if !ok {
        return Err(describe(error));
    }
    Ok(unsafe { msg_send![&*service, status] })
}

fn describe(error: *mut AnyObject) -> String {
    if error.is_null() {
        return "Couldn't change Login Items.".into();
    }
    let text: Option<Retained<NSString>> = unsafe { msg_send![error, localizedDescription] };
    text.map_or_else(|| "Couldn't change Login Items.".into(), |t| t.to_string())
}
