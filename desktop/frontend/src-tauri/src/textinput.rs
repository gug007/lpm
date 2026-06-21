// Disable macOS automatic text substitutions (period-on-double-space, smart
// quotes/dashes, text replacements) app-wide. They corrupt the commands, paths
// and prompts typed into the terminal composer — e.g. a double space becomes
// ". ". WKWebView text input honors these standardUserDefaults keys, so clearing
// them before any webview is created turns the substitutions off everywhere.
pub fn disable_smart_substitutions() {
    use objc2::runtime::{AnyObject, Bool};
    use objc2::{class, msg_send};
    use objc2_foundation::NSString;

    const KEYS: [&str; 4] = [
        "NSAutomaticPeriodSubstitutionEnabled",
        "NSAutomaticQuoteSubstitutionEnabled",
        "NSAutomaticDashSubstitutionEnabled",
        "NSAutomaticTextReplacementEnabled",
    ];

    unsafe {
        let defaults: *mut AnyObject = msg_send![class!(NSUserDefaults), standardUserDefaults];
        if defaults.is_null() {
            return;
        }
        for key in KEYS {
            let ns_key = NSString::from_str(key);
            let _: () = msg_send![defaults, setBool: Bool::new(false), forKey: &*ns_key];
        }
    }
}
