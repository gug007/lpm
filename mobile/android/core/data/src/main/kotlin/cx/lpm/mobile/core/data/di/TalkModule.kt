package cx.lpm.mobile.core.data.di

import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.data.talk.TalkStore
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet

/** The Talk button's request. */
@Module
@InstallIn(SingletonComponent::class)
object TalkModule {
    @Provides
    @IntoSet
    fun talkStoreFactory(): SessionStore.Factory = SessionStore.Factory(::TalkStore)
}
