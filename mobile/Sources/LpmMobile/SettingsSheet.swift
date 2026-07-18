import SwiftUI

struct SettingsSheet: View {
    @Environment(\.dismiss) private var dismiss
    @AppStorage(AppearanceMode.storageKey) private var appearanceRaw = AppearanceMode.system.rawValue
    @AppStorage(TerminalPrefs.fontSizeKey) private var fontSize = TerminalPrefs.defaultFontSize
    @AppStorage(TerminalPrefs.themeKey) private var themeRaw = TerminalTheme.default.rawValue

    private var theme: TerminalTheme { TerminalPrefs.theme(themeRaw) }

    var body: some View {
        NavigationStack {
            Form {
                Section("Appearance") {
                    Picker("Theme", selection: $appearanceRaw) {
                        ForEach(AppearanceMode.allCases) { mode in
                            Label(mode.label, systemImage: mode.systemImage).tag(mode.rawValue)
                        }
                    }
                }

                Section {
                    Stepper(value: $fontSize,
                            in: TerminalPrefs.minFontSize...TerminalPrefs.maxFontSize) {
                        HStack {
                            Text("Font size")
                            Spacer()
                            Text("\(fontSize)")
                                .foregroundStyle(.secondary)
                                .monospacedDigit()
                        }
                    }
                    Picker("Theme", selection: $themeRaw) {
                        ForEach(TerminalTheme.allCases) { t in
                            Text(t.label).tag(t.rawValue)
                        }
                    }
                    TerminalThemePreview(theme: theme, fontSize: fontSize)
                        .listRowInsets(EdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 16))
                } header: {
                    Text("Terminal")
                } footer: {
                    Text("Font size and color scheme for the built-in terminal.")
                }

                Section {
                    NavigationLink {
                        NotificationSettingsView()
                    } label: {
                        Label("Notifications", systemImage: "bell.badge")
                    }
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .fontWeight(.semibold)
                }
            }
        }
    }
}

/// A small live swatch of the terminal theme — traffic-light dots over a sample
/// command line on the theme's background — so the picker shows what each theme
/// (and font size) looks like, the way the desktop settings do.
private struct TerminalThemePreview: View {
    let theme: TerminalTheme
    let fontSize: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Circle().fill(Color(red: 1, green: 0.37, blue: 0.35)).frame(width: 10, height: 10)
                Circle().fill(Color(red: 1, green: 0.74, blue: 0.18)).frame(width: 10, height: 10)
                Circle().fill(Color(red: 0.24, green: 0.79, blue: 0.29)).frame(width: 10, height: 10)
                Spacer()
            }
            (Text("$ ").foregroundColor(.green)
                + Text("lpm run").foregroundColor(theme.foregroundColor))
                .font(.system(size: CGFloat(fontSize), design: .monospaced))
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.backgroundColor,
                    in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}
