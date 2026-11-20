# Publishing to Google Play and the App Store

## Before either store

- A live API at a real HTTPS address (e.g. `https://api.aoberonz.com`) — the stores' reviewers will use the app.
- A public **privacy policy** URL and **terms of use** URL (host them on the web app's domain).
- An in-app **account deletion** option — already built (Profile → Delete my account and data). Both stores require it for apps with sign-up.
- A **reviewer login** (an ordinary user account) to give to Apple and Google.
- App icon 1024×1024 and screenshots. Generate icons with the `flutter_launcher_icons` package.
- Bump `version:` in `app/pubspec.yaml` for each release (`1.0.1+2` = version 1.0.1, build 2). CI also sets the build number from the run number.

## Android (Google Play)

1. **Create the developer account** at play.google.com/console. Register as an **organization** once your company and D-U-N-S number exist (see the company playbook). New *personal* accounts must run a closed test with at least 12 testers for 14 days before production; organization accounts skip that rule.
2. **Create the upload key** (once, keep it safe — losing it is painful):
   ```bash
   keytool -genkey -v -keystore upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
   ```
3. **Local release build:** put `upload-keystore.jks` in `app/android/app/` and create `app/android/key.properties`:
   ```
   storePassword=...
   keyPassword=...
   keyAlias=upload
   storeFile=upload-keystore.jks
   ```
   `tool/setup_platforms.sh` already patched `build.gradle.kts` to use it. Then:
   ```bash
   flutter build appbundle --release --dart-define=API_URL=https://api.aoberonz.com
   ```
   Output: `app/build/app/outputs/bundle/release/app-release.aab`.
4. **Play Console:** create the app (package `com.aoberonz.aoberonz`), fill the store listing, content rating, data safety form (you collect email, name, app interactions), target audience (18+ recommended for a business news app), then upload the `.aab` to **Internal testing** by hand the first time. Turn on **Play App Signing**.
5. **Automate:** in Play Console → Setup → API access, link a Google Cloud service account with release permissions, download its JSON key, and add these GitHub secrets:
   - `ANDROID_KEYSTORE_BASE64` — `base64 -w0 upload-keystore.jks` (PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("upload-keystore.jks"))`)
   - `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`
   - `PLAY_SERVICE_ACCOUNT_JSON` — the JSON file's contents
   - `API_URL`
   Now `git tag v1.0.1 && git push origin v1.0.1` uploads to internal testing. Promote to closed → production in the console.

## iOS (App Store)

You need a Mac to sign iOS apps. On Windows you have two options: let **GitHub Actions macOS runners** do it (workflow included), or use **Codemagic**, which builds Flutter iOS apps in the cloud with a guided signing setup.

1. **Join the Apple Developer Program** (USD 99 per year). As a company you need a D-U-N-S number first.
2. In **App Store Connect**, create the app with bundle ID `com.aoberonz.aoberonz`.
3. Create an **Apple Distribution certificate** and an **App Store provisioning profile** named `Aoberonz App Store` (developer.apple.com → Certificates, IDs & Profiles). Export the certificate as `.p12` with a password.
4. Create an **App Store Connect API key** (Users and Access → Integrations → Keys) with App Manager access.
5. Put your Team ID into `app/ios/ExportOptions.plist`.
6. Add GitHub secrets: `IOS_DIST_CERT_P12_BASE64`, `IOS_DIST_CERT_PASSWORD`, `IOS_PROVISION_PROFILE_BASE64`, `APPSTORE_ISSUER_ID`, `APPSTORE_KEY_ID`, `APPSTORE_PRIVATE_KEY`.
7. In Xcode (or in `ios/Runner.xcodeproj` settings via CI), set signing to **Manual** with that profile for the Release configuration.
8. Push a tag. The build lands in **TestFlight**; test it, then submit for review with the reviewer login and notes explaining that content comes from consenting companies' devices and is AI-assisted with human review for sensitive events.

## Review tips

- Say clearly that posts are AI-assisted (the app labels them) and that people are never identified.
- Have a "Report" path and a contact email in the listing — user-generated or automated news apps get asked about moderation.
- Don't ship demo logins or seed content to production.
