# VIVI Mobile (React Native + Hermes)

Native mobile client for Vivitel Telematics. Uses the same production API as the web app (`https://api.vivitelematics.ca`).

## Requirements

- Node.js 22+
- Android Studio (Android) or Xcode (iOS)
- JDK 17 for Android builds

Hermes is enabled in `android/gradle.properties` (`hermesEnabled=true`).

## Install

```bash
cd vivi_telematic/mobile-native
npm install
```

For iOS pods:

```bash
cd ios && pod install && cd ..
```

## Run

Start Metro:

```bash
npm start
```

Android:

```bash
npm run android
```

iOS:

```bash
npm run ios
```

## API configuration

Default API base URL is set in `src/config.ts`. Change `API_BASE_URL` for local API testing.

## Auth

- Login: `POST /auth/login` → stores token as `x-api-key`
- Session: `GET /auth/me` with optional `x-tenant-id`
- Fleet data: `GET /d1/assets`, `GET /b2/hierarchy`

Session values persist in AsyncStorage under `vivi.*` keys (same naming as web localStorage).

## Map tiles

The live map uses the same Google tile URLs as web Live Tracking and Traccar (`mt*.google.com/vt/lyrs=…`), rendered via `UrlTile` — not the native Google Maps SDK. Layer options: Roadmap, Terrain, Satellite, Hybrid.

## Screens

- **Overview** — fleet status counts from assets
- **Live map** — live GPS markers from `/api/traccar/live` merged with `/d1/assets`
- **Assets** — searchable asset list
- **Profile** — account info and sign out

Still planned: alerts, org/site picker, personal settings.

## Store identity

| | Android | iOS |
|---|---|---|
| App name | VIVI Mobile | VIVI Mobile |
| ID | `com.vivitel.telematics` (applicationId) | `com.vivitel.telematics` (bundle ID) |
| Website | https://us.vivitelematics.ca | https://us.vivitelematics.ca |

The ID is permanent once the app is published.

## Deep links

| Link | Opens |
|---|---|
| `https://us.vivitelematics.ca/Track/tracking/live`, `vivimobile://map` | Live map |
| `https://us.vivitelematics.ca/Track/fleet/assets`, `vivimobile://assets` | Assets |
| `https://us.vivitelematics.ca/mobile`, `vivimobile://home` | Overview |
| `https://us.vivitelematics.ca/mobile/profile`, `vivimobile://profile` | Profile |

Every other web path stays in the browser. The routing table is `src/navigation/linking.ts`; the
claimed paths are also listed in `android/app/src/main/AndroidManifest.xml` and
`frontend/public/.well-known/apple-app-site-association` — keep all three in sync.

The website proves it trusts the app with two files (served by `frontend/public/_worker.js`):

- `frontend/public/.well-known/assetlinks.json` — replace the placeholders with the SHA-256 of the
  **Play App Signing** key (Play Console → Test and release → App integrity) and your upload key.
- `frontend/public/.well-known/apple-app-site-association` — replace `REPLACE_WITH_APPLE_TEAM_ID`
  with your Apple Developer Team ID.

Then deploy the frontend. Check with
`https://us.vivitelematics.ca/.well-known/assetlinks.json` and Google's
[Statement List tester](https://developers.google.com/digital-asset-links/tools/generator).

## Push notifications (fleet alerts)

Android uses Firebase Cloud Messaging; iOS uses APNs relayed through Firebase.

1. Create a Firebase project, add an Android app (`com.vivitel.telematics`) and an iOS app (same ID).
2. Put `google-services.json` in `android/app/` and add `GoogleService-Info.plist` to the
   `VivitelMobile` target in Xcode. Until these exist, the app runs normally without push.
3. iOS: upload an APNs auth key (.p8) under Firebase → Project settings → Cloud Messaging, and enable
   the Push Notifications and Associated Domains capabilities for the App ID.
4. The app registers its token with `POST /api/mobile/push-tokens` `{ token, platform }` on sign-in
   and `DELETE` on sign-out. **That backend route is not built yet** — the app tolerates the 404.
   Notifications may carry `data.url` (any deep link above) or `data.screen` (`home|map|assets|profile`).

## Release signing (Google Play)

Generate an upload key once and keep it safe (it is git-ignored):

```bash
keytool -genkeypair -v -keystore android/app/vivi-upload.keystore -alias vivi-upload -keyalg RSA -keysize 2048 -validity 10000
```

Create `android/keystore.properties`:

```
storeFile=app/vivi-upload.keystore
storePassword=...
keyAlias=vivi-upload
keyPassword=...
```

Build the bundle for Play Console with `cd android && ./gradlew bundleRelease`
(output: `android/app/build/outputs/bundle/release/app-release.aab`). Without
`keystore.properties` release builds fall back to the debug key, which Play rejects.

## Platform UI conventions

`src/theme/platform.ts` holds the per-platform behaviour: Material ripple on Android vs. opacity
on iOS, iOS shadows vs. Android elevation, Ionicons on iOS vs. Material Design icons on Android in the
tab bar, iOS-centred vs. Android start-aligned headers, password-manager autofill hints on login,
native confirm dialog for sign-out, and safe-area insets on the live map.
