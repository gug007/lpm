package cx.lpm.mobile.gallery

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import cx.lpm.mobile.core.designsystem.component.ListDefaults
import cx.lpm.mobile.core.designsystem.component.ListSection
import cx.lpm.mobile.core.designsystem.component.LpmTopBar
import cx.lpm.mobile.core.designsystem.component.NavigationRow
import cx.lpm.mobile.core.designsystem.theme.LpmTheme

internal enum class GalleryScreen(val key: String, val title: String) {
    Index("index", "Gallery"),
    Pairing("pairing", "Connect to your Mac"),
    Projects("projects", "Projects (demo header)"),
    Detail("detail", "Project detail"),
    Menu("menu", "Project menu"),
    Automations("automations", "Automations"),
    Settings("settings", "Settings sheet"),
    Terminal("terminal", "Terminal bar (dark)"),
    Controls("controls", "Controls"),
    WebTerminal("webterminal", "Terminal (xterm.js)"),
    Markdown("markdown", "Markdown preview"),
    FilePreview("filepreview", "File preview viewers")
}

@Composable
internal fun Gallery(start: GalleryScreen, modifier: Modifier = Modifier) {
    var screen by rememberSaveable { mutableStateOf(start) }
    BackHandler(enabled = screen != GalleryScreen.Index) { screen = GalleryScreen.Index }
    val back = { screen = GalleryScreen.Index }
    Box(
        modifier
            .fillMaxSize()
            .background(LpmTheme.colors.systemGroupedBackground)
    ) {
        when (screen) {
            GalleryScreen.Index -> GalleryIndex(onOpen = { screen = it })
            GalleryScreen.Pairing -> PairingSample()
            GalleryScreen.Projects -> ProjectsSample(showSettings = false)
            GalleryScreen.Detail -> ProjectDetailSample(onBack = back, menuOpen = false)
            GalleryScreen.Menu -> ProjectDetailSample(onBack = back, menuOpen = true)
            GalleryScreen.Automations -> AutomationsSample(onBack = back)
            GalleryScreen.Settings -> ProjectsSample(showSettings = true)
            GalleryScreen.Terminal -> TerminalBarSample(onBack = back)
            GalleryScreen.Controls -> ControlsSample(onBack = back)
            GalleryScreen.WebTerminal -> WebTerminalSample(onBack = back)
            GalleryScreen.Markdown -> MarkdownSample(onBack = back)
            GalleryScreen.FilePreview -> FilePreviewSample(onBack = back)
        }
    }
}

@Composable
private fun GalleryIndex(onOpen: (GalleryScreen) -> Unit, modifier: Modifier = Modifier) {
    Column(modifier.verticalScroll(rememberScrollState())) {
        LpmTopBar(title = "lpm Gallery")
        Column(Modifier.padding(top = ListDefaults.ContentTopPadding)) {
            ListSection(header = "Screens") {
                GalleryScreen.entries.drop(1).forEach { entry ->
                    NavigationRow(title = entry.title, onClick = { onOpen(entry) })
                }
            }
        }
    }
}
