package cx.lpm.mobile.feature.notes.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.EmptyState
import cx.lpm.mobile.core.designsystem.component.GlassIconButton
import cx.lpm.mobile.core.designsystem.component.LpmTopBar
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.notes.R
import cx.lpm.mobile.feature.notes.attachment.NoteAttachmentActions
import cx.lpm.mobile.feature.notes.composer.NotesComposer
import cx.lpm.mobile.feature.notes.composer.NotesComposerActions
import cx.lpm.mobile.feature.notes.composer.NotesDictation
import cx.lpm.mobile.feature.notes.ui.NotesErrorBanner
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter

/** What the transcript and its bar do. */
@Immutable
class NoteChatActions(
    val back: () -> Unit = {},
    val loadMore: () -> Unit = {},
    val clearErrors: () -> Unit = {},
    val menu: NoteMenuActions = NoteMenuActions(),
    val attachments: NoteAttachmentActions = NoteAttachmentActions()
)

/**
 * One notebook chat (iOS `NotesChatView`): a transcript read from the bottom up with a
 * capsule for each day, paging backwards as the reader scrolls to the top, and the
 * composer pinned under it.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NoteChatScreen(
    state: NoteChatUiState,
    refreshing: Boolean,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
    actions: NoteChatActions = NoteChatActions(),
    composer: NotesComposerActions = NotesComposerActions(),
    dictation: NotesDictation? = null
) {
    val list = rememberLazyListState()
    FollowNewest(list, state.newestId)
    PageBackwards(list, actions.loadMore)
    Column(
        modifier
            .fillMaxSize()
            .background(LpmTheme.colors.systemBackground)
    ) {
        LpmTopBar(
            title = state.title,
            leading = {
                GlassIconButton(
                    icon = painterResource(DesignR.drawable.ic_arrow_back_ios_new),
                    contentDescription = stringResource(R.string.notes_back),
                    onClick = actions.back
                )
            }
        )
        state.error?.let { NotesErrorBanner(it, actions.clearErrors) }
        PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh = onRefresh,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
        ) {
            LazyColumn(
                state = list,
                modifier = Modifier.fillMaxSize(),
                reverseLayout = true,
                verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.Top),
                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp)
            ) {
                items(state.items, key = { it.key }, contentType = { it::class }) { item ->
                    when (item) {
                        is NoteChatItem.Day -> DaySeparator(item.label)

                        is NoteChatItem.Note -> NoteMessageRow(
                            note = item,
                            attachments = state.attachments,
                            attachmentActions = actions.attachments,
                            menu = actions.menu
                        )
                    }
                }
                if (state.canLoadMore) {
                    item(key = OLDER) {
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .padding(vertical = 6.dp),
                            contentAlignment = Alignment.Center
                        ) { ActivityIndicator() }
                    }
                }
            }
            ChatOverlay(state.overlay)
        }
        NotesComposer(
            draft = state.draft,
            sending = state.sending,
            canSend = state.canSend,
            actions = composer,
            dictation = dictation,
            modifier = Modifier.imePadding()
        )
    }
}

/** A note just written (or a fresh first page) belongs at the bottom, where a transcript is read. */
@Composable
private fun FollowNewest(list: LazyListState, newestId: String?) {
    var shown by remember { mutableStateOf(newestId) }
    LaunchedEffect(newestId) {
        if (newestId != null && shown != null && newestId != shown) list.animateScrollToItem(0)
        shown = newestId
    }
}

/** Reaching the top asks for the page before it; an older page lands above the reader. */
@Composable
private fun PageBackwards(list: LazyListState, onLoadMore: () -> Unit) {
    val loadMore by rememberUpdatedState(onLoadMore)
    LaunchedEffect(list) {
        snapshotFlow { list.layoutInfo.visibleItemsInfo.any { it.key == OLDER } }
            .distinctUntilChanged()
            .filter { it }
            .collect { loadMore() }
    }
}

@Composable
private fun ChatOverlay(overlay: NoteChatOverlay) {
    when (overlay) {
        NoteChatOverlay.None -> Unit

        NoteChatOverlay.Loading -> Box(
            Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            ActivityIndicator()
        }

        NoteChatOverlay.Empty -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            EmptyState(
                title = stringResource(R.string.notes_chat_empty),
                icon = painterResource(DesignR.drawable.ic_edit_square),
                description = {
                    Text(
                        text = stringResource(R.string.notes_chat_empty_description),
                        style = LpmTheme.typography.body,
                        color = LpmTheme.colors.secondaryLabel,
                        textAlign = TextAlign.Center
                    )
                }
            )
        }
    }
}

private const val OLDER = "older"
