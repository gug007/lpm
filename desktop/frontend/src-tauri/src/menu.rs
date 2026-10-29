// Native app menu — port of desktop/appmenu_darwin.{go,m}.
//
// Built with Tauri's cross-platform menu API (no objc2). The first submenu
// becomes the macOS app menu: the standard About (with version/copyright),
// Settings (Cmd+,), Help Improve lpm, Star lpm on GitHub, Check for Updates,
// then Services/Hide/Quit.
// Edit + Window submenus give copy/paste and window management. Menu clicks
// show the main window and emit the events the frontend already listens for
// (menu-open-settings / menu-open-feedback). Dock menu + traffic-light
// repositioning (objc2-only, cosmetic/niche) are intentionally not ported.
use tauri::menu::MenuEvent;
#[cfg(target_os = "macos")]
use tauri::menu::{AboutMetadataBuilder, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager};

const ID_SETTINGS: &str = "lpm-menu-settings";
const ID_FEEDBACK: &str = "lpm-menu-feedback";
const ID_STAR: &str = "lpm-menu-star";
const ID_CHECK_UPDATES: &str = "lpm-menu-check-updates";
const ID_SELECT_ALL: &str = "lpm-menu-select-all";
const ID_UNDO: &str = "lpm-menu-undo";
const ID_REDO: &str = "lpm-menu-redo";
const ID_QUIT: &str = "lpm-menu-quit";

// Installed on macOS only. On Linux/Windows it would be an in-window menubar
// whose Ctrl accelerators (Ctrl+A, Ctrl+,) take keys from the terminal; the app
// UI offers these entries there instead (AppMenuButton.tsx).
#[cfg(target_os = "macos")]
pub fn build_and_set(app: &AppHandle) -> tauri::Result<()> {
    let version = option_env!("LPM_VERSION").unwrap_or("dev");
    let year = chrono::Local::now().format("%Y");
    let about = AboutMetadataBuilder::new()
        .name(Some("lpm"))
        .version(Some(version))
        .copyright(Some(format!("© {year}")))
        .build();

    let settings = MenuItemBuilder::with_id(ID_SETTINGS, "Settings…")
        .accelerator("CmdOrCtrl+,")
        .build(app)?;
    let feedback = MenuItemBuilder::with_id(ID_FEEDBACK, "Help Improve lpm…").build(app)?;
    let star = MenuItemBuilder::with_id(ID_STAR, "Star lpm on GitHub").build(app)?;
    let check_updates =
        MenuItemBuilder::with_id(ID_CHECK_UPDATES, "Check for Updates…").build(app)?;
    // Not the native Quit, which ends the app at once: agents may be mid-task,
    // and the window asks first (lifecycle::request_quit).
    let quit = MenuItemBuilder::with_id(ID_QUIT, "Quit lpm")
        .accelerator("CmdOrCtrl+Q")
        .build(app)?;

    let app_menu = SubmenuBuilder::new(app, "lpm")
        .about(Some(about))
        .separator()
        .item(&settings)
        .item(&feedback)
        .item(&star)
        .item(&check_updates)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .item(&quit)
        .build()?;

    // The native Select All action targets the focused DOM element, which in
    // Monaco editors is a hidden textarea holding only a fragment of the
    // document. Emit to the frontend instead, which routes select-all to the
    // focused editor (menuEdit.ts).
    let select_all = MenuItemBuilder::with_id(ID_SELECT_ALL, "Select All")
        .accelerator("CmdOrCtrl+A")
        .build(app)?;

    // The native Undo/Redo are disabled whenever WebKit's own history is empty,
    // and a disabled item still swallows ⌘Z/⌘⇧Z, so a field with its own undo
    // stack (the terminal composer) could never see them. Emit instead; the
    // frontend routes them to the focused field (menuEdit.ts).
    let undo = MenuItemBuilder::with_id(ID_UNDO, "Undo")
        .accelerator("CmdOrCtrl+Z")
        .build(app)?;
    let redo = MenuItemBuilder::with_id(ID_REDO, "Redo")
        .accelerator("CmdOrCtrl+Shift+Z")
        .build(app)?;

    let edit = SubmenuBuilder::new(app, "Edit")
        .item(&undo)
        .item(&redo)
        .separator()
        .cut()
        .copy()
        .paste()
        .item(&select_all)
        .build()?;

    let window = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .fullscreen()
        .build()?;

    let menu = MenuBuilder::new(app)
        .item(&app_menu)
        .item(&edit)
        .item(&window)
        .build()?;
    app.set_menu(menu)?;
    Ok(())
}

pub fn handle_event(app: &AppHandle, event: MenuEvent) {
    match event.id().as_ref() {
        ID_SETTINGS => show_and_emit(app, "menu-open-settings"),
        ID_FEEDBACK => show_and_emit(app, "menu-open-feedback"),
        ID_STAR => {
            use tauri_plugin_opener::OpenerExt;
            let _ = app
                .opener()
                .open_url("https://github.com/gug007/lpm", None::<&str>);
        }
        ID_SELECT_ALL => {
            let _ = app.emit("menu-select-all", ());
        }
        ID_UNDO => {
            let _ = app.emit("menu-undo", ());
        }
        ID_REDO => {
            let _ = app.emit("menu-redo", ());
        }
        ID_QUIT => crate::lifecycle::request_quit(app),
        ID_CHECK_UPDATES => {
            show_main(app);
            let app2 = app.clone();
            std::thread::spawn(move || {
                let _ = crate::updates::check_and_emit(&app2);
            });
        }
        _ => {}
    }
}

fn show_main(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    }
}

fn show_and_emit(app: &AppHandle, event: &str) {
    show_main(app);
    let _ = app.emit(event, ());
}
