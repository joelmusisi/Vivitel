# Live telemetry from Traccar: push instead of polling

Live views (Live Tracking, Home live counts, Info Hub streams, Device Health) need the
latest position of every device. There are three ways the backend can get it:

| Source | How | Cost |
|---|---|---|
| **Traccar socket** (`/api/socket`) | `TraccarSocketBridge` Durable Object keeps one websocket open to Traccar and receives every position and event as it happens. | One long-lived connection. No per-position requests. |
| **Traccar HTTP forwarding** | Traccar POSTs each position / event to `/ingest/traccar`. | One Worker request per position or event. |
| **Traccar REST API** (`/api/devices`, `/api/positions`, `/api/reports/*`) | Backend asks on demand. | Two or more Traccar calls per request, per client. Fallback only. |

Both push sources feed the same bridge. `/api/traccar/live` and Device Health read
from the bridge whenever it is fresh (socket open, or something forwarded in the last
2 minutes) and only fall back to the REST API when it is not.

## Turn on forwarding in Traccar

Add to `traccar.xml` on the Traccar server (`traccar.vivitelematics.ca`), then restart
Traccar. Use the same secret as the Worker's `TRACCAR_WEBHOOK_SECRET`
(`wrangler secret put TRACCAR_WEBHOOK_SECRET`).

```xml
<!-- Positions, as JSON { "position": {...}, "device": {...} } -->
<entry key='forward.url'>https://api.vivitelematics.ca/ingest/traccar</entry>
<entry key='forward.type'>json</entry>        <!-- Traccar 5.x+; older versions: forward.json=true -->
<entry key='forward.header'>x-webhook-secret: REPLACE_WITH_SECRET</entry>
<entry key='forward.retry.enable'>true</entry>

<!-- Events (alarms, overspeed, geofence, ignition...), as { "event", "position", "device" } -->
<entry key='event.forward.url'>https://api.vivitelematics.ca/ingest/traccar</entry>
<entry key='event.forward.header'>x-webhook-secret: REPLACE_WITH_SECRET</entry>
```

Check it is flowing: open Device Health on any asset. The feed line reads
"Traccar forwarding (last HH:MM:SS)" once forwarded data arrives, and each row's
Feed column shows "Forwarded".

## Which one to use

- **Rate limits are on the Vivitel side, not Traccar.** A self-hosted Traccar server has
  no daily API cap. The daily limits that bite are Cloudflare's (Workers requests per
  day, KV writes per day on the free plan) and the load the REST polling puts on Traccar.
- **The socket is the cheapest push source** and is already used. Keep it.
- **Forwarding is the most robust** (Traccar retries, no session to keep alive) but each
  position is one Worker request: 500 devices reporting every 30 s is about 1.4 million
  requests a day. That needs the Workers Paid plan, or point `forward.url` at the VPS
  backend instead, which has no per-request cost.
- **Event forwarding is low volume** (only real events) and also drives alert emails
  immediately instead of on the 2-minute poll. Turn this one on in any case.
