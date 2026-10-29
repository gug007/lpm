# Porting lpm Link to Android

The iOS app (`mobile/ios`, SwiftUI, 213 files / ~45k lines) is the reference. The
Android app must look and behave the same: same screens, strings, fields,
defaults, placement and colors, speaking the same protocol (`mobile/PROTOCOL.md`).
Parity is proven with `mobile/parity` — the same Maestro flows run on both apps
side by side (see `mobile/parity/README.md`).

## Ground rules

- **Strings are copied verbatim from Swift**, including `…`, `—`, `·` and curly
  quotes. Parity flows select by visible text, so a reworded label is a failing test.
- **Every icon-only control gets the same accessible name as on iOS**
  (`contentDescription` / `semantics { contentDescription }`). SwiftUI gives SF
  Symbols default names — `ellipsis` → "More", `plus` → "Add", `chevron.right` →
  "Forward" — so match what `maestro hierarchy` shows on iOS, not the Swift source.
- **No ids in tests.** The iOS app has no `accessibilityIdentifier`s and reports SF
  Symbol names as ids; flows use text only.
- **Same colors, no Material You dynamic color.** Build the theme from the iOS
  palette (terminal themes, action tints, agent-state colors, usage meters).
- **Allowed platform differences** (keep the list short and write each one here):
  system back instead of the nav-bar back button; Android permission dialogs;
  "phone" where iOS copy says "iPhone"/"iPad"; FCM instead of APNs; the platform
  font and Material Symbols instead of SF Pro and SF Symbols (Apple licenses both for
  Apple platforms only); the terminal's soft keyboard sends key events
  (`TYPE_NULL`) because xterm.js loses fast-typed characters from Android's composed
  text input, so the keyboard shows no suggestions there and CJK composition in the
  terminal itself is limited (the composer is unaffected); "Open in Browser" where iOS
  says "Open in Safari" (a created pull request); the file preview shows images, PDFs,
  video and audio in its own viewers, so a file only Quick Look reads (office documents,
  Keynote/Pages/Numbers, SVG, 3D) shows "No preview" with Share, and its code view has
  no Find bar; read aloud's voices are the phone's text-to-speech voices, named by
  language and voice code, and the basic-voices note points to Android's "Text-to-speech
  output" settings (Android's engine can't pause, so resuming starts again at the word
  it stopped on); a terminal opened from a notification or an Activity row stays on
  screen after its tab leaves the list, where iOS shows "Terminal unavailable" (tab
  restore needs the screen to stay, as iOS's tab-list path does); Android 17 keeps an app
  targeting it off the local network until it holds `ACCESS_LOCAL_NETWORK`, so the app asks
  for it ("nearby devices") when the pairing screen opens, or at launch with a Mac saved,
  where iOS shows Local Network on first use by itself — a refusal shows iOS's "Allow Local
  Network access" row; a notification's Deny button isn't red (Android has no
  destructive notification action), and the agents-at-work card is an ongoing
  notification where iOS shows a Live Activity, so its Settings → Notifications
  section is "Live updates" with "While agents work, an ongoing notification shows
  them." under it; that notification's text can't wear the widget's state colors and
  marks, so its accent color carries the state and a tab with a problem reads
  "problem" before its time; a finished agent under a project archives on a full swipe
  (`SwipeToDismissBox`), where iOS can also stop halfway on an Archive button; Android has
  no Focus filters, so the Quiet hours footer ends after its first sentence, and quiet
  notifications go to a "Quiet hours" channel without sound or heads-up where iOS delivers
  them passively; the app lock checks with the phone's screen lock (fingerprint, face or
  PIN), so Settings › Security reads "Require screen lock" and the cover's button
  "Unlock" where iOS names Face ID, and the lock also blanks the recent-apps preview.
- **Same persisted keys and semantics** as iOS (table below), so behavior and
  defaults match.
- Desktop changes that touch the phone now update both apps (AGENTS.md).

## Toolchain (installed and verified on this Mac)

| Piece | Version / location |
|---|---|
| JDK | Gradle daemon on **21** (`gradle/gradle-daemon-jvm.properties`, downloaded by Gradle if missing); bytecode target 17. Robolectric needs 21 for SDK 37 |
| Gradle wrapper | 9.8.0 (`gradle/wrapper`, distribution SHA-256 pinned) |
| Android Gradle Plugin | 9.4.1 (built-in Kotlin) |
| Kotlin / Compose compiler | 2.4.21 |
| Compose BOM | 2026.09.00 (needs compileSdk 37) |
| Hilt / KSP | 2.60.1 / 2.3.12 |
| SDK | compile/target 37, `minSdk 26` |
| Android CLI | `$ANDROID_HOME/cmdline-tools/latest/bin/android` (sdk, emulator, layout, screen, docs) |
| Emulator | 37.2.12, AVD `lpm_parity` (Pixel 9 Pro, API 36 Google Play image, arm64) |
| NDK | r30 (`ndk/30.0.16248370`), pinned in build-logic so native libraries are stripped |
| gomobile / gobind | pinned as `tool`s in `tailnet/android/go.mod`; `:core:tailnet`'s `bindTailnet` task runs them (arm64 + x86_64, ~50 s cold, cached after; needs Go: `brew install go`) |
| Maestro | 2.11.0 — drives both the iOS simulator and the emulator |
| Agent skills | `.claude/skills/{android-cli,navigation-3,edge-to-edge}` (official, via `android skills add`) |

`node mobile/parity/parity.js doctor` re-checks all of it.

```sh
cd mobile/android
./gradlew spotlessApply                               # format (ktlint + Compose rules)
./gradlew check assembleRelease -PwarningsAsErrors=true  # what CI runs
./run.sh                                              # install + launch on a device/emulator
node ../parity/parity.js all --open                   # both apps, all flows, side-by-side report
```

## Architecture

Google's [recommendations for Android architecture](https://developer.android.com/topic/architecture/recommendations)
(`android docs fetch kb://android/topic/architecture/recommendations`), applied to a
port. **Port behavior, not structure**: the screens, strings and protocol match iOS;
the code is idiomatic Android.

- **Data layer.** Repositories are the single source of truth and expose `Flow` /
  `StateFlow`. One session per active Mac owns the connection (real client or
  `DemoServer`) and routes inbound frames into the repositories. iOS's `AppModel` is
  one observable object: its state goes to repositories, its screen logic to ViewModels.
- **UI layer.** One `@HiltViewModel` per screen exposing `uiState: StateFlow<…UiState>`
  (`stateIn(viewModelScope, WhileSubscribed(5_000), …)`), collected with
  `collectAsStateWithLifecycle()`. User actions are ViewModel calls; results come back
  as state, never as one-off events. Reusable composables take state and lambdas, no
  ViewModels. No domain layer up front; add a use case only when two ViewModels need
  the same logic.
- **DI.** Hilt. Interfaces with `Default…` implementations bound with `@Binds`; fakes
  for tests (prefer fakes to mocks). Demo Mode is a transport chosen at runtime, not a
  test double.
- **Navigation.** Single activity, Navigation 3: `@Serializable` `NavKey`s in
  `:core:navigation`, entries contributed by each feature, ViewModels scoped to entries
  (`lifecycle-viewmodel-navigation3`). Predictive back is on (targetSdk 36+). iOS ships
  on iPad, so tablets and foldables get a list-detail scene (Material 3 adaptive), not a
  stretched phone layout.
- **UI.** Compose + Material 3 themed from the iOS palette, edge-to-edge. Strings live
  in each module's `res/values/strings.xml`, copied verbatim. Every icon-only control
  has a `contentDescription`; touch targets are at least 48 dp.
- **Concurrency.** Coroutines and Flow; dispatchers injected; long-lived work in an
  injected application scope, never `GlobalScope`.
- **Storage and security.** Preferences DataStore with the iOS key names; credentials
  encrypted with an Android Keystore AES-GCM key (not the deprecated
  EncryptedSharedPreferences). Cleartext is off (`network_security_config.xml`) because
  every connection is `wss://` with a pinned certificate. App data is excluded from cloud
  backup and device transfer: Keystore keys never leave the device, so copied credentials
  could not be decrypted on a new phone.

### Porting patterns

How each iOS construct lands, so every feature is ported the same way:

| iOS | Android |
|---|---|
| `AppModel` core: connection, saved Macs, pairing, Demo Mode, identity, push | `MacSession` (`:core:data`); owns the `LpmClient`, exposes `state: StateFlow<SessionState>`, `link: LinkStore`, `alerts`, `whenConnected(verb, project) { client -> }` |
| An `AppModel` area (its properties, its `wireX(_:)`, its methods) or an iOS `*Store` class | one store per area, exposing one `StateFlow<XState>` (an immutable data class whose defaults are the iOS initial values) plus methods; it mutates with `_state.update { it.copy(…) }` |
| `wire(c)` assigning `c.onX = { … }` | the store implements `SessionStore` (`wire(client)`, `reset()`, optional `onReady(client)` / `onConnectionReset()`) and takes its `MacSession` in the constructor; contribute `SessionStore.Factory(::XStore)` with Hilt `@IntoSet`. Every session (the live one and each machine visit, iOS's second `AppModel`) builds its own store set; `session.store<XStore>()` |
| A view reading `model` inside a visit | `NavKey`s carry `session: SessionKey = SessionKey.Live`; ViewModels use the Navigation 3 assisted pattern (`hiltViewModel<VM, VM.Factory>(creationCallback = { it.create(key) })`) and resolve `MacSessions[key.session]?.store<XStore>()` |
| Main queue | everything runs on the main thread: the client delivers callbacks on `Dispatchers.Main.immediate`, stores need no locking |
| `DispatchQueue.main.asyncAfter`, `DispatchWorkItem`, `GenerationTimeout` | `Job`s in the injected `@ApplicationScope` `CoroutineScope` (Main.immediate), cancelled where Swift cancels |
| UserDefaults | `AppPreferences` over Preferences DataStore with the same keys, loaded before the first frame (splash `setKeepOnScreenCondition`), then read synchronously from memory and written asynchronously |
| Keychain | `CredentialStore`: Keystore AES-GCM, ciphertext in DataStore |
| SwiftUI `View` reading `model` | `XScreen` (stateless: state + lambdas) + `XRoute` (`hiltViewModel()`), the ViewModel combining store flows into `XUiState` and forwarding actions to stores |
| `@State` / `@Binding` inside a view | `remember { mutableStateOf(…) }` / state + lambda parameters |
| `NavigationStack` push | Navigation 3 back stack; `@Serializable` `NavKey`s in `:core:navigation` (`<Feature>Keys.kt` when a feature has several, `<Key>.kt` for a single one, as ktlint names files); each feature exposes `fun EntryProviderScope<NavKey>.xEntries(navigator: Navigator)`, registered in `:app` `LpmApp` |
| `.sheet`, `Menu`, `.alert`, `.confirmationDialog` | the `:core:designsystem` sheet, menu and dialog components |
| SF Symbol | Material Symbols Rounded (`tools/add-icon.sh`, table in `core/designsystem/ICONS.md`) |

### Modules

Modularized by layer and feature; create a module when its milestone starts.

| Module | Kind | Holds |
|---|---|---|
| `:app` | application | `LpmApplication`, `MainActivity`, the `NavDisplay` |
| `:core:model` | JVM | data types shared by every layer (`MacRecord`, projects, services, jobs…) |
| `:core:protocol` | JVM | wire frames (kotlinx.serialization), client interface, OkHttp WebSocket + pin |
| `:core:demo` | JVM | `DemoServer` and the seed |
| `:core:data` | Android | repositories, Mac session, DataStore, Keystore, NSD discovery, connectivity |
| `:core:navigation` | JVM | `NavKey`s |
| `:core:designsystem` | Android | theme, iOS palette, shared components (exists) |
| `:core:ui` | Android | shared UI that needs domain types (agent tones, elapsed time, notification access) |
| `:core:web` | Android | WebView host, `WebViewAssetLoader`, the `window.webkit` shim |
| `:core:testing` | Android | fakes, test rules, Hilt test runner |
| `:core:push`, `:core:tailnet` | Android | FCM, built-in Tailscale |
| `:feature:<name>` | Android | screens + ViewModels, one per row of the feature map |

### Build setup

- `build-logic/` convention plugins: `lpm.android.application`, `lpm.android.library`
  (namespace from the module path), `lpm.android.compose`, `lpm.android.feature`
  (library + Compose + Hilt + lifecycle + Navigation 3 + `:core:designsystem`),
  `lpm.hilt` (KSP; Android or JVM), `lpm.jvm.library` (Kotlin JVM + lint),
  `lpm.spotless`. A new feature module's build file is
  `plugins { alias(libs.plugins.lpm.android.feature) }`.
- Versions only in `gradle/libs.versions.toml`; projects referenced as
  `projects.core.data`.
- Strict by default: lint warnings are errors (only version-bump nags are off), Kotlin
  warnings are errors with `-PwarningsAsErrors=true` (CI), ktlint (`android_studio`
  style + Compose rules) on every module.
- Release: R8 with resource shrinking; App Bundle for Play.
- CI: `.github/workflows/android.yml` runs `check assembleRelease` on changes to
  `mobile/android` or `mobile/shared`.

## Testing

| Layer | Where | Tools |
|---|---|---|
| Unit | `src/test`, JVM | JUnit 4, kotlinx-coroutines-test, Turbine; ViewModels asserted through `uiState.value`; protocol tests fed with PROTOCOL.md frames |
| UI behavior | `src/test`, Robolectric | Compose test APIs with `androidx.compose.ui.test.junit4.v2.createComposeRule` (v1 is deprecated); semantic matchers before test tags; state restoration |
| Screenshot | — | Compose Preview Screenshot Testing as an AGP test suite once AGP 9.5 is stable (9.4.1 has only the deprecated standalone plugin) |
| End to end | `mobile/parity` | Maestro flows on both apps — the acceptance test for every milestone |

Coverage: `createDebugUnitTestCoverageReport` (Android modules), `jacocoTestReport`
(JVM modules). Workarounds kept in build-logic, each with the reason: Robolectric 4.17
needs `--add-exports java.base/jdk.internal.access` on SDK 37 (robolectric#11434), and
Compose's test library still pulls Espresso 3.5, which breaks on API 34+, so androidx.test
is pinned to current.

### iOS → Android

| iOS | Android |
|---|---|
| `LpmMobileApp` + `ContentView` (Views.swift), `NavigationPath` | `MainActivity` + `NavDisplay` over a Navigation 3 back stack |
| `AppModel` (@Observable, 3.1k lines, `AppModel+*.swift`) | repositories in `:core:data` + one ViewModel per screen |
| `LpmProtocol.swift` (`Wire.*` builders, `Inbound.parse`) | `:core:protocol`: kotlinx.serialization, same message names and fields |
| `LpmClient` (URLSessionWebSocketTask, TLS pin/TOFU, ping, backoff, 16 MB frames, send queue) | `:core:protocol`: OkHttp WebSocket, `X509TrustManager` checking only the SHA-256 pin |
| `DemoServer` + `Demo*.swift` (in-process fake Mac answering 127 `t` values) | `:core:demo`: same fake, same seed — **ported first**, it backs every parity flow |
| SwiftUI sheets / menus / alerts | `ModalBottomSheet` / `DropdownMenu` / `AlertDialog`, same titles and button order |
| WKWebView + `web/terminal.html` (xterm.js), `window.webkit.messageHandlers` | `:core:web`: WebView + `WebViewAssetLoader` on `assets/web/` (from `mobile/shared/web`) and a JS shim exposing `window.webkit.messageHandlers.*` so `terminal.html`/`markdown.js` run unchanged |
| Keychain (`cx.lpm.mobile`, `cx.lpm.mobile.push`) | Keystore AES-GCM key encrypting a DataStore entry |
| UserDefaults | Preferences DataStore with the same key names |

## Feature map

Port order is top to bottom within each milestone below. Lines are iOS sizes.

| Feature → Android module | iOS files | Lines |
|---|---|---|
| Core shell, model, wire, client → `:app`, `:core:model`, `:core:protocol`, `:core:data` | LpmMobileApp, AppModel(+…), LpmProtocol, LpmClient, Views, SessionAlerts, GenerationTimeout, ThisDevice | 7,983 |
| Demo Mode → `:core:demo` | DemoServer, DemoWorld, DemoProjects, DemoTerminals, DemoGit, DemoGitAuto, DemoJobs, DemoConfig, DemoMemory, DemoNotes(+Fixtures), DemoStats, DemoLimits, DemoClaudeAccounts, DemoAutoPull, DemoServiceLogs, DemoUploads | 5,883 |
| Pairing → `:feature:pairing` | PairingView, EnterCodeView, QRScannerView, ApprovalPairingSheet, NearbyMacsView, AwayFromHomeCard, PairedSummarySheet, IdentityCheckSheet, Keychain | 1,461 |
| Connection / discovery → `:core:data`, `:feature:connection` | MacDiscovery, HostProbe, NetworkWatcher, LinkStore, AppModel+Link, ConnectionIssue, ConnectionSheet(s), ConnectionStatusBar, EditEndpointView, AddressKind, ProjectSnapshots | 2,312 |
| Machines, lpm updates → `:feature:mac`, `:feature:projects` (machine sections, visits), `:core:data` (MachineImporter) | MacRecord, MacStore, MacSwitcherMenu, MacTitle, ManageMacsView, MacUnpair, MacUpdate*, MachineHeader/Importer/Section, MachineVisitScreen, AppModel+Visit, RemoteMachine, PairDirectlyMenuItems | 1,947 |
| Projects, services, Auto Pull → `:feature:projects` | ProjectDetailView, ProjectMenu, ProjectAgents, ProjectTerminalDeck/Row, DuplicateOptionsView, ProjectConfigErrorView, WorkStatus*, ServiceEditorSheet, ServiceLogsSheet, AutoPullMenu, AutoPullModel, AppModel+AutoPull | 2,287 |
| Project config → `:feature:config` | ProjectConfigView, YamlConfigEditorSheet, ProfileEditorSheet, AddProjectSheet, DirBrowserView, CodeEditorTextView | 1,192 |
| Terminal + composer → `:feature:terminal`, `:core:web` | WebTerminalView, WKWebView+NoAccessoryBar, TerminalScreens, TerminalTitle, TerminalTheme, TerminalSettingsSheet, TerminalEndedBanner, TabRow, TabPeek, KeyboardSteadyFrame, WindowTouchObserver, TerminalComposer, ComposerStore(+Files), ComposerAttachments, ComposerTabStrip, ComposerActionsSheet, ComposerVariantsSheet, HistoryScreen, ChunkedUpload, UploadScratch, PlainPunctuation, HardwareReturn | 3,844 |
| Actions → `:feature:actions` | ActionColorPicker, ActionEditorSheet, ActionInputsSheet, ActionPlacement, ActionTint, ActionZoneView, ActionZones, DesktopActionButton, ProjectActionsSheet(+Host), BackgroundRunSheet | 1,840 |
| Activity → `:feature:activity` | ActivityBuild, ActivityChrome, ActivityModel, ActivityRowViews, ActivityScreen, AgentStateStyle | 1,322 |
| Automations → `:feature:automations` | AutomationConversationView, AutomationDetailRows, AutomationDetailView, AutomationEditorSheet, AutomationFormat, AutomationViews | 2,283 |
| Git → `:feature:git` | GitReviewView, GitFileSection, GitReviewParts, GitCommitSheet, GitCommitFilesPage, CommitDraftRow, CommitButtons, GitPrSheet, GitReviewStore, GitBranchSheet, GitAutoSheet, GitAutoStore, GitNotice, GitOpError, DiffHighlighter, DiffRendering, AgentAskSheet | 3,359 |
| Notes → `:feature:notes` | NotesScreen, NotesChatView, NotesComposer, NotesMessageRow, NotesAttachmentView, NotesSearchStore, NotesStore, NotesTypes, NoteAttachmentStore | 1,736 |
| Memory → `:feature:memory` | MemoryScreen, MemorySessionView, MemoryCreateSheet, MemoryEditorSheet, MemoryStore, MemoryTypes, ComposerMemorySheet | 1,167 |
| Files / preview → `:feature:files`, `:core:web` | FileFetch, FilePreviewContent, FilePreviewKind, FilePreviewPlatformViews, FilePreviewSheet, MarkdownWebView, MarkdownImageLoader, MarkdownLink | 854 |
| Usage / stats, Usage and Token activity widgets → `:feature:usage` | Usage*, StatsFormat, StatsScreen, TokenActivityFeed, Shared/TokenActivityStore, Shared/UsageNumbers, Shared/UsageWindows, Shared/UsageWidgetStore, Widgets/TokenActivityWidget, Widgets/TokenActivityView, Widgets/UsageWidget, Widgets/UsageWidgetView | 3,090 |
| Claude accounts → `:feature:claudeaccount` | ClaudeAccountConsent, ClaudeAccountMenu, ClaudeAccountModel, ClaudeInUse, AppModel+ClaudeAccount | 493 |
| Speech (read aloud) → `:feature:speech` | SpeechBar, SpeechClip, SpeechPrefs, SpeechSettingsView, SpeechStore, SpeechText | 1,171 |
| Settings → `:feature:settings` | SettingsSheet, AppearanceMode | 112 |
| Push → `:core:push` | AppDelegate, PushRegistrar, NotificationSettingsSheet, Shared/PushKey, Shared/PushPayload, NotificationService | 661 |
| Built-in Tailscale → `:core:tailnet` | BuiltInTailscale, TailnetSettingsView (+ Go `tailnet/`) | 452 |
| Widgets → `:feature:widgets`, `:core:data` (`AgentWidgetStore`), `:core:model` (`AgentWidget`) | Widgets/AgentListWidget, Widgets/AgentListView, Shared/AgentWidgetStore, AppModel+Widget | 472 |
| Shared UI → `:core:designsystem`, `:core:ui` | DarkKeyboard, ElapsedText, FollowingScrollView, Haptics, KeyboardObserver, MarkdownText, SkeletonViews, SwipeDownDismissesKeyboard, SafariView | 688 |

## Platform services

| iOS | Android |
|---|---|
| APNs + Notification Service Extension (decrypts AES-GCM payload, rewrites text) | FCM **data** messages decrypted in `FirebaseMessagingService`, notification posted by the app; `POST_NOTIFICATIONS` on 13+ |
| Notification categories (Allow / Deny / Reply, `authenticationRequired`) | notification actions to `AnswerReceiver` (`goAsync`, `RemoteInput` for Reply, `setAuthenticationRequired`); the answer goes over the live link or a short-lived connection (`AgentAnswers`, `MacErrand`) |
| ActivityKit Live Activity (Lock Screen, Dynamic Island), updated by `liveactivity` pushes | one ongoing notification per Mac on the "Agents at work" channel (`LiveNotifier`), requesting promotion to a Live Update (Android 16, `POST_PROMOTED_NOTIFICATIONS`); fed by the live link (`LivePublisher`) and FCM `liveactivity` data messages alike |
| `NWBrowser` Bonjour `_lpm._tcp` (TXT `id`, `name`, `v`, `rp`, `dev`) | `NsdManager` + `MulticastLock` |
| `NWPathMonitor` | `ConnectivityManager.NetworkCallback` |
| AVFoundation QR scanner | CameraX + ML Kit barcode scanning |
| AVSpeechSynthesizer / AVAudioPlayer / Now Playing | `TextToSpeech`, Media3 + `MediaSession`, `mediaPlayback` foreground service |
| SFSafariViewController | Custom Tabs |
| PhotosPicker / camera / fileImporter | Photo Picker, `TakePicture`, `OpenMultipleDocuments` |
| ShareLink / QuickLook / AVKit | `ACTION_SEND` + FileProvider; in-app renderers + Media3 |
| Swift Charts (Stats) | Compose Canvas |
| Haptics | `HapticFeedback` |
| WidgetKit (Agents widget: app-group file the app and notification extension write, a timeline reading a minute) | Glance (`:feature:widgets`): a file in `filesDir` the live session and FCM write, redrawn by an inexact non-wakeup alarm each minute while a time is counting |
| WidgetKit (Usage widget: app-group file the app writes while a Mac is live, with each row's windows so the widget keeps the countdowns moving; a timeline entry a minute for an hour) | Glance (`:feature:usage`): a file in `filesDir` the live session writes, redrawn by an inexact non-wakeup alarm each minute while it has rows |
| WidgetKit (Token activity widget: app-group file the app writes after a 30-day `stats` read; its pills run an App Intent in the widget; a timeline entry at midnight) | Glance (`:feature:usage`): a file in `filesDir` the live session writes; the pills run an `ActionCallback`; `updatePeriodMillis` of an hour moves "Today" past midnight |
| Keyboard handling (steady terminal frame, hardware Return sends, no smart punctuation) | `WindowInsets.ime`, `onPreviewKeyEvent`, `KeyboardOptions(autoCorrectEnabled = false)` |
| Embedded Go `LpmTailnet` static lib | `gomobile bind` AAR from a new `tailnet/android` module (own `go.mod` with `replace lpm.cx/tailnet => ..` and `tool golang.org/x/mobile/cmd/gobind`, so the desktop sidecar's module stays clean). Android 11+ blocks netlink, so register a netmon interface getter fed from `ConnectivityManager` (the role `defaultroute_darwin.go` plays on iOS). The `.so` is already 16 KB page-aligned, as Play requires for native code |

Manifest needs: `INTERNET`, `ACCESS_NETWORK_STATE`, `CHANGE_WIFI_MULTICAST_STATE`,
`CAMERA`, `POST_NOTIFICATIONS`, `POST_PROMOTED_NOTIFICATIONS`,
`FOREGROUND_SERVICE_MEDIA_PLAYBACK`; cleartext is not needed (the Mac speaks `wss` with
a pinned self-signed cert). Not used on iOS, so not needed here: background tasks, app
intents beyond the Token activity widget's pills, speech recognition, biometrics.

## Persisted state (same keys)

| iOS | Key | Contents |
|---|---|---|
| Keychain `cx.lpm.mobile` | `device-credential.<localId>` | `{"deviceId","token"}` per Mac |
| Keychain `cx.lpm.mobile` | `cert-pin.<localId>` | lowercase hex SHA-256 of the Mac's leaf cert |
| Keychain `cx.lpm.mobile` | `phone-id` | this install's lowercase UUID, minted once, sent as `phoneId` in every first frame and `unpair` |
| Keychain `cx.lpm.mobile.push` | `push-key` | 32 random bytes, one per phone, registered with every Mac |
| UserDefaults | `lpm.macs`, `lpm.activeMacId`, `lpm.machineImports`, `lpm.machineImportsRevoked` | saved Macs (`MacRecord` JSON), active Mac, machine-import ledger, machines that removed this phone |
| UserDefaults | `lpm.push.registered.<localId>` | last acknowledged push registration |
| UserDefaults | `lpm.notify.enabled` / `.waiting` / `.done` / `.error` / `.automation.started` / `.automation.done` / `.automation.error` / `.liveActivity` | missing = on, except `automation.started` (off) |
| Android only | `liveActivity.dismissed` | Macs whose agents-at-work card was swiped away, kept off until their agents are done (iOS's system ends a dismissed Live Activity) |
| UserDefaults | `appearanceMode`, `terminalFontSize` (12, 8–24), `terminalTheme` (`claude-dark`) | appearance |
| UserDefaults | `speech.engine`, `speech.voiceId`, `speech.rate` | read aloud |
| UserDefaults | `builtInTailscale.enabled`, `pairing.usesTailscaleApp` | Tailscale |
| UserDefaults | `activity.groupByProject`, `automation.scheduleOpen`, `automation.setupOpen`, `filePreviewMarkdownSource`, `actionPrimaryLastUsed`, `zoneOpenLayers`, `newTab.lastPick`, `gitReview.wrap` (missing = on), `macUpdate.dismissed.<id>` | UI memory |
| Files | `Caches/project-lists/<localId>.json`; `ApplicationSupport/tailnet/` (no backup) | offline project list; tailnet state (`noBackupFilesDir`) |
| App group `group.cx.lpm.mobile` | `token-activity.json` (Android: `filesDir`); UserDefaults `tokenActivity.range` (7, 14 or 30; missing = 7) | the Token activity widget's last 30-day read and the range its pills picked |
| App group `group.cx.lpm.mobile` | `usage-widget.json` (Android: `filesDir`) | the Usage widget's rows from the Mac last live, and when the phone last had them |

## Demo Mode

The only entry is **"No Mac nearby? Try the demo"** on the root pairing screen
(`model.enterDemo()`); "Exit" on the "Demo — sample projects" banner, "Exit Demo" in
the Mac menu, or "Add a machine…" leaves it. Nothing persists. `DemoServer` receives
every frame `LpmClient` would send and answers with protocol frames through the normal
inbound path, after `ready` from serverId `demo-mac` / "Demo Mac". The seed:
projects `storefront` (running; web, api running, worker stopped; Terminal 1 + a
scripted Claude session), `api-gateway`, `mobile-app`, folder "Client Work" (`blog`,
`design-system`); git changes on `storefront`; jobs "Nightly tests" and "Weekly
dependency check"; notes, memory, history, Claude accounts, usage and stats.

Port the server and seed as-is so the same flows see the same data. Seed dates are
relative to now, so a few numbers shift between runs.

## Milestones

Each one: write or extend the parity flows first and make them pass on iOS, then
build Android until the same flows pass there.

| # | Scope | Parity flows |
|---|---|---|
| 0 | Scaffold, toolchain, harness, build-logic, CI (done) | the harness itself (`parity.js`) |
| 1 | `:core:model`, `:core:protocol`, `:core:demo` (iOS golden replay), `:core:data`, `:core:navigation` (done) | — (unit tests against PROTOCOL.md frames and the iOS demo goldens) |
| 2 | Pairing screen, Enter a Code, demo entry/exit (done) | 01, 02, 12–16 |
| 3 | Projects list, project detail, project menu, services (done) | 03–05, 30–34 |
| 4 | Terminal (WebView + shim) and composer (done) | 06, 17 |
| 5 | Activity, Automations, Stats, Usage, Settings (done) | 07–11, 35–37, 40–42, 45–47 |
| 6 | Git review (50–55), Notes and Memory (60–66), Actions (70–76), config editors (80–87), file preview (90–94), Claude accounts and Auto Pull (95–99), speech (100–101), machines and lpm updates (unit and Robolectric tests: Demo Mode has neither) (done) | as listed |
| 7 | Real Mac: OkHttp client + pin, Bonjour, QR, approve-on-Mac, reconnect (done on the emulator against the desktop app: Bonjour, approve-on-Mac, Enter a Code at `10.0.2.2`, services, logs, terminal, Git commit, reconnect after a network drop, a cold start, a Mac restart and backgrounding, and the R8 release build; QR with a real camera and a physical phone still untested) | by hand against an isolated debug desktop app (`.claude/skills/app-review-video/scripts/review.js setup`, port 8792; a code from `remote_start_pairing` through its `eval`) |
| 8 | Push (FCM) (done: `PushRegistrar` registers the FCM installation ID over the live link with `pushToken` and sweeps the other saved Macs; `:core:push` opens the sealed blob, posts it on the channel of its Settings → Notifications kind, withdraws cleared and stale ones, and a tap opens the project, terminal or automation on its Mac. Verified on an emulator signed in to Google, through a local relay: registration, delivery, tap-through, withdrawal. firebase-messaging 26 needs Google Play services 26.12+; an emulator without a Google account gets no FCM ID) | needs the items below |
| 9 | Built-in Tailscale (done: `tailnet/android` bound with gomobile, `DefaultBuiltInTailscale` mirroring iOS — switch, sign-in, restart after the app was frozen, network changes, loopback bridge routing. Verified on a 16 KB-page emulator: signed in, connected, reached a Mac at its tailnet address through the bridge, and sign-out left the tailnet) | `tailnet/android` |

## Decisions

1. **Push: FCM data messages**, the only push channel on Play devices. The payload stays
   the AES-GCM blob iOS decrypts; the app decrypts it and posts the notification on
   channels matching the `lpm.notify.*` toggles. The protocol gets a platform-neutral
   registration (`pushToken` + `platform: "apns" | "fcm"`) beside `apnsToken`, which
   stays for existing iOS clients, and the relay (`website/app/api/push`) gets an FCM
   HTTP v1 sender: a desktop + website + PROTOCOL.md change in milestone 8. Built that
   way: the phone sends `pushToken` with `platform: "fcm"` and no `env`; the desktop
   keeps the token in the device record's `apns_token` beside `push_platform: "fcm"`
   and posts `platform: "fcm"` to the relay, which sends a data-only FCM v1 message
   (Vercel env `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`). The app reads
   `app/google-services.json` (gitignored) into the resource values the google-services
   plugin would write; a build without it runs with no push, and `bundleRelease`
   refuses to build without it.
2. **Play: App Bundle, Play App Signing**, with a separate upload key kept outside the
   repo. Package `cx.lpm.mobile`, the iOS bundle id; it can't change after the first upload.
3. **Demo seed: kept identical by a test, not shared.** `:core:demo` is a line-by-line
   port of `Demo*.swift`, and `IosParityTest` replays a fixed script of 415 frames into it
   and compares every reply with goldens recorded from the iOS demo code itself, compiled
   on a Mac (`core/demo/ios-parity/generate.sh`, needs `swiftc`). A change to
   `Demo*.swift` is ported to `:core:demo` and the goldens regenerated in the same change;
   any difference fails the test. Moving the static seed into shared JSON stays possible
   but isn't needed for parity. Binary sample files live once in `mobile/shared/demo`
   (bundled by iOS as `demo/`, read by `:core:demo` as resources), e.g. the Notes
   attachment `summary-card.png`.
4. **Icon-only controls** (list below) get the same accessible name on both apps in the
   change that ports their screen; iOS gains VoiceOver labels.
5. **Tailscale ABIs: `arm64-v8a` + `x86_64`** (emulators, ChromeOS). Play delivers only
   the device's ABI from the bundle (~21 MB of native code). A 32-bit phone gets no
   `libgojni.so`: the node reports itself unavailable there and every address is dialed
   directly, as with the Tailscale app.
6. **Desktop links**: a Play link joins the App Store one in
   `desktop/frontend/src/mobile/links.ts` at release.

Needs an account:

- **Firebase project** `lpm-link` (Spark plan, no Analytics), Android app `cx.lpm.mobile`.
  Its `google-services.json` goes in `app/` (gitignored). The relay's service-account key
  lives only in Vercel (`FCM_*`, Production).
- **Play Console.** A personal account created after 13 Nov 2023 must run a closed
  test with at least 12 opted-in testers for 14 consecutive days before production;
  organization accounts are exempt. Start the closed test once milestone 3 works.

## Play release

- **Upload key**, made once and kept outside the repo (back it up; Play App Signing holds
  the app signing key, and a lost upload key can be reset in Play Console):
  `keytool -genkeypair -keystore ~/keys/lpm-upload.jks -alias upload -keyalg RSA -keysize 4096 -validity 10000`.
  Then in `~/.gradle/gradle.properties`: `lpmUploadStoreFile`, `lpmUploadStorePassword`,
  `lpmUploadKeyAlias`, `lpmUploadKeyPassword` (CI: `ORG_GRADLE_PROJECT_lpmUpload…`).
- **Build**: `./gradlew bundleRelease` → `app/build/outputs/bundle/release/app-release.aab`.
  It refuses to run without the upload key or `google-services.json`; `assembleRelease`
  (CI) still builds unsigned. Bump `versionCode` for every upload; `versionName` follows
  iOS's `MARKETING_VERSION`.
- **Data safety** (matches lpm.cx/privacy): data is encrypted in transit; no account, so
  nothing to delete. Collected, all by Google SDKs, none shared, none for ads:
  - *Device or other IDs* — the FCM installation ID (App functionality, optional: only once
    notifications are allowed) and ML Kit's per-install ID (Analytics).
  - *App info and performance → Diagnostics* — ML Kit's device model, Android version, app
    version and scan timings (Analytics).
  - Photos, files and terminal text go only to the user's own paired computer, never to us.
- **Store listing**: 512 px icon, 1024×500 feature graphic, phone screenshots (Demo Mode,
  as for iOS), privacy policy `https://lpm.cx/privacy`; then add the Play link beside the
  App Store one in `desktop/frontend/src/mobile/links.ts`.

## iOS controls with no accessible name

Flows can't reach these by text until both apps label them the same way (adding
the label on iOS also helps VoiceOver). Done: the composer's send ("Send"), key bar
("Up", "Down", "Left", "Right", "Hide keyboard"), attachment "Remove",
prompt tab "Close", mention "Preview", history "New folder", the Git review jump
menu ("Jump to file"), per-file "Viewed" (valued On/Off) / "More", the commit
sheet's file rows (named by path, valued Included/Excluded) and the branch sheet's
"New branch", Notes "New Chat", error-banner "Close",
"Attach", "Send", "Remove", "Download" and the memory picker's "Preview" eye. Still
unlabeled: composer rewrite run and variant steppers; QR scanner close. The project
"…" menu already reads "More" through SwiftUI's default symbol label.
