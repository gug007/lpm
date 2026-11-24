package cx.lpm.mobile.feature.files.browser

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.model.LocatedKind
import cx.lpm.mobile.core.model.LocatedPath
import cx.lpm.mobile.feature.files.R

/**
 * The path typed into Go to File (iOS `GoToPathRow`): a file opens in the preview wherever
 * it is on the Mac, and a folder is pushed, in the project or not. [located] is null while
 * it's looked for.
 */
@Composable
internal fun GoToPathRow(
    located: LocatedPath?,
    openFolder: (String) -> Unit,
    openFile: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    if (located == null) {
        FileRowSkeleton(130.dp, modifier)
        return
    }
    val rel = located.rel
    val shown = rel?.ifEmpty { null } ?: located.path
    if (located.kind == LocatedKind.FILE) {
        GoToFileRow(shown, { openFile(shown) }, modifier)
        return
    }
    GoToFileRow(
        path = shown,
        onOpen = { openFolder(rel ?: located.path) },
        modifier = modifier,
        isFolder = true,
        note = if (rel == null) stringResource(R.string.files_outside_project) else null
    )
}
