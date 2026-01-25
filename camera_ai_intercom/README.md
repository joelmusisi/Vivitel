# Mitac AI Camera Intercom (Android)

This is a scaffolded Android app intended to run on Mitac AI cameras and provide:
- Intercom (mic capture + uplink)
- AI talkback (downlink + playback + optional AI processing)
- SD-card deployable package structure

## What’s included
- Android app skeleton with intercom/talkback services.
- SD-card package layout with a config stub.
- Placeholder AI engine for future model integration.

## How it works (high level)
1. `MainActivity` exposes start/stop controls for Intercom and Talkback.
2. `IntercomService` captures mic audio (PCM 16-bit mono) and forwards to `IntercomTransport` (stub).
3. `TalkbackService` plays received audio from `TalkbackTransport` (stub).
4. `AiEngine` is a placeholder for TFLite/NNAPI integration.
5. `SdBootstrapReceiver` listens for media mount and boot to load configuration and start services.

## Next steps (required)
- Replace `IntercomTransport` and `TalkbackTransport` with vivitelematicx API integration.
- Add Mitac camera SDK hooks if required for privileged audio I/O or auto-start.
- Provide real AI models and preprocessing in `AiEngine`.

## SD-card layout
- sdcard_package/config.json: runtime settings (server endpoints, device ID, audio params).
- sdcard_package/install.sh: placeholder for vendor auto-install flow.

## Notes
- This is a scaffold; API integration and device-specific permissions are still needed.
