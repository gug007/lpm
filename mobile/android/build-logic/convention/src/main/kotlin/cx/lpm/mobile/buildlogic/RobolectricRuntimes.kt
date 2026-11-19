package cx.lpm.mobile.buildlogic

import java.io.File
import java.util.Properties
import org.gradle.api.Project
import org.gradle.api.tasks.testing.Test
import org.gradle.kotlin.dsl.withType
import org.gradle.process.CommandLineArgumentProvider

private const val RUNTIME_ALIASES = "robolectric.runtime."

/**
 * Left alone, Robolectric downloads each Android runtime from Maven Central while the tests
 * run: one request, no retry, nothing kept between CI runs, so a single bad response fails
 * the build. Gradle resolves them instead and the tests read them from its dependency cache.
 */
internal fun Project.resolveRobolectricRuntimes() {
    // One configuration each: they are versions of the same module, and together only the
    // newest would survive.
    val jars = libs.libraryAliases.filter { it.startsWith(RUNTIME_ALIASES) }.associate { alias ->
        val runtime = libs.library(alias).get()
        "${runtime.module}:${runtime.version}" to
            configurations.detachedConfiguration(dependencies.create(runtime)).incoming.files
    }
    tasks.withType<Test>().configureEach {
        val index = temporaryDir.resolve("robolectric-deps.properties")
        inputs.property("robolectricRuntimes", jars.keys.sorted())
        jvmArgumentProviders.add(RuntimeIndexArgument(index))
        doFirst {
            val paths = Properties()
            jars.forEach { (runtime, jar) -> paths.setProperty(runtime, jar.singleFile.path) }
            index.parentFile.mkdirs()
            index.outputStream().use { paths.store(it, null) }
        }
    }
}

private class RuntimeIndexArgument(private val index: File) : CommandLineArgumentProvider {
    override fun asArguments() = listOf("-Drobolectric-deps.properties=$index")
}
