// A picture of part of a browser tab's page, taken by the web engine itself and
// returned as base64 PNG. The rect is in the page's CSS pixels, relative to the
// visible viewport.
#[cfg(not(target_os = "linux"))]
use std::sync::mpsc;
#[cfg(not(target_os = "linux"))]
use std::time::Duration;

#[cfg(not(target_os = "linux"))]
const WAIT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Copy, PartialEq)]
#[cfg_attr(target_os = "linux", allow(dead_code))]
pub(crate) struct Clip {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub scroll_x: f64,
    pub scroll_y: f64,
}

#[cfg(target_os = "macos")]
pub(crate) fn capture(wv: &tauri::Webview, clip: Clip) -> Option<String> {
    use base64::{engine::general_purpose::STANDARD as B64, Engine};
    use block2::RcBlock;
    use objc2::msg_send;
    use objc2::rc::Retained;
    use objc2::runtime::{AnyClass, AnyObject};
    use objc2_foundation::{NSPoint, NSRect, NSSize};

    let (tx, rx) = mpsc::channel::<Option<Vec<u8>>>();
    let asked = wv.with_webview(move |pv| unsafe {
        let view: *mut AnyObject = pv.inner().cast();
        let Some(class) = AnyClass::get(c"WKSnapshotConfiguration") else {
            let _ = tx.send(None);
            return;
        };
        if view.is_null() {
            let _ = tx.send(None);
            return;
        }
        let config: Retained<AnyObject> = msg_send![class, new];
        let rect = NSRect::new(
            NSPoint::new(clip.x, clip.y),
            NSSize::new(clip.width, clip.height),
        );
        let _: () = msg_send![&*config, setRect: rect];
        let done = RcBlock::new(move |image: *mut AnyObject, _error: *mut AnyObject| {
            let _ = tx.send(objc2::rc::autoreleasepool(|_| png_of(image)));
        });
        let _: () =
            msg_send![view, takeSnapshotWithConfiguration: &*config, completionHandler: &*done];
    });
    if asked.is_err() {
        return None;
    }
    let png = rx.recv_timeout(WAIT).ok().flatten()?;
    Some(B64.encode(png))
}

/// NSImage → PNG bytes, through its bitmap representation. `image` is the
/// snapshot handler's argument: null, or an NSImage alive for the call.
#[cfg(target_os = "macos")]
fn png_of(image: *mut objc2::runtime::AnyObject) -> Option<Vec<u8>> {
    use objc2::msg_send;
    use objc2::runtime::{AnyClass, AnyObject};
    use std::ffi::c_void;
    const PNG_FILE_TYPE: usize = 4;
    if image.is_null() {
        return None;
    }
    let rep_class = AnyClass::get(c"NSBitmapImageRep")?;
    let dict_class = AnyClass::get(c"NSDictionary")?;
    unsafe {
        let tiff: *mut AnyObject = msg_send![image, TIFFRepresentation];
        if tiff.is_null() {
            return None;
        }
        let rep: *mut AnyObject = msg_send![rep_class, imageRepWithData: tiff];
        if rep.is_null() {
            return None;
        }
        let props: *mut AnyObject = msg_send![dict_class, dictionary];
        let data: *mut AnyObject =
            msg_send![rep, representationUsingType: PNG_FILE_TYPE, properties: props];
        if data.is_null() {
            return None;
        }
        let len: usize = msg_send![data, length];
        let bytes: *const c_void = msg_send![data, bytes];
        if bytes.is_null() || len == 0 {
            return None;
        }
        Some(std::slice::from_raw_parts(bytes.cast::<u8>(), len).to_vec())
    }
}

/// WebView2 has no snapshot of a rect, so this asks Chromium's DevTools
/// protocol, whose clip is in page coordinates (scroll included).
#[cfg(windows)]
pub(crate) fn capture(wv: &tauri::Webview, clip: Clip) -> Option<String> {
    use webview2_com::CallDevToolsProtocolMethodCompletedHandler;
    use windows_core::HSTRING;

    let params = capture_params(clip);
    let (tx, rx) = mpsc::channel::<Option<String>>();
    let asked = wv.with_webview(move |pv| unsafe {
        let Ok(core) = pv.controller().CoreWebView2() else {
            let _ = tx.send(None);
            return;
        };
        let done = tx.clone();
        let handler =
            CallDevToolsProtocolMethodCompletedHandler::create(Box::new(move |result, json| {
                let _ = done.send(result.ok().and_then(|_| screenshot_data(&json)));
                Ok(())
            }));
        let method = HSTRING::from("Page.captureScreenshot");
        let params = HSTRING::from(params);
        if core
            .CallDevToolsProtocolMethod(&method, &params, &handler)
            .is_err()
        {
            let _ = tx.send(None);
        }
    });
    if asked.is_err() {
        return None;
    }
    rx.recv_timeout(WAIT).ok().flatten()
}

#[cfg(any(windows, test))]
fn capture_params(clip: Clip) -> String {
    serde_json::json!({
        "format": "png",
        "captureBeyondViewport": false,
        "clip": {
            "x": clip.x + clip.scroll_x,
            "y": clip.y + clip.scroll_y,
            "width": clip.width,
            "height": clip.height,
            "scale": 1,
        },
    })
    .to_string()
}

#[cfg(any(windows, test))]
fn screenshot_data(json: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(json).ok()?;
    let data = value.get("data")?.as_str()?;
    (!data.is_empty()).then(|| data.to_string())
}

// Linux has no in-pane page (see browser.rs), so there is nothing to photograph.
#[cfg(target_os = "linux")]
pub(crate) fn capture(_wv: &tauri::Webview, _clip: Clip) -> Option<String> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_devtools_clip_is_moved_by_the_scroll() {
        let clip = Clip {
            x: 10.0,
            y: 20.0,
            width: 100.0,
            height: 50.0,
            scroll_x: 0.0,
            scroll_y: 400.0,
        };
        let params: serde_json::Value = serde_json::from_str(&capture_params(clip)).unwrap();
        assert_eq!(params["format"], "png");
        assert_eq!(params["clip"]["x"], 10.0);
        assert_eq!(params["clip"]["y"], 420.0);
        assert_eq!(params["clip"]["width"], 100.0);
        assert_eq!(params["clip"]["scale"], 1);
    }

    #[test]
    fn a_screenshot_answer_gives_its_base64() {
        assert_eq!(
            screenshot_data(r#"{"data":"iVBORw0"}"#).as_deref(),
            Some("iVBORw0")
        );
        assert_eq!(screenshot_data(r#"{"data":""}"#), None);
        assert_eq!(screenshot_data(r#"{"error":"x"}"#), None);
        assert_eq!(screenshot_data("not json"), None);
    }
}
