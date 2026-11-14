package cx.lpm.mobile.feature.files

import androidx.navigation3.runtime.EntryProviderScope
import androidx.navigation3.runtime.NavKey
import cx.lpm.mobile.core.navigation.FilePreviewKey
import cx.lpm.mobile.core.navigation.GitReviewKey
import cx.lpm.mobile.core.navigation.Navigator
import cx.lpm.mobile.core.navigation.ProjectFilesKey
import cx.lpm.mobile.core.navigation.SheetPresentation
import cx.lpm.mobile.feature.files.browser.ProjectFilesRoute
import cx.lpm.mobile.feature.files.preview.FilePreviewRoute

/**
 * A project's Files, a folder a screen, and the file preview sheet; a file a Markdown
 * file links to opens in another one over it, and Diff opens Changes on the file.
 */
fun EntryProviderScope<NavKey>.filesEntries(navigator: Navigator) {
    entry<ProjectFilesKey> { key ->
        ProjectFilesRoute(key = key, onNavigate = navigator::navigate, onBack = navigator::back)
    }
    entry<FilePreviewKey>(metadata = SheetPresentation.plainMetadata) { key ->
        FilePreviewRoute(
            key = key,
            onDismiss = { if (navigator.current == key) navigator.back() },
            onOpenFile = { paths ->
                navigator.navigate(
                    key.copy(paths = paths, line = 0, depth = key.depth + 1)
                )
            },
            onOpenChanges = { path ->
                navigator.navigate(GitReviewKey(key.project, key.session, focus = path))
            }
        )
    }
}
