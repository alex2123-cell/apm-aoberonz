#!/usr/bin/env bash
# Generates the android/, ios/ and web/ folders around the code in lib/ and applies Aoberonz settings.
# Run once from the app/ folder:  bash tool/setup_platforms.sh
# (Windows: run the same commands in Git Bash, or follow docs/MOBILE_RELEASE.md by hand.)
set -euo pipefail

flutter create --org com.aoberonz --project-name aoberonz --platforms=android,ios,web .

# Android: release builds need the INTERNET permission and a proper app name.
MANIFEST=android/app/src/main/AndroidManifest.xml
if ! grep -q "android.permission.INTERNET" "$MANIFEST"; then
  sed -i.bak 's#<application#<uses-permission android:name="android.permission.INTERNET"/>\n    <application#' "$MANIFEST"
fi
sed -i.bak 's#android:label="aoberonz"#android:label="Aoberonz"#' "$MANIFEST"
rm -f "$MANIFEST.bak"

# iOS display name
PLIST=ios/Runner/Info.plist
if [ -f "$PLIST" ]; then
  /usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName Aoberonz" "$PLIST" 2>/dev/null || \
    sed -i.bak 's#<string>Aoberonz</string>#<string>Aoberonz</string>#' "$PLIST"
fi

# Web title
sed -i.bak 's#<title>aoberonz</title>#<title>Aoberonz — live industry news</title>#' web/index.html && rm -f web/index.html.bak

# Release signing from android/key.properties
if [ -f android/app/build.gradle.kts ]; then
  python3 tool/patch_android_signing.py || python tool/patch_android_signing.py || echo "Patch android signing by hand: see docs/MOBILE_RELEASE.md"
fi

flutter pub get
echo "Done. Try: flutter run -d chrome --dart-define=API_URL=http://localhost:4000"
