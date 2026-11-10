package cx.lpm.mobile.feature.automations.conversation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.GlassIconButton
import cx.lpm.mobile.core.designsystem.component.LpmTopBar
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.AutomationAsk
import cx.lpm.mobile.feature.automations.R

/**
 * One run of an automation as a conversation (iOS `AutomationConversationView`): its
 * turns top to bottom, a reply on its way or the run's live output at the end, the
 * reader's bar under the navigation bar ([speechBar], with the block it's speaking
 * highlighted through [speakingBlock]) and the reply box ([composer]) for an agent's run.
 */
@Composable
fun AutomationConversationScreen(
    state: AutomationConversationUiState,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    speechBar: @Composable () -> Unit = {},
    speakingBlock: @Composable (MessageUi) -> Int? = { null },
    askCard: @Composable (AutomationAsk) -> Unit = {},
    readAloud: @Composable (MessageUi) -> Unit = {},
    composer: @Composable () -> Unit = {}
) {
    Column(
        modifier
            .fillMaxSize()
            .background(LpmTheme.colors.systemGroupedBackground)
            .imePadding()
    ) {
        LpmTopBar(
            title = state.job?.displayName ?: stringResource(R.string.chat_title),
            leading = {
                GlassIconButton(
                    icon = painterResource(DesignR.drawable.ic_arrow_back_ios_new),
                    contentDescription = stringResource(R.string.back),
                    onClick = onBack
                )
            }
        )
        speechBar()
        FollowingColumn(
            returnToEnd = state.pendingMessage != null,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
        ) {
            Column(
                Modifier.padding(start = 16.dp, end = 16.dp, top = 24.dp, bottom = 16.dp),
                verticalArrangement = Arrangement.spacedBy(24.dp)
            ) {
                state.messages.forEach { message ->
                    key(message.at) {
                        AutomationMessage(
                            message = message,
                            speakingBlock = speakingBlock(message),
                            readAloud = { readAloud(message) },
                            askCard = askCard
                        )
                    }
                }
                val pending = state.pendingMessage
                if (pending != null) {
                    PendingMessage(pending, state.live)
                } else if (state.running && state.live.isNotEmpty()) {
                    LiveMessage(state.live)
                } else if (state.liveRun && state.running) {
                    Text(
                        text = stringResource(R.string.chat_starting),
                        style = LpmTheme.typography.subheadline,
                        color = LpmTheme.colors.secondaryLabel
                    )
                }
                state.runAsks.forEach { ask -> key(ask.id) { askCard(ask) } }
            }
        }
        if (state.showsComposer) composer()
    }
}
