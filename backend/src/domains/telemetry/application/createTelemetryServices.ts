import { buildAssetTelemetryArchiveKey, withAssetStoragePrefix } from "../../../shared/assetStoragePaths";

interface SqliteDbLike {
  prepare(query: string): {
    get: (...params: any[]) => any;
    all: (...params: any[]) => any[];
    run: (...params: any[]) => any;
  };
}

interface CreateTelemetryServicesDeps {
  db: SqliteDbLike & { assets?: Array<{ tenant_id: string; data: any; updated_at: string }> };
  hasSqlite: boolean;
  normalizeNumber: (value: unknown) => number | null;
  parseStoredJson: (value: unknown) => any;
  findExistingAssetIdByImei: (tenant: string, imei: string) => string;
  extractLatLng: (payload: Record<string, unknown>) => { lat: number; lng: number } | null;
  buildIoNamedSnapshotFromTelemetry: (payload: any) => { ioById: Record<number, any>; ioNamed: Record<string, any> };
  toNumberOrNull: (value: unknown) => number | null;
  haversineMeters: (aLat: number, aLng: number, bLat: number, bLng: number) => number;
  getMonitoredEventsForAsset: (tenant: string, asset: any) => string[];
  extractMonitoredValue: (telemetry: any, monitoredName: string) => { found: boolean; value?: any };
  normalizeTelemetryKey: (value: string) => string;
  generateId: () => string;
  archivePrefix: string;
  archiveLocalDir: string;
  /** Purpose-aware B2 put (Track telemetry → VIVI-TRACK when configured). */
  b2PutObject?: (args: {
    key: string;
    body: Buffer;
    contentType: string;
    contentEncoding?: string;
    metadata?: Record<string, string>;
  }) => Promise<boolean>;
  /** Dual-read B2 get (purpose bucket then legacy default). */
  b2GetObject?: (key: string) => Promise<Buffer | null>;
  /** @deprecated Prefer b2PutObject / b2GetObject. Kept for callers that still pass a raw client. */
  b2Client: any;
  b2Bucket: string;
  pathModule: { join: (...parts: string[]) => string; dirname: (path: string) => string };
  fsModule: {
    mkdirSync: (path: string, options?: any) => void;
    writeFileSync: (path: string, data: Buffer) => void;
    existsSync: (path: string) => boolean;
    readFileSync: (path: string) => Buffer;
  };
  zlibModule: { gzipSync: (data: Buffer) => Buffer; gunzipSync: (data: Buffer) => Buffer };
  gzipAsync?: (data: Buffer) => Promise<Buffer>;
  PutObjectCommandCtor: new (input: any) => any;
  GetObjectCommandCtor: new (input: any) => any;
  postgresMirror?: {
    mirrorTelemetryWrite: (args: {
      tenantId: string;
      assetId: string;
      imei: string;
      createdAt: string;
      assetData: Record<string, unknown>;
      eventId: string;
      eventData: Record<string, unknown>;
      alerts: unknown[];
    }) => Promise<void>;
    mirrorTelemetryArchive: (args: {
      eventId: string;
      tenantId: string;
      assetId: string;
      imei: string;
      createdAt: string;
      storage: string;
      storageKey: string;
      contentType: string;
      sizeBytes: number;
    }) => Promise<void>;
  } | null;
}

export function createTelemetryServices(deps: CreateTelemetryServicesDeps) {
  const {
    db,
    hasSqlite,
    normalizeNumber,
    parseStoredJson,
    findExistingAssetIdByImei,
    extractLatLng,
    buildIoNamedSnapshotFromTelemetry,
    toNumberOrNull,
    haversineMeters,
    getMonitoredEventsForAsset,
    extractMonitoredValue,
    normalizeTelemetryKey,
    generateId,
    archivePrefix: _archivePrefix,
    archiveLocalDir,
    b2PutObject,
    b2GetObject,
    b2Client,
    b2Bucket,
    pathModule,
    fsModule,
    zlibModule,
    gzipAsync,
    PutObjectCommandCtor,
    GetObjectCommandCtor,
    postgresMirror,
  } = deps;

  function findTenantForImeiWithDefault(imei: string, preferredDefaultTenant = ""): string {
    const clean = String(imei ?? "").trim();
    if (!clean) return preferredDefaultTenant || "default";
    if (preferredDefaultTenant) return preferredDefaultTenant;

    try {
      if (!hasSqlite) {
        const rows = db.assets ?? [];
        const matches = rows.filter((row) => String(row?.data?.imei ?? "").trim() === clean);
        matches.sort((left, right) => (String(left.updated_at ?? "") < String(right.updated_at ?? "") ? 1 : -1));
        return String(matches[0]?.tenant_id ?? "").trim() || "default";
      }
      const like = `%\"imei\":\"${clean}\"%`;
      const row = db
        .prepare("SELECT tenant_id, updated_at FROM assets WHERE data LIKE ? ORDER BY updated_at DESC LIMIT 1")
        .get(like);
      return String(row?.tenant_id ?? "").trim() || "default";
    } catch {
      return "default";
    }
  }

  function findTenantForImei(imei: string, defaultTenant: string): string {
    return findTenantForImeiWithDefault(imei, defaultTenant);
  }

  function normalizeFreematicsTelemetryBody(body: any) {
    const source = body && typeof body === "object" ? body : {};
    const lat = normalizeNumber(source.lat ?? source.latitude ?? source.gps?.lat ?? source.gps?.latitude);
    const lon = normalizeNumber(source.lon ?? source.lng ?? source.longitude ?? source.gps?.lon ?? source.gps?.lng ?? source.gps?.longitude);
    if (lat === null || lon === null) return null;

    const timestampRaw = String(source.timestamp ?? source.time ?? source.ts ?? source.at ?? "").trim();
    const parsedMs = timestampRaw ? Date.parse(timestampRaw) : Number.NaN;
    const timestampIso = Number.isFinite(parsedMs) ? new Date(parsedMs).toISOString() : new Date().toISOString();
    const imei = String(source.imei ?? source.deviceId ?? source.device?.imei ?? source.modem?.imei ?? source.id ?? "").trim();

    return {
      data: {
        imei,
        lat,
        lon,
        speed: normalizeNumber(source.speed ?? source.gps?.speed) ?? undefined,
        heading: normalizeNumber(source.heading ?? source.course ?? source.gps?.heading ?? source.gps?.course) ?? undefined,
        satellites: normalizeNumber(source.satellites ?? source.gps?.satellites) ?? undefined,
        altitude: normalizeNumber(source.altitude ?? source.gps?.altitude) ?? undefined,
        timestamp: timestampIso,
        provider: "freematics",
        raw: source
      }
    } as any;
  }

  function normalizeCameraHealthTelemetryBody(body: any, cameraId: string) {
    const source = body && typeof body === "object" ? body : {};
    const lat = normalizeNumber(
      source.lat
        ?? source.latitude
        ?? source.gps?.lat
        ?? source.gps?.latitude
        ?? source.location?.lat
        ?? source.location?.latitude
        ?? source.tracking?.lat
        ?? source.tracking?.latitude
    );
    const lon = normalizeNumber(
      source.lon
        ?? source.lng
        ?? source.longitude
        ?? source.gps?.lon
        ?? source.gps?.lng
        ?? source.gps?.longitude
        ?? source.location?.lon
        ?? source.location?.lng
        ?? source.location?.longitude
        ?? source.tracking?.lon
        ?? source.tracking?.lng
        ?? source.tracking?.longitude
    );
    if (lat === null || lon === null) return null;

    const timestampRaw = String(
      source.timestamp
        ?? source.time
        ?? source.ts
        ?? source.at
        ?? source.recordedAt
        ?? source.lastSeenAt
        ?? ""
    ).trim();
    const parsedMs = timestampRaw ? Date.parse(timestampRaw) : Number.NaN;
    const timestampIso = Number.isFinite(parsedMs) ? new Date(parsedMs).toISOString() : new Date().toISOString();

    const imeiRaw = String(
      source.imei
        ?? source.deviceImei
        ?? source.device?.imei
        ?? source.modem?.imei
        ?? source.tracker?.imei
        ?? ""
    ).trim();
    const deviceIdRaw = String(source.deviceId ?? source.id ?? cameraId ?? "").trim();
    const imei = /^\d{14,17}$/.test(imeiRaw) ? imeiRaw : (/^\d{14,17}$/.test(deviceIdRaw) ? deviceIdRaw : "");

    return {
      id: cameraId,
      deviceId: cameraId,
      data: {
        imei,
        lat,
        lon,
        speed: normalizeNumber(source.speed ?? source.gps?.speed ?? source.tracking?.speed) ?? undefined,
        heading: normalizeNumber(source.heading ?? source.course ?? source.gps?.heading ?? source.tracking?.heading) ?? undefined,
        satellites: normalizeNumber(source.satellites ?? source.gps?.satellites ?? source.tracking?.satellites) ?? undefined,
        altitude: normalizeNumber(source.altitude ?? source.gps?.altitude ?? source.tracking?.altitude) ?? undefined,
        timestamp: timestampIso,
        provider: "camera-health",
        cameraId,
        raw: source
      }
    } as any;
  }

  function parseUtcCompactTimestampYYYYMMDDhhmmss(raw: string) {
    const clean = String(raw ?? "").trim();
    if (!/^\d{14}$/.test(clean)) return "";
    const yyyy = Number(clean.slice(0, 4));
    const mm = Number(clean.slice(4, 6));
    const dd = Number(clean.slice(6, 8));
    const hh = Number(clean.slice(8, 10));
    const mi = Number(clean.slice(10, 12));
    const ss = Number(clean.slice(12, 14));
    if (!Number.isFinite(yyyy) || !Number.isFinite(mm) || !Number.isFinite(dd) || !Number.isFinite(hh) || !Number.isFinite(mi) || !Number.isFinite(ss)) return "";
    return new Date(Date.UTC(yyyy, mm - 1, dd, hh, mi, ss)).toISOString();
  }

  function parseQueclinkTextMessage(rawLine: string) {
    const line = String(rawLine ?? "").trim().replace(/\r|\n/g, "").replace(/\$$/, "");
    if (!line.startsWith("+")) return null;
    const parts = line.split(",").map((part) => part.trim());
    if (!parts.length) return null;
    const head = parts[0] ?? "";
    const typeMatch = head.match(/^\+(?:RESP|BUFF|ACK):([^,]+)/i);
    const messageType = String(typeMatch?.[1] ?? "").trim() || "UNKNOWN";
    const imei = parts.find((part) => /^\d{14,17}$/.test(part)) ?? "";

    let lat: number | null = null;
    let lon: number | null = null;
    let speed: number | null = null;
    let heading: number | null = null;

    for (let i = 1; i < parts.length - 1; i += 1) {
      const a = normalizeNumber(parts[i]);
      const b = normalizeNumber(parts[i + 1]);
      if (a === null || b === null) continue;
      if (Math.abs(a) <= 90 && Math.abs(b) <= 180) {
        lat = a;
        lon = b;
        const speedCandidate = normalizeNumber(parts[i + 2]);
        if (speedCandidate !== null && speedCandidate >= 0 && speedCandidate <= 400) speed = speedCandidate;
        const headingCandidate = normalizeNumber(parts[i + 3]);
        if (headingCandidate !== null && headingCandidate >= 0 && headingCandidate <= 360) heading = headingCandidate;
        break;
      }
    }
    if (lat === null || lon === null) return null;

    const stampRaw = [...parts].reverse().find((part) => /^\d{14}$/.test(part)) ?? "";
    const timestamp = stampRaw ? parseUtcCompactTimestampYYYYMMDDhhmmss(stampRaw) : new Date().toISOString();
    return { imei, messageType, lat, lon, speed, heading, timestamp, raw: line };
  }

  function buildTelemetryArchiveKey(args: {
    tenant: string;
    assetId: string;
    site?: string;
    createdAt: string;
    eventId: string;
  }) {
    return buildAssetTelemetryArchiveKey({
      tenantId: args.tenant,
      site: args.site,
      assetId: args.assetId || "unknown",
      createdAt: args.createdAt,
      eventId: args.eventId || generateId(),
      extension: ".json.gz"
    });
  }

  async function archiveTelemetryEventAsync(args: {
    tenant: string;
    assetId: string;
    imei: string;
    eventId: string;
    createdAt: string;
    payload: Record<string, unknown>;
    site?: string;
  }) {
    const { tenant, assetId, imei, eventId, createdAt, payload } = args;
    const payloadBytes = Buffer.from(JSON.stringify(payload), "utf8");
    const gzipBytes = gzipAsync
      ? await gzipAsync(payloadBytes)
      : zlibModule.gzipSync(payloadBytes);
    const dataObj = payload.data && typeof payload.data === "object" ? (payload.data as Record<string, unknown>) : {};
    const site = String(args.site ?? payload.site ?? dataObj.site ?? "").trim();
    const storageKey = buildTelemetryArchiveKey({ tenant, assetId, site, createdAt, eventId });
    let storage: "b2" | "local" = "local";
    let finalKey = storageKey;

    if (b2PutObject) {
      try {
        const ok = await b2PutObject({
          key: storageKey,
          body: gzipBytes,
          contentType: "application/json",
          contentEncoding: "gzip",
          metadata: {
            tenant: String(tenant || "default"),
            imei: String(imei || ""),
            eventid: String(eventId || ""),
            createdat: String(createdAt || "")
          }
        });
        if (ok) storage = "b2";
      } catch {
        storage = "local";
      }
    } else if (b2Client) {
      try {
        await b2Client.send(new PutObjectCommandCtor({
          Bucket: b2Bucket,
          Key: storageKey,
          Body: gzipBytes,
          ContentType: "application/json",
          ContentEncoding: "gzip",
          Metadata: {
            tenant: String(tenant || "default"),
            imei: String(imei || ""),
            eventid: String(eventId || ""),
            createdat: String(createdAt || "")
          }
        }));
        storage = "b2";
      } catch {
        storage = "local";
      }
    }

    if (storage === "local") {
      const localPath = pathModule.join(archiveLocalDir, ...storageKey.split("/"));
      fsModule.mkdirSync(pathModule.dirname(localPath), { recursive: true });
      fsModule.writeFileSync(localPath, gzipBytes);
      finalKey = localPath;
    }

    try {
      db.prepare("INSERT OR REPLACE INTO telemetry_archives (event_id, tenant_id, asset_id, imei, created_at, storage, storage_key, content_type, size_bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(eventId, tenant, assetId, imei, createdAt, storage, finalKey, "application/json", Number(gzipBytes.length));
    } catch {
      // ignore index write failures
    }
    void postgresMirror?.mirrorTelemetryArchive({
      eventId,
      tenantId: tenant,
      assetId,
      imei,
      createdAt,
      storage,
      storageKey: finalKey,
      contentType: "application/json",
      sizeBytes: Number(gzipBytes.length),
    });
  }

  async function readTelemetryArchivePayload(row: any) {
    const storage = String(row?.storage ?? "").trim().toLowerCase();
    const key = String(row?.storage_key ?? "").trim();
    if (!key) return null;
    try {
      let compressed: Buffer | null = null;
      if (storage === "b2") {
        if (b2GetObject) {
          compressed = await b2GetObject(key);
        } else if (b2Client) {
          const result = await b2Client.send(new GetObjectCommandCtor({ Bucket: b2Bucket, Key: key }));
          const body: any = result?.Body;
          if (body && typeof body.transformToByteArray === "function") {
            compressed = Buffer.from(await body.transformToByteArray());
          } else if (body && typeof body.pipe === "function") {
            const chunks: Buffer[] = [];
            await new Promise<void>((resolve, reject) => {
              body.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
              body.on("end", () => resolve());
              body.on("error", (err: Error) => reject(err));
            });
            compressed = Buffer.concat(chunks);
          }
        }
      } else if (fsModule.existsSync(key)) {
        compressed = fsModule.readFileSync(key);
      }
      if (!compressed || !compressed.length) return null;
      const jsonBytes = zlibModule.gunzipSync(compressed);
      return JSON.parse(jsonBytes.toString("utf8"));
    } catch {
      return null;
    }
  }

  function storeTelemetryEventForTenant(tenant: string, body: any) {
    const imei = String(body?.imei ?? body?.uniqueId ?? body?.deviceUniqueId ?? body?.data?.imei ?? "").trim();
    const deviceId = String(body?.deviceId ?? body?.device?.id ?? "").trim();
    let id = String(body?.id ?? body?.assetId ?? body?.registration ?? deviceId ?? body?.deviceName ?? body?.device?.name ?? imei ?? "").trim();
    if (imei) {
      const existingId = findExistingAssetIdByImei(tenant, imei);
      id = existingId || imei;
    }
    if (!id) return { ok: false as const, status: 400, error: "Asset id is required." };

    const eventTimestampCandidate = String(body?.data?.timestamp ?? body?.timestamp ?? body?.data?.at ?? body?.at ?? "").trim();
    const parsedEventTime = eventTimestampCandidate ? Date.parse(eventTimestampCandidate) : NaN;
    const deviceAtIso = Number.isNaN(parsedEventTime) ? "" : new Date(parsedEventTime).toISOString();
    const now = new Date().toISOString();
    const latLng = extractLatLng(body);
    if (!latLng) return { ok: false as const, status: 400, error: "Latitude and longitude are required for telemetry." };

    const satellites = normalizeNumber(body?.data?.satellites ?? body?.data?.sat ?? body?.satellites ?? body?.sat ?? body?.attributes?.sat ?? body?.attributes?.satellites);
    const isZeroFix = Math.abs(latLng.lat) < 0.000001 && Math.abs(latLng.lng) < 0.000001;
    if (isZeroFix && (satellites === null || satellites <= 0)) {
      return { ok: true as const, status: 202, stored: false as const, tenantId: tenant, ignoredReason: "no_gps_fix" };
    }

    let existing = db.prepare("SELECT data FROM assets WHERE tenant_id = ? AND id = ?").get(tenant, id);
    if (!existing?.data && imei) {
      const row = db.prepare("SELECT data FROM assets WHERE tenant_id = ? AND data LIKE ? ORDER BY updated_at DESC LIMIT 1").get(tenant, `%\"imei\":\"${imei}\"%`);
      if (row?.data) existing = row;
    }

    let previousAsset: Record<string, unknown> | null = null;
    let alertsToMirror: any[] = [];
    if (existing?.data) {
      try {
        previousAsset = parseStoredJson(existing.data) ?? null;
      } catch {
        previousAsset = null;
      }
    }

    let nextAsset: Record<string, unknown> = {
      id,
      lastSeen: now,
      lastPosition: now,
      lat: latLng.lat,
      lng: latLng.lng,
      lon: latLng.lng,
      gps: `${latLng.lat}, ${latLng.lng}`
    };
    if (existing?.data) {
      try {
        const parsed = parseStoredJson(existing.data) ?? {};
        nextAsset = { ...(parsed as any), ...nextAsset };
      } catch {
        // keep minimal
      }
    }
    if (imei) (nextAsset as any).imei = imei;
    if (deviceId) (nextAsset as any).deviceId = deviceId;
    if (deviceAtIso) (nextAsset as any).lastDeviceTime = deviceAtIso;

    try {
      const snapshot = buildIoNamedSnapshotFromTelemetry(body);
      (nextAsset as any).telemetryLatest = {
        at: now,
        ...(deviceAtIso ? { deviceAt: deviceAtIso } : {}),
        ioById: snapshot.ioById,
        io: snapshot.ioNamed
      };
      const io = snapshot.ioNamed;
      const speedFromPayload = Number(body?.data?.speed ?? body?.speed);
      const headingFromPayload = Number(body?.data?.heading ?? body?.heading);
      const satellitesFromPayload = Number(body?.data?.satellites ?? body?.data?.sat ?? body?.satellites ?? body?.sat ?? body?.attributes?.sat ?? body?.attributes?.satellites);
      if (Number.isFinite(speedFromPayload)) (nextAsset as any).speed = speedFromPayload;
      if (Number.isFinite(headingFromPayload)) (nextAsset as any).heading = headingFromPayload;
      if (Number.isFinite(satellitesFromPayload)) (nextAsset as any).satellites = satellitesFromPayload;
      if (typeof io["Ignition"] !== "undefined") {
        (nextAsset as any).ignition = io["Ignition"];
        const ignitionOn = io["Ignition"] === 1 || io["Ignition"] === true || io["Ignition"] === "1" || io["Ignition"] === "true";
        if (ignitionOn) {
          (nextAsset as any).lastTrip = now;
          const prevIgnitionOn = [1, true, "1", "true"].includes((previousAsset as any)?.ignition as any);
          if (!prevIgnitionOn) (nextAsset as any).ignitionOnAt = deviceAtIso || now;
        } else {
          delete (nextAsset as any).ignitionOnAt;
        }
      }
      if (typeof io["Speed"] !== "undefined") (nextAsset as any).speed = io["Speed"];
      if (typeof io["GSM Signal"] !== "undefined") (nextAsset as any).gsmSignal = io["GSM Signal"];
      if (typeof io["External Voltage"] !== "undefined") (nextAsset as any).powerVoltage = io["External Voltage"];
      if (typeof io["ICCID"] !== "undefined") (nextAsset as any).iccid = io["ICCID"];
      const odometerRaw = io["Total Odometer"] ?? io["Trip Odometer"] ?? io["Odometer"];
      if (typeof odometerRaw !== "undefined") {
        const odometerVal = Number(odometerRaw);
        if (Number.isFinite(odometerVal) && odometerVal > 0) (nextAsset as any).odometer = odometerVal;
      }
    } catch {
      // ignore
    }

    try {
      const warnings: string[] = [];
      const diagnostics: Record<string, unknown> = { at: now };
      const nextSatellites = toNumberOrNull((nextAsset as any).satellites);
      if (nextSatellites !== null) {
        diagnostics.satellites = nextSatellites;
        if (nextSatellites <= 0) warnings.push("no_satellite_fix");
        else if (nextSatellites <= 3) warnings.push("low_satellite_count");
      }
      const previousLat = toNumberOrNull((previousAsset as any)?.lat ?? (previousAsset as any)?.latitude);
      const previousLng = toNumberOrNull((previousAsset as any)?.lng ?? (previousAsset as any)?.lon ?? (previousAsset as any)?.longitude);
      const previousAtRaw = String((previousAsset as any)?.lastSeen ?? (previousAsset as any)?.lastPosition ?? "").trim();
      const previousAtMs = previousAtRaw ? Date.parse(previousAtRaw) : NaN;
      const currentAtMs = Date.parse(now);
      if (previousLat !== null && previousLng !== null && Number.isFinite(previousAtMs) && Number.isFinite(currentAtMs) && currentAtMs > previousAtMs) {
        const deltaSeconds = (currentAtMs - previousAtMs) / 1000;
        if (deltaSeconds >= 5 && deltaSeconds <= 300) {
          const distanceMeters = haversineMeters(previousLat, previousLng, latLng.lat, latLng.lng);
          const impliedKph = deltaSeconds > 0 ? (distanceMeters / deltaSeconds) * 3.6 : 0;
          diagnostics.deltaSeconds = Number(deltaSeconds.toFixed(3));
          diagnostics.distanceMeters = Number(distanceMeters.toFixed(1));
          diagnostics.impliedSpeedKph = Number(impliedKph.toFixed(1));
          const reportedSpeed = Math.max(0, toNumberOrNull((nextAsset as any).speed) ?? 0);
          diagnostics.reportedSpeedKph = Number(reportedSpeed.toFixed(1));
          if (distanceMeters >= 120 && impliedKph >= 12 && reportedSpeed <= 1.2) warnings.push("movement_speed_mismatch");
        }
      }
      (nextAsset as any).telemetryQuality = { ...diagnostics, warnings };
    } catch {
      // ignore
    }

    try {
      const monitoredEvents = getMonitoredEventsForAsset(tenant, nextAsset);
      if (monitoredEvents.length) {
        const state: Record<string, any> = (nextAsset as any).telemetryState && typeof (nextAsset as any).telemetryState === "object" ? (nextAsset as any).telemetryState : {};
        const alertsToUpsert: any[] = [];
        for (const name of monitoredEvents) {
          const observed = extractMonitoredValue(body, name);
          if (!observed.found) continue;
          const value = observed.value;
          if (value !== null && typeof value === "object") continue;
          const key = normalizeTelemetryKey(name);
          if (!key) continue;
          const previous = state[key]?.value;
          const previousJson = typeof previous === "undefined" ? undefined : JSON.stringify(previous);
          const currentJson = JSON.stringify(value);
          if (typeof previous === "undefined") {
            state[key] = { name, value, at: now };
            continue;
          }
          if (previousJson === currentJson) {
            state[key] = { name, value, at: now };
            continue;
          }
          state[key] = { name, value, at: now };
          const alertId = generateId();
          alertsToUpsert.push({
            id: alertId,
            type: "Telemetry",
            severity: "Low",
            assetId: id,
            message: `${name} changed: ${String(previous ?? "—")} → ${String(value ?? "—")}`,
            status: "Open",
            createdAt: now,
            field: name,
            previous,
            current: value
          });
        }
        (nextAsset as any).telemetryState = state;
        alertsToMirror = alertsToUpsert;
        if (alertsToUpsert.length) {
          const stmt = db.prepare("INSERT OR REPLACE INTO alerts (id, tenant_id, data, updated_at) VALUES (?, ?, ?, ?)");
          for (const alert of alertsToUpsert) {
            stmt.run(String(alert.id), tenant, JSON.stringify(alert), now);
          }
        }
      }
    } catch {
      // ignore
    }

    const storedAsset = withAssetStoragePrefix(tenant, nextAsset);
    db.prepare("INSERT OR REPLACE INTO assets (id, tenant_id, data, updated_at) VALUES (?, ?, ?, ?)").run(
      id,
      tenant,
      JSON.stringify(storedAsset),
      now
    );
    const eventId = generateId();
    const eventPayload = { id: eventId, type: "telemetry", assetId: id, createdAt: now, data: storedAsset };
    db.prepare("INSERT INTO telemetry_events (id, tenant_id, type, asset_id, imei, created_at, data) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(eventId, tenant, "telemetry", id, imei, now, JSON.stringify(eventPayload));
    void postgresMirror?.mirrorTelemetryWrite({
      tenantId: tenant,
      assetId: id,
      imei,
      createdAt: now,
      assetData: storedAsset,
      eventId,
      eventData: eventPayload,
      alerts: alertsToMirror,
    });
    void archiveTelemetryEventAsync({
      tenant,
      assetId: id,
      imei,
      eventId,
      createdAt: now,
      payload: eventPayload,
      site: String(storedAsset.site ?? "").trim()
    });
    return { ok: true as const, status: 200, stored: true, id, tenantId: tenant, eventId };
  }

  return {
    findTenantForImeiWithDefault,
    findTenantForImei,
    normalizeFreematicsTelemetryBody,
    normalizeCameraHealthTelemetryBody,
    parseQueclinkTextMessage,
    readTelemetryArchivePayload,
    storeTelemetryEventForTenant,
  };
}
