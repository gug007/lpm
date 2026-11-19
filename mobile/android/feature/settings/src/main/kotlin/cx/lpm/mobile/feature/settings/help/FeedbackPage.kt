package cx.lpm.mobile.feature.settings.help

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ListSection
import cx.lpm.mobile.core.designsystem.component.ProminentButton
import cx.lpm.mobile.core.designsystem.component.SegmentedControl
import cx.lpm.mobile.core.designsystem.component.TextFieldRow
import cx.lpm.mobile.feature.settings.R
import cx.lpm.mobile.feature.settings.SettingsPage

/**
 * The desktop's Send feedback, on the phone (iOS `FeedbackSheet`): one box, whose kind
 * follows the text until one is picked, opening a filled-in GitHub issue or discussion
 * that says which versions it's about.
 */
@Composable
fun FeedbackPage(
    macVersion: String?,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: HelpViewModel = hiltViewModel()
) {
    val demo by viewModel.demo.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var text by rememberSaveable { mutableStateOf("") }
    var picked by rememberSaveable { mutableStateOf<FeedbackKind?>(null) }
    val guessed = remember(text) { FeedbackDraft.guessKind(text) }
    val kind = picked ?: guessed ?: FeedbackKind.Suggestion
    val title = remember(text) { FeedbackDraft.title(text) }
    val focus = remember { FocusRequester() }
    LaunchedEffect(focus) { focus.requestFocus() }
    Column(modifier) {
        Box(Modifier.weight(1f)) {
            SettingsPage(stringResource(R.string.settings_send_feedback), onBack) {
                ListSection(
                    header = stringResource(R.string.feedback_header),
                    footer = if (title.isEmpty()) {
                        null
                    } else {
                        stringResource(
                            R.string.feedback_title_line,
                            title
                        )
                    }
                ) {
                    TextFieldRow(
                        value = text,
                        onValueChange = { text = it },
                        placeholder = stringResource(R.string.feedback_placeholder),
                        fieldModifier = Modifier.focusRequester(focus),
                        minLines = 5,
                        maxLines = 12
                    )
                }
                ListSection(footer = stringResource(kind.hint)) {
                    SegmentedControl(
                        options = FeedbackKind.entries.map { stringResource(it.title) },
                        selectedIndex = kind.ordinal,
                        onSelect = { picked = FeedbackKind.entries[it] },
                        modifier = Modifier.padding(8.dp)
                    )
                }
            }
        }
        ProminentButton(
            text = stringResource(kind.opens),
            icon = painterResource(DesignR.drawable.ic_open_in_new),
            enabled = title.isNotEmpty(),
            onClick = {
                val body = text.trim() + viewModel.footer(macVersion, demo)
                context.open(FeedbackDraft.url(kind, title, body))
                onBack()
            },
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp)
        )
    }
}

private val FeedbackKind.title: Int
    get() = when (this) {
        FeedbackKind.Bug -> R.string.feedback_bug
        FeedbackKind.Suggestion -> R.string.feedback_idea
        FeedbackKind.Question -> R.string.feedback_question
    }

private val FeedbackKind.opens: Int
    get() = if (this ==
        FeedbackKind.Bug
    ) {
        R.string.feedback_open_issue
    } else {
        R.string.feedback_start_discussion
    }

private val FeedbackKind.hint: Int
    get() = when (this) {
        FeedbackKind.Bug -> R.string.feedback_bug_hint
        FeedbackKind.Suggestion -> R.string.feedback_idea_hint
        FeedbackKind.Question -> R.string.feedback_question_hint
    }
