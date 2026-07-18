import SwiftUI

/// The terminal font-size + color-theme controls. Shared by the app Settings sheet
/// and the per-terminal quick-settings sheet so both stay in sync (they read the
/// same phone-local @AppStorage keys).
struct TerminalSettingsControls: View {
    @AppStorage(TerminalPrefs.fontSizeKey) private var fontSize = TerminalPrefs.defaultFontSize
    @AppStorage(TerminalPrefs.themeKey) private var themeRaw = TerminalTheme.default.rawValue

    private var theme: TerminalTheme { TerminalPrefs.theme(themeRaw) }

    var body: some View {
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
        Picker("Color scheme", selection: $themeRaw) {
            ForEach(TerminalTheme.allCases) { t in
                Text(t.label).tag(t.rawValue)
            }
        }
        TerminalThemePreview(theme: theme, fontSize: fontSize)
            .listRowInsets(EdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 16))
    }
}

/// A focused sheet for the terminal's own font-size + theme, opened from the
/// terminal screen's nav bar. A medium detent keeps the terminal visible above it,
/// so changes preview live on the terminal behind the sheet.
struct TerminalSettingsSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TerminalSettingsControls()
                } footer: {
                    Text("Font size and color scheme for the terminal. Applies to every terminal on this device.")
                }
            }
            .navigationTitle("Terminal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .fontWeight(.semibold)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

/// A small live swatch of the terminal theme — traffic-light dots over a sample
/// command line on the theme's background — so the picker shows what each theme
/// (and font size) looks like, the way the desktop settings do.
struct TerminalThemePreview: View {
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
