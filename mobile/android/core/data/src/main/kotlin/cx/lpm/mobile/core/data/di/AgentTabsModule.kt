package cx.lpm.mobile.core.data.di

import android.content.Context
import cx.lpm.mobile.core.data.conversation.ConversationStore
import cx.lpm.mobile.core.data.mac.AgentTabSnapshots
import cx.lpm.mobile.core.data.mac.LastAnswers
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.data.terminals.AgentTabsStore
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import java.io.File
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers

/** An agent's tab: its conversation, and what's kept of it for when the Mac is away. */
@Module
@InstallIn(SingletonComponent::class)
object AgentTabsModule {
    @Provides
    @Singleton
    fun lastAnswers(@ApplicationContext context: Context): LastAnswers =
        LastAnswers(File(context.cacheDir, "agent-answers.json"))

    @Provides
    @Singleton
    fun agentTabSnapshots(
        @ApplicationContext context: Context,
        answers: LastAnswers,
        @ApplicationScope scope: CoroutineScope
    ): AgentTabSnapshots =
        AgentTabSnapshots(File(context.cacheDir, "agent-tabs"), answers, scope, Dispatchers.IO)

    @Provides
    @IntoSet
    fun agentTabsStoreFactory(): SessionStore.Factory = SessionStore.Factory(::AgentTabsStore)

    @Provides
    @IntoSet
    fun conversationStoreFactory(): SessionStore.Factory = SessionStore.Factory(::ConversationStore)
}
