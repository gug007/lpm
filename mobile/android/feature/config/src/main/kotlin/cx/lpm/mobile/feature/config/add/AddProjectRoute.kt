package cx.lpm.mobile.feature.config.add

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.designsystem.component.AlertButton
import cx.lpm.mobile.core.designsystem.component.AlertRole
import cx.lpm.mobile.core.designsystem.component.LpmAlert
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.navigation.InteractiveDismissDisabled
import cx.lpm.mobile.core.navigation.SheetStack
import cx.lpm.mobile.core.navigation.rememberSheetNavigator
import cx.lpm.mobile.core.ui.EditorTopBar
import cx.lpm.mobile.feature.config.R
import cx.lpm.mobile.feature.config.dirs.DirBrowserPage
import cx.lpm.mobile.feature.config.ui.HeaderlessTopPadding

/** A page of the add-project sheet: the form, or the folder browser pushed over it. */
private sealed interface AddProjectPage {
    data object Form : AddProjectPage

    data class Folder(val purpose: FolderPurpose) : AddProjectPage
}

/** "Add Project…": the form, with the Mac's folder browser pushed inside the sheet. */
@Composable
fun AddProjectRoute(
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: AddProjectViewModel = hiltViewModel()
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val navigator = rememberSheetNavigator<AddProjectPage>(AddProjectPage.Form)
    val haptics = LocalHapticFeedback.current
    val dismiss by rememberUpdatedState(onDismiss)
    LaunchedEffect(state.done) {
        if (state.done) {
            haptics.performHapticFeedback(HapticFeedbackType.Confirm)
            dismiss()
        }
    }
    InteractiveDismissDisabled(state.saving)
    val actions = remember(viewModel) {
        AddProjectActions(
            onMode = viewModel::selectMode,
            onBrowse = { navigator.push(AddProjectPage.Folder(it)) },
            onCloneUrl = viewModel::editCloneUrl,
            onBranch = viewModel::editBranch,
            onHostPick = viewModel::pickHost,
            onHost = viewModel::editHost,
            onUser = viewModel::editUser,
            onPort = viewModel::editPort,
            onIdentityFile = viewModel::editIdentityFile,
            onRemoteDir = viewModel::editRemoteDir,
            onName = viewModel::editName
        )
    }
    SheetStack(navigator, modifier) { page ->
        when (page) {
            AddProjectPage.Form -> AddProjectScreen(
                state = state,
                actions = actions,
                onCancel = onDismiss,
                onCreate = {
                    haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
                    viewModel.create()
                }
            )

            is AddProjectPage.Folder -> DirBrowserPage(
                title = stringResource(
                    when (page.purpose) {
                        FolderPurpose.ProjectFolder -> R.string.config_project_folder
                        FolderPurpose.CloneInto -> R.string.config_clone_into
                    }
                ),
                onPick = { path ->
                    when (page.purpose) {
                        FolderPurpose.ProjectFolder -> viewModel.pickLocalRoot(path)
                        FolderPurpose.CloneInto -> viewModel.pickCloneParent(path)
                    }
                    navigator.back()
                },
                onBack = navigator::back
            )
        }
    }
    state.mutationError?.let { error ->
        LpmAlert(
            title = stringResource(R.string.config_add_failed),
            message = error,
            buttons = listOf(AlertButton(stringResource(R.string.ok), AlertRole.Cancel)),
            onDismissRequest = { viewModel.dismissMutationError() }
        )
    }
}

@Composable
fun AddProjectScreen(
    state: AddProjectUiState,
    actions: AddProjectActions,
    onCancel: () -> Unit,
    onCreate: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier
            .fillMaxSize()
            .background(LpmTheme.colors.systemGroupedBackground)
    ) {
        EditorTopBar(
            title = stringResource(R.string.config_add_project),
            onCancel = onCancel,
            confirmLabel = stringResource(
                when (state.mode) {
                    AddProjectMode.Local -> R.string.config_create
                    AddProjectMode.Clone -> R.string.config_mode_clone
                    AddProjectMode.Ssh -> R.string.config_add
                }
            ),
            onConfirm = onCreate,
            confirmEnabled = state.canCreate,
            busy = state.saving
        )
        Column(
            Modifier
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(top = HeaderlessTopPadding, bottom = 24.dp)
        ) {
            AddProjectForm(state, actions)
        }
    }
}
