// Rebuild when the injected-version env vars change so `--version` stays in sync
// with a CI release without needing a `cargo clean`. LPM_CLI_VERSION is set by
// scripts/build-cli.sh (which forwards the app's LPM_VERSION); when neither is
// set the crate version is used.
fn main() {
    println!("cargo:rerun-if-env-changed=LPM_CLI_VERSION");
    println!("cargo:rerun-if-env-changed=LPM_VERSION");
}
