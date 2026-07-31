import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import org.apache.tools.ant.taskdefs.condition.Os
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.logging.LogLevel
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction

/**
 * Windows-friendly Rust build: compile with cargo, then **copy** the .so into
 * jniLibs (avoids needing Developer Mode for symlinks).
 */
open class BuildTask : DefaultTask() {
    @Input
    var rootDirRel: String? = null
    @Input
    var target: String? = null
    @Input
    var release: Boolean? = null

    @TaskAction
    fun assemble() {
        val rootDirRel = rootDirRel ?: throw GradleException("rootDirRel cannot be null")
        val target = target ?: throw GradleException("target cannot be null")
        val release = release ?: throw GradleException("release cannot be null")

        val root = File(project.projectDir, rootDirRel).canonicalFile
        val triple = when (target) {
            "aarch64" -> "aarch64-linux-android"
            "armv7" -> "armv7-linux-androideabi"
            "i686" -> "i686-linux-android"
            "x86_64" -> "x86_64-linux-android"
            else -> throw GradleException("Unknown Android Rust target: $target")
        }
        val abi = when (target) {
            "aarch64" -> "arm64-v8a"
            "armv7" -> "armeabi-v7a"
            "i686" -> "x86"
            "x86_64" -> "x86_64"
            else -> throw GradleException("Unknown ABI for $target")
        }
        val profile = if (release) "release" else "debug"

        project.exec {
            workingDir(root)
            executable(if (Os.isFamily(Os.FAMILY_WINDOWS)) "cargo.exe" else "cargo")
            args(
                "build",
                "--package", "supergannt",
                "--manifest-path", File(root, "Cargo.toml").absolutePath,
                "--target", triple,
                "--features", "tauri/custom-protocol",
                "--lib",
            )
            if (release) {
                args("--release")
            }
            if (project.logger.isEnabled(LogLevel.INFO)) {
                // keep cargo default verbosity
            }
        }.assertNormalExitValue()

        val so = File(root, "target/$triple/$profile/libsupergannt_lib.so")
        if (!so.isFile) {
            throw GradleException("Rust library missing after build: ${so.absolutePath}")
        }
        val jniDir = File(project.projectDir, "src/main/jniLibs/$abi")
        if (!jniDir.exists() && !jniDir.mkdirs()) {
            throw GradleException("Cannot create ${jniDir.absolutePath}")
        }
        val dest = File(jniDir, "libsupergannt_lib.so")
        Files.copy(so.toPath(), dest.toPath(), StandardCopyOption.REPLACE_EXISTING)
        project.logger.lifecycle("Copied ${so.name} → ${dest.absolutePath} (${so.length()} bytes)")
    }
}
