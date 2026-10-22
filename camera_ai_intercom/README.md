# Mitac AI Camera Intercom (Android)

This is a scaffolded Android app intended to run on Mitac AI cameras and provide:
- Intercom (mic capture + uplink)
- AI talkback (downlink + playback + optional AI processing)
- Persistent network status screen for field diagnostics
- SD-card deployable package structure

This module now supports runtime configuration for your VPS/device backend using host, port, API key, tenant, and APN labels from the SD-card config.

## What’s included
- Android app skeleton with intercom/talkback services.
- Persistent network/internet status monitor with offline/online visual states.
- SD-card package layout with a config stub.
- Placeholder AI engine for future model integration.
- Live API wiring for intercom uplink, talkback downlink, and camera health.

## How it works (high level)
1. `MainActivity` exposes start/stop controls for Intercom and Talkback.
2. `IntercomService` captures mic audio (PCM 16-bit mono) and forwards to `IntercomTransport`.
3. `IntercomTransport` batches PCM frames and continuously uploads chunks to the backend.
4. `TalkbackService` polls `TalkbackTransport` for queued talkback audio and plays it.
5. `TalkbackTransport` ACKs each delivered packet so the queue advances.
6. `NetworkStatusService` keeps a persistent fullscreen status screen active after startup.
7. `AiEngine` is a placeholder for TFLite/NNAPI integration.
8. `SdBootstrapReceiver` listens for media mount, package replacement, and boot to load configuration and start services.

## Next steps (optional)
- Add Mitac camera SDK hooks if required for privileged audio I/O or vendor-specific startup behavior.
- Provide real AI models and preprocessing in `AiEngine`.

## SD-card layout
- sdcard_package/config.json: runtime settings (server endpoints, device ID, audio params).
- sdcard_package/install.sh: placeholder for vendor auto-install flow.

## Runtime configuration
The app loads config from `/sdcard/vivitel/intercom/config.json` at startup and on boot/mount events.

Important fields:
- `deviceId`: unique camera identity.
- `tenantId`: forwarded as `x-tenant-id` for tenant-scoped backend storage.
- `apn`: APN label included in camera health payloads.
- `server.protocol`, `server.host`, `server.port`: backend endpoint.
- `server.apiKey`: sent as `x-api-key`.
- `server.cameraHealthPath`: defaults to `/ingest/camera-health`.
- `server.intercomAudioPath`: defaults to `/ingest/intercom-audio`.
- `server.talkbackNextPath`: defaults to `/intercom/talkback/next`.
- `server.talkbackAckBasePath`: defaults to `/intercom/talkback`.
- `intercom.uploadIntervalMs`: batch upload cadence for PCM chunks.
- `intercom.maxBufferedBytes`: fail-safe chunk size limit before immediate upload.
- `camera.autoStartIntercom`, `camera.autoStartTalkback`, `camera.autoStartNetworkStatus`: boot behavior.

Current shipped defaults in `sdcard_package/config.json`:
- `autoStartIntercom: true`
- `autoStartTalkback: true`
- `autoStartNetworkStatus: true`

## Visual and audible status behavior

- During SD-card deployment, the screen blinks black/yellow and announces `Please Wait` every 60 seconds.
- If Android Text-to-Speech is unavailable on the device, the deployment service now falls back to an audible two-tone beep pattern instead of staying silent.
- After installation and on normal boot, the app keeps a fullscreen software status indicator active:
	- blinking blue: network/server offline
	- solid green: network/server reachable

Important limitation:
- This repository does not contain any vendor SDK or hardware API for controlling the MiTAC camera's physical blue LED.
- The implemented blue/green behavior is therefore app-level on-screen feedback, not physical LED control.

Legacy compatibility:
- `serverUrl` is still parsed when `server.host` or `server.port` is not explicitly set.

## Backend alignment
Use the VPS backend routes in `vivi_telematic/backend/src/vps_server.ts`:
- `POST /ingest/camera-health`
- `POST /ingest/intercom-audio`
- `GET /intercom/talkback/next`
- `POST /intercom/talkback/:id/ack`
- `POST /intercom/talkback/enqueue` (operator/app side)
- `GET /d1/cameras`

The app sends periodic camera health payloads that include:
- `id`/`cameraId`
- `tenantId`
- `apn`
- network type (`wifi`, `cellular`, `ethernet`, or `offline`)
- rolling intercom byte/frame counters

The app sends continuous unencrypted PCM16LE chunks (`pcm16leBase64` in JSON) for backend append-only recording.

## Notes
- Backend stores intercom recording chunks in rolling daily `.pcm` files under `CAMERA_RECORDINGS_DIR`.
- Payloads are not encrypted by this module; use TLS (`https`) in production.
- Package replacement now restarts intercom, talkback, and network-status services automatically when the app was installed from the SD-card bundle.
