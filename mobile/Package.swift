// swift-tools-version:5.9
import PackageDescription

// Reference manifest for the lpm mobile client. The sources under
// Sources/LpmMobile are the client library (protocol, WebSocket client, view
// models, SwiftUI views). They target iOS 17+ and pull SwiftTerm for terminal
// rendering.
//
// This package does NOT build a shippable app on its own — an iOS app needs an
// Xcode App target (Info.plist, signing, LSApplicationCategory, App Icon). See
// README.md for the one-time Xcode setup. `swift build` on macOS will fail
// because the views use UIKit/iOS-only SwiftUI; build against an iOS
// destination in Xcode.
let package = Package(
    name: "LpmMobile",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "LpmMobile", targets: ["LpmMobile"])
    ],
    dependencies: [
        .package(url: "https://github.com/migueldeicaza/SwiftTerm.git", from: "1.2.0")
    ],
    targets: [
        .target(
            name: "LpmMobile",
            dependencies: ["SwiftTerm"]
        )
    ]
)
