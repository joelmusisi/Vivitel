# Vivi Mobile (Capacitor wrapper)

This project wraps the existing Vivitel web app with Capacitor for Android and iOS.

## Quick start

1. Build the web app and sync to Android:

   npm run build:android

2. Open in Android Studio:

   npm run open:android

3. Build the web app and sync to iOS:

   npm run build:ios

4. Open in Xcode on macOS:

   npm run open:ios

## Notes

- Web assets are pulled from ../frontend/dist.
- Android builds can be synced from Windows, but iOS opening and signing still require macOS with Xcode.
- For Firebase, drop google-services.json into android/app/ and GoogleService-Info.plist into the iOS app when native push is added.
