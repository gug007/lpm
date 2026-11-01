package cx.lpm.mobile.feature.mac.di

import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.feature.mac.data.KeepAwakeStore
import cx.lpm.mobile.feature.mac.data.MacUpdateStore
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import java.time.Clock

@Module
@InstallIn(SingletonComponent::class)
object MacModule {
    @Provides
    @IntoSet
    fun macUpdateStoreFactory(): SessionStore.Factory = SessionStore.Factory(::MacUpdateStore)

    @Provides
    @IntoSet
    fun keepAwakeStoreFactory(clock: Clock): SessionStore.Factory =
        SessionStore.Factory { session -> KeepAwakeStore(session, clock) }
}
