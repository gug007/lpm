// Native app menu — port of desktop/appmenu_darwin.{go,m}.
//
// Built with Tauri's cross-platform menu API (no objc2). The first submenu
// becomes the macOS app menu: the standard About (with version/copyright),
// Settings (Cmd+,), Help Improve lpm, Check for Updates, then Services/Hide/Quit.
// Edit + Window submenus give copy/paste and window management. Menu clicks
// show the main window and emit the events the frontend already listens for
// (menu-open-settings / menu-open-feedback). Dock menu + traffic-light
// repositioning (objc2-only, cosmetic/niche) are intentionally not ported.
use tauri::menu::{AboutMetadataBuilder, MenuBuilder, MenuEvent, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager};

const ID_SETTINGS: &str = "lpm-menu-settings";
const ID_FEEDBACK: &str = "lpm-menu-feedback";
const ID_CHECK_UPDATES: &str = "lpm-menu-check-updates";

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
    let check_updates = MenuItemBuilder::with_id(ID_CHECK_UPDATES, "Check for Updates…").build(app)?;

    let app_menu = SubmenuBuilder::new(app, "lpm")
        .about(Some(about))
        .separator()
        .item(&settings)
        .item(&feedback)
        .item(&check_updates)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let edit = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
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
