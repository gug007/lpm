plugins {
    alias(libs.plugins.lpm.android.feature)
}

dependencies {
    implementation(projects.core.ui)

    testImplementation(projects.core.testing)
}
