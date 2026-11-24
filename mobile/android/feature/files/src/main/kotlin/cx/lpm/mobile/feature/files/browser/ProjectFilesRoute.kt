package cx.lpm.mobile.feature.files.browser

import android.content.ClipData
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation3.runtime.NavKey
import cx.lpm.mobile.core.navigation.FilePreviewKey
import cx.lpm.mobile.core.navigation.ProjectFilesKey
import kotlinx.coroutines.launch

/** A Files folder wired to its ViewModel, the clipboard, and the folders and previews it opens. */
@Composable
fun ProjectFilesRoute(
    key: ProjectFilesKey,
    onNavigate: (NavKey) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: ProjectFilesViewModel =
        hiltViewModel<ProjectFilesViewModel, ProjectFilesViewModel.Factory>(
            creationCallback = { it.create(key) }
        )
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var refreshing by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val clipboard = LocalClipboard.current
    val haptics = LocalHapticFeedback.current
    LaunchedEffect(key) { viewModel.load() }

    ProjectFilesScreen(
        state = state,
        dir = key.dir,
        refreshing = refreshing,
        onRefresh = {
            scope.launch {
                refreshing = true
                viewModel.refresh()
                refreshing = false
            }
        },
        modifier = modifier,
        actions = ProjectFilesActions(
            back = onBack,
            search = viewModel::setQuery,
            // The same key again would share this screen, search and all.
            openFolder = {
                if (it == key.dir) {
                    viewModel.setQuery("")
                } else {
                    onNavigate(ProjectFilesKey(key.project, it, key.session))
                }
            },
            openFile = { path ->
                haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
                onNavigate(FilePreviewKey(key.project, listOf(path), session = key.session))
            },
            copy = { text ->
                scope.launch {
                    clipboard.setClipEntry(ClipEntry(ClipData.newPlainText(text, text)))
                }
            },
            retry = viewModel::retry
        )
    )
}
