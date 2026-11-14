package cx.lpm.mobile.feature.git.di

import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.feature.git.data.ReviewDraftsStore
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import java.time.Clock
import javax.inject.Qualifier
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers

/** Where the review screen parses and highlights diffs, off the main thread. */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class DiffDispatcher

@Module
@InstallIn(SingletonComponent::class)
object GitModule {
    @Provides
    @DiffDispatcher
    fun diffDispatcher(): CoroutineDispatcher = Dispatchers.Default

    @Provides
    @IntoSet
    fun reviewDraftsStoreFactory(clock: Clock): SessionStore.Factory =
        SessionStore.Factory { session -> ReviewDraftsStore(session, clock) }
}
