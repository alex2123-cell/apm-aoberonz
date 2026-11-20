"""Makes release builds use android/key.properties (your upload key) instead of debug keys.
Run once after `flutter create`:  python3 tool/patch_android_signing.py"""
from pathlib import Path

gradle = Path("android/app/build.gradle.kts")
s = gradle.read_text()
if "key.properties" in s:
    print("Already patched"); raise SystemExit
imports = '''import java.util.Properties
import java.io.FileInputStream

'''
loader = '''
val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

'''
signing = '''    signingConfigs {
        create("release") {
            keyAlias = keystoreProperties["keyAlias"] as String?
            keyPassword = keystoreProperties["keyPassword"] as String?
            storeFile = keystoreProperties["storeFile"]?.let { file(it) }
            storePassword = keystoreProperties["storePassword"] as String?
        }
    }

    buildTypes {'''
# Gradle rule: imports first, then plugins {}, then everything else.
s = imports + s
end_plugins = s.index("}", s.index("plugins {")) + 1
s = s[:end_plugins] + "\n" + loader + s[end_plugins:]
s = s.replace("    buildTypes {", signing, 1)
s = s.replace('signingConfig = signingConfigs.getByName("debug")',
              'signingConfig = if (keystorePropertiesFile.exists()) signingConfigs.getByName("release") else signingConfigs.getByName("debug")', 1)
gradle.write_text(s)
print("Patched", gradle)
