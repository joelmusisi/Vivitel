# Vivitel Mobile (React Native + Hermes)

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
