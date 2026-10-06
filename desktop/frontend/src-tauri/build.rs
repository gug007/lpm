fn main() {
    // Dock menu is native ObjC (no Tauri API); compile + link it for macOS targets.
    // The build script runs on the host, so ask Cargo for the target OS instead of
    // using #[cfg], or a cross build to Windows/Linux would compile ObjC.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rerun-if-changed=src/dockmenu.m");
        cc::Build::new()
            .file("src/dockmenu.m")
            .flag("-fobjc-arc")
            .flag("-Wno-unused-parameter")
            .compile("lpmdockmenu");
        println!("cargo:rustc-link-lib=framework=Cocoa");
    }
    // tauri-build would embed the Common Controls v6 manifest in the app only. A
    // test binary without it loads comctl32 v5, which lacks TaskDialogIndirect,
    // and Windows refuses to start it, so every Windows binary gets it from here.
    let mut attributes = tauri_build::Attributes::new();
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        attributes = attributes
            .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
        println!("cargo:rerun-if-changed=windows-app-manifest.rc");
        println!("cargo:rerun-if-changed=windows-app-manifest.xml");
        embed_resource::compile_for_everything("windows-app-manifest.rc", embed_resource::NONE)
            .manifest_optional()
            .unwrap();
    }
    tauri_build::try_build(attributes).expect("tauri build");
}
