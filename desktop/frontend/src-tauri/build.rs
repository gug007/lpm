fn main() {
    // Dock menu is native ObjC (no Tauri API); compile + link it on macOS.
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rerun-if-changed=src/dockmenu.m");
        cc::Build::new()
            .file("src/dockmenu.m")
            .flag("-fobjc-arc")
            .flag("-Wno-unused-parameter")
            .compile("lpmdockmenu");
        println!("cargo:rustc-link-lib=framework=Cocoa");
    }
    tauri_build::build();
}
