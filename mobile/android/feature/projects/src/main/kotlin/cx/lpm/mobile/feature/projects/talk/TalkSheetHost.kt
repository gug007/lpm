package cx.lpm.mobile.feature.projects.talk

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.designsystem.component.rememberModalSheetState
import cx.lpm.mobile.core.ui.HapticEffect
import cx.lpm.mobile.core.ui.dictation.FieldDictation
import cx.lpm.mobile.core.ui.dictation.rememberDictationStart

/**
 * The Talk sheet over the projects list while the button's request is open, wired to
 * the app's recorder. It slides away when the request closes, whoever closed it.
 */
@Composable
internal fun TalkSheetHost(viewModel: TalkViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    HapticEffect(state.talk.feedback)
    val wanted by rememberUpdatedState(state.offered && state.open)
    var showing by remember { mutableStateOf(wanted) }
    var round by remember { mutableIntStateOf(0) }
    LaunchedEffect(wanted) { if (wanted) showing = true }
    if (!showing) return

    val take by viewModel.dictationState.collectAsStateWithLifecycle()
    val dictate = rememberDictationStart(
        needsMicrophone = viewModel.needsMicrophone,
        onStart = viewModel::startDictation,
        onRefuse = viewModel::refuseDictation
    )
    // A request opened while the last one's sheet slides away gets a sheet of its own.
    key(round) {
        val sheet = rememberModalSheetState()
        LaunchedEffect(wanted) {
            if (wanted) return@LaunchedEffect
            sheet.dismiss {
                round += 1
                showing = wanted
            }
        }
        TalkSheet(
            state = state,
            dictation = FieldDictation(
                state = take,
                owner = TalkViewModel.DICTATION_OWNER,
                meter = viewModel.dictationMeter,
                start = dictate,
                stop = viewModel::stopDictation,
                cancel = viewModel::cancelDictation
            ),
            actions = TalkSheetActions(
                setText = viewModel::setText,
                makePlan = viewModel::makePlan,
                tryAgain = viewModel::tryAgain,
                close = viewModel::close,
                abandonDictation = viewModel::abandonDictation,
                plan = TalkPlanActions(
                    setProject = viewModel::setProject,
                    setAgent = viewModel::setAgent,
                    setPrompt = viewModel::setPrompt,
                    approve = viewModel::approve
                )
            ),
            sheet = sheet
        )
    }
}
