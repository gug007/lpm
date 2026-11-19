package cx.lpm.mobile.buildlogic

import com.android.build.api.dsl.CommonExtension
import com.android.build.api.dsl.Lint
import org.gradle.api.JavaVersion
import org.gradle.api.Project
import org.gradle.api.plugins.JavaPluginExtension
import org.gradle.api.tasks.testing.Test
import org.gradle.kotlin.dsl.apply
import org.gradle.kotlin.dsl.configure
import org.gradle.kotlin.dsl.dependencies
import org.gradle.kotlin.dsl.withType
import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import org.jetbrains.kotlin.gradle.tasks.KotlinJvmCompile

internal object Sdk {
    const val COMPILE = 37
    const val TARGET = 37
    const val MIN = 26
}

private val javaVersion = JavaVersion.VERSION_17

internal fun Project.configureKotlinAndroid(android: CommonExtension) {
    android.compileSdk = Sdk.COMPILE
    android.defaultConfig.minSdk = Sdk.MIN
    android.compileOptions.sourceCompatibility = javaVersion
    android.compileOptions.targetCompatibility = javaVersion
    android.testOptions.unitTests.isIncludeAndroidResources = true
    android.buildTypes.getByName("debug").enableUnitTestCoverage = true
    android.lint.configureLint()
    // Robolectric 4.17 reaches into jdk.internal.access for SDK 37's shared memory
    // (robolectric/robolectric#11434).
    tasks.withType<Test>().configureEach {
        jvmArgs("--add-exports=java.base/jdk.internal.access=ALL-UNNAMED")
        // Hilt generates test sources in every module, including ones with no tests yet.
        failOnNoDiscoveredTests.set(false)
    }
    resolveRobolectricRuntimes()
    configureKotlin()
}

internal fun Project.configureKotlinJvm() {
    apply(plugin = "jacoco")
    extensions.configure<JavaPluginExtension> {
        sourceCompatibility = javaVersion
        targetCompatibility = javaVersion
    }
    configureKotlin()
}

internal fun Lint.configureLint() {
    warningsAsErrors = true
    // Version bumps are dependency-update work, not a reason to fail every build.
    disable += setOf("GradleDependency", "NewerVersionAvailable", "AndroidGradlePluginVersion")
}

private fun Project.configureKotlin() {
    val warningsAsErrors = providers.gradleProperty(
        "warningsAsErrors"
    ).map(String::toBoolean).orElse(false)
    tasks.withType<KotlinJvmCompile>().configureEach {
        compilerOptions {
            jvmTarget.set(JvmTarget.fromTarget(javaVersion.toString()))
            allWarningsAsErrors.set(warningsAsErrors)
        }
    }
    dependencies {
        "testImplementation"(libs.library("junit4"))
        "testImplementation"(libs.library("kotlinx-coroutines-test"))
        "testImplementation"(libs.library("turbine"))
    }
}
