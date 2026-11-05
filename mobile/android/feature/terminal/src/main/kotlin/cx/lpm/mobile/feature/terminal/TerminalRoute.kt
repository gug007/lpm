package cx.lpm.mobile.feature.terminal

import androidx.activity.compose.LocalActivity
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleStartEffect
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.data.terminals.TerminalHooks
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.navigation.CommandEditorKey
import cx.lpm.mobile.core.navigation.FilePreviewKey
import cx.lpm.mobile.core.navigation.ManageCommandsKey
import cx.lpm.mobile.core.navigation.Navigator
import cx.lpm.mobile.core.navigation.TerminalKey
import cx.lpm.mobile.core.web.TerminalWebController
import cx.lpm.mobile.core.web.rememberTerminalWebController
import cx.lpm.mobile.feature.terminal.composer.ComposerRoute
import cx.lpm.mobile.feature.terminal.composer.ComposerTarget
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * A terminal named by its ids. Until the project's terminal list holds it, it's
 * opening — or unavailable once the list shows it's gone (a notification or an
 * agent row can name a terminal before its list has loaded). One that has shown
 * stays on screen with how it ended, and carries on as the tab lpm reopened in its
 * place after a restart.
 */
@Composable
internal fun TerminalRoute(
    key: TerminalKey,
    navigator: Navigator,
    slots: TerminalSlots,
    modifier: Modifier = Modifier,
    viewModel: TerminalViewModel = hiltViewModel<TerminalViewModel, TerminalViewModel.Factory>(
        creationCallback = { it.create(key) }
    )
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val terminal = state.terminal
    val project = state.project
    // Asked again after a Mac switch or a reconnect, which clear the list this waits on.
    LaunchedEffect(state.activeMacId, state.connectionReady, terminal == null) {
        if (terminal == null) viewModel.loadTerminals()
    }
    if (terminal == null || project == null) {
        TerminalPlaceholder(
            loading = !state.listLoaded,
            onBack = navigator::back,
            modifier = modifier
        )
        return
    }
    var backgrounded by remember { mutableStateOf(false) }
    DisposableEffect(viewModel) {
        viewModel.appear()
        onDispose { viewModel.disappear() }
    }
    LifecycleStartEffect(viewModel) {
        if (backgrounded) viewModel.resume()
        onStopOrDispose { backgrounded = true }
    }
    // A tab lpm reopened in this one's place gets a fresh web view and composer.
    androidx.compose.runtime.key(terminal.id) {
        val controller = rememberTerminalWebController()
        var findOpen by remember { mutableStateOf(false) }
        var findQuery by remember { mutableStateOf("") }
        val scope = rememberCoroutineScope()
        val haptics = LocalHapticFeedback.current
        val lifecycle = LocalLifecycleOwner.current.lifecycle
        DisposableEffect(controller) {
            viewModel.openScreen(controller, controller.hooks(scope))
            onDispose { viewModel.closeScreen(controller) }
        }
        // Opening the terminal is the touch that sees it; a finish landing while it's
        // open waits for the next touch, as on the desktop.
        LaunchedEffect(Unit) { viewModel.markSeen() }
        // Only while this screen is on top: a touch on a screen pushed over it isn't
        // a look at it.
        val seenOnTouch = remember(viewModel, lifecycle) {
            {
                if (lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) viewModel.markSeen()
            }
        }
        LpmTheme(darkTheme = true) {
            LightSystemBarIcons()
            TerminalScreen(
                state = state,
                terminal = terminal,
                controller = controller,
                stream = TerminalStreamCallbacks(
                    onInput = viewModel::input,
                    onResize = viewModel::resize,
                    onRevive = viewModel::resync,
                    onPageRestart = viewModel::reseed,
                    onFirstContent = viewModel::contentShown,
                    onOpenPath = { paths, line ->
                        haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
                        navigator.navigate(FilePreviewKey(key.project, paths, line, key.session))
                    }
                ),
                onBack = navigator::back,
                onTakeControl = viewModel::claimControl,
                onRestart = viewModel::restart,
                onCloseTab = {
                    viewModel.closeTab()
                    navigator.back()
                },
                modifier = modifier.observeTouches(seenOnTouch),
                trailing = {
                    val onFind = { findOpen = true }
                    slots.projectMenu(
                        this,
                        project,
                        terminal,
                        key.session,
                        onFind.takeIf { state.showsComposer }
                    ) { spawned ->
                        viewModel.claimSpawned(spawned)
                        navigator.navigate(TerminalKey(spawned.project, spawned.id, key.session))
                    }
                },
                connectionBanner = { slots.connectionBanner(key.session) },
                findBar = {
                    if (findOpen) {
                        TerminalFindBar(
                            query = findQuery,
                            onQueryChange = { findQuery = it },
                            controller = controller,
                            onDone = {
                                findOpen = false
                                findQuery = ""
                                controller.clearFind()
                            }
                        )
                    }
                },
                limitBar = {
                    state.shownLimitStop?.let { stop ->
                        TerminalLimitStopBar(
                            stop = stop,
                            canContinue = state.canSwitchAccount,
                            onContinue = { offer ->
                                if (viewModel.continueAfterLimit(offer)) {
                                    haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
                                }
                            },
                            onDismiss = {
                                haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
                                viewModel.dismissLimitStop()
                            },
                            otherAccounts = slots.tabAccountChoices?.let { choices ->
                                { choices(this, key.session, terminal) }
                            }
                        )
                    }
                },
                composer = {
                    ComposerRoute(
                        target = ComposerTarget(
                            terminal.id,
                            terminal.project,
                            terminal.label,
                            key.session
                        ),
                        project = project,
                        background = state.look.theme.backgroundColor,
                        slots = slots,
                        onHideTerminalKeyboard = controller::hideKeyboard,
                        onManageCommands = {
                            navigator.navigate(ManageCommandsKey(key.project, key.session))
                        },
                        onSaveAsCommand = { text ->
                            navigator.navigate(
                                CommandEditorKey(key.project, body = text, session = key.session)
                            )
                        },
                        onPreviewFile = { path ->
                            navigator.navigate(
                                FilePreviewKey(key.project, listOf(path), session = key.session)
                            )
                        }
                    )
                }
            )
        }
    }
}

/** What the store streams the terminal through: this screen's web view. */
private fun TerminalWebController.hooks(scope: CoroutineScope) = TerminalHooks(
    seed = { cols, rows, data, reset -> seed(data, reset, cols, rows) },
    output = ::feed,
    submit = ::submit,
    capture = { lines, done -> scope.launch { done(capture(lines)) } }
)

/** Every terminal theme is dark, so the status and navigation bars get light icons while one shows. */
@Composable
private fun LightSystemBarIcons() {
    val window = LocalActivity.current?.window ?: return
    val view = LocalView.current
    DisposableEffect(window, view) {
        val bars = WindowCompat.getInsetsController(window, view)
        val status = bars.isAppearanceLightStatusBars
        val navigation = bars.isAppearanceLightNavigationBars
        bars.isAppearanceLightStatusBars = false
        bars.isAppearanceLightNavigationBars = false
        onDispose {
            bars.isAppearanceLightStatusBars = status
            bars.isAppearanceLightNavigationBars = navigation
        }
    }
}
