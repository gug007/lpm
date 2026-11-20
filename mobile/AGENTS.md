# lpm Link

iOS is the reference. Any change to one app goes into the other in the same change, so both look and behave the same. `mobile/README.md` has the layout and how to build and run each app.

- iOS: the `.xcodeproj` is generated — run `xcodegen generate` in `mobile/ios` after adding files
- Android (Kotlin, Compose, Hilt, Navigation 3; modules built from the `build-logic`
  convention plugins) is a port of the iOS app on Google's architecture
  recommendations: read `mobile/android/PORTING.md` first. In `mobile/android` run
  `./gradlew spotlessApply`, then `./gradlew check assembleRelease`
- Demo Mode's seed is `mobile/ios/Sources/LpmMobile/Demo*.swift`, mirrored in
  `mobile/android/core/demo`: change both, then regenerate the Android goldens with
  `core/demo/ios-parity/generate.sh`
- Keep each feature's flow in `mobile/parity/flows` passing on both apps
  (`node mobile/parity/parity.js all --open` runs them side by side)
