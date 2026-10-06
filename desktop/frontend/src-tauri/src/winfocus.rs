// Keyboard and focus handling for the app's own windows on Windows, as a window
// subclass that runs ahead of tao's.
//
// tao 0.35 holds its keyboard locks while it peeks for the next key message,
// and PeekMessageW also delivers whatever another thread sent in the meantime:
// a focus or activation change from the WebView2 process arriving mid-keystroke
// re-enters tao, which takes the same lock again, and the UI thread never wakes.
// Such messages wait here until tao is done with the key, then go through in
// the order they came.
//
// lpm builds every webview as a child (multiwebview, for the in-pane browser),
// and wry only moves focus into a child webview when asked. Activating the
// window (set_focus, Alt+Tab, the taskbar, a click) therefore left keyboard
// focus on the bare top-level window, where keys reach no page. Focus goes on
// to the webview that had it, as wry does for a webview that fills its window.

use std::cell::{Cell, RefCell};
use std::collections::VecDeque;
use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetFocus, SetFocus};
use windows_sys::Win32::UI::Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetAncestor, IsChild, IsWindow, IsWindowVisible, SendMessageW, GA_PARENT, WA_INACTIVE,
    WM_ACTIVATE, WM_CHAR, WM_KEYDOWN, WM_KEYFIRST, WM_KEYLAST, WM_KEYUP, WM_KILLFOCUS,
    WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MBUTTONDOWN, WM_MBUTTONUP, WM_MOUSEHWHEEL, WM_MOUSEMOVE,
    WM_MOUSEWHEEL, WM_NCACTIVATE, WM_NCDESTROY, WM_RBUTTONDOWN, WM_RBUTTONUP, WM_SETFOCUS,
    WM_SYSCHAR, WM_SYSKEYDOWN, WM_SYSKEYUP, WM_XBUTTONDOWN, WM_XBUTTONUP,
};

const SUBCLASS_ID: usize = 0x6c70_6d66;

struct WindowFocus {
    webview: HWND,
    last: Cell<HWND>,
}

type Held = (HWND, u32, WPARAM, LPARAM);

thread_local! {
    static IN_KEY: Cell<bool> = const { Cell::new(false) };
    static HELD: RefCell<VecDeque<Held>> = const { RefCell::new(VecDeque::new()) };
    static FORWARDING: Cell<bool> = const { Cell::new(false) };
}

pub fn attach(win: &tauri::WebviewWindow) {
    let Ok(top) = win.hwnd() else {
        return;
    };
    let top = top.0 as isize;
    let _ = win.with_webview(move |pv| unsafe {
        let mut container = Default::default();
        if pv.controller().ParentWindow(&mut container).is_err() {
            return;
        }
        let state = Box::into_raw(Box::new(WindowFocus {
            webview: container.0 as HWND,
            last: Cell::new(std::ptr::null_mut()),
        }));
        if SetWindowSubclass(
            top as HWND,
            Some(subclass_proc),
            SUBCLASS_ID,
            state as usize,
        ) == 0
        {
            drop(Box::from_raw(state));
        }
    });
}

/// Messages tao handles while peeking for the next key message.
fn peeks(msg: u32) -> bool {
    matches!(
        msg,
        WM_KEYDOWN | WM_SYSKEYDOWN | WM_KEYUP | WM_SYSKEYUP | WM_CHAR | WM_SYSCHAR
    )
}

/// Messages whose tao handlers take the locks a peeking key handler holds.
fn takes_key_locks(msg: u32) -> bool {
    (WM_KEYFIRST..=WM_KEYLAST).contains(&msg)
        || matches!(
            msg,
            WM_SETFOCUS
                | WM_KILLFOCUS
                | WM_NCACTIVATE
                | WM_MOUSEMOVE
                | WM_MOUSEWHEEL
                | WM_MOUSEHWHEEL
                | WM_LBUTTONDOWN
                | WM_LBUTTONUP
                | WM_RBUTTONDOWN
                | WM_RBUTTONUP
                | WM_MBUTTONDOWN
                | WM_MBUTTONUP
                | WM_XBUTTONDOWN
                | WM_XBUTTONUP
        )
}

unsafe extern "system" fn subclass_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _id: usize,
    data: usize,
) -> LRESULT {
    if IN_KEY.get() && takes_key_locks(msg) {
        HELD.with_borrow_mut(|held| held.push_back((hwnd, msg, wparam, lparam)));
        // WM_NCACTIVATE's FALSE would veto a deactivation.
        return LRESULT::from(msg == WM_NCACTIVATE);
    }
    let state = &*(data as *const WindowFocus);
    match msg {
        _ if peeks(msg) => {
            IN_KEY.set(true);
            let result = DefSubclassProc(hwnd, msg, wparam, lparam);
            IN_KEY.set(false);
            release_held();
            result
        }
        WM_ACTIVATE => {
            if (wparam & 0xffff) as u32 == WA_INACTIVE {
                let focus = GetFocus();
                let inside = !focus.is_null() && IsChild(hwnd, focus) != 0;
                state
                    .last
                    .set(if inside { focus } else { std::ptr::null_mut() });
            }
            DefSubclassProc(hwnd, msg, wparam, lparam)
        }
        WM_SETFOCUS => {
            let result = DefSubclassProc(hwnd, msg, wparam, lparam);
            forward_focus(hwnd, wparam as HWND, state);
            result
        }
        WM_NCDESTROY => {
            RemoveWindowSubclass(hwnd, Some(subclass_proc), SUBCLASS_ID);
            let result = DefSubclassProc(hwnd, msg, wparam, lparam);
            drop(Box::from_raw(data as *mut WindowFocus));
            result
        }
        _ => DefSubclassProc(hwnd, msg, wparam, lparam),
    }
}

unsafe fn release_held() {
    while let Some((hwnd, msg, wparam, lparam)) = HELD.with_borrow_mut(|held| held.pop_front()) {
        if IsWindow(hwnd) != 0 {
            SendMessageW(hwnd, msg, wparam, lparam);
        }
    }
}

/// Keyboard focus landed on the top-level window itself: hand it to the
/// webview it just came from, else the one that had it when the window was
/// last deactivated, else the window's own.
unsafe fn forward_focus(top: HWND, lost: HWND, state: &WindowFocus) {
    if FORWARDING.get() || GetFocus() != top {
        return;
    }
    let target = [lost, state.last.get()]
        .into_iter()
        .filter(|&h| !h.is_null() && IsChild(top, h) != 0)
        .map(|h| child_of(top, h))
        .find(|&webview| IsWindowVisible(webview) != 0)
        .unwrap_or(state.webview);
    if IsWindow(target) == 0 {
        return;
    }
    FORWARDING.set(true);
    SetFocus(target);
    FORWARDING.set(false);
}

/// The direct child of `top` that contains `hwnd`: the webview's container.
unsafe fn child_of(top: HWND, mut hwnd: HWND) -> HWND {
    loop {
        let parent = GetAncestor(hwnd, GA_PARENT);
        if parent == top || parent.is_null() {
            return hwnd;
        }
        hwnd = parent;
    }
}
