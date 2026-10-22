/**
 * Resolve which Backblaze B2 bucket a blob key belongs to.
 *
 * - track: telemetry archives + route libraries → VIVI-TRACK
 * - reports: report archives → Vivi-Reports
 * - default: everything else → legacy B2_BUCKET
 *
 * When a purpose-specific bucket is not configured, callers fall back to default
 * so production keeps working until Track/Reports credentials are added.
 */

export type B2Purpose = "track" | "reports" | "default";

export type B2PurposeEnv = {
  /** Legacy / default bucket (required for B2 overall). */
  B2_BUCKET?: string;
  B2_KEY_ID?: string;
  B2_APP_KEY?: string;
  B2_BUCKET_ID?: string;
  B2_BUCKET_NAME?: string;

  B2_BUCKET_TRACK?: string;
  B2_BUCKET_NAME_TRACK?: string;
  B2_BUCKET_ID_TRACK?: string;
  B2_TRACK_KEY_ID?: string;
  B2_TRACK_APP_KEY?: string;

  B2_BUCKET_REPORTS?: string;
  B2_BUCKET_NAME_REPORTS?: string;
  B2_BUCKET_ID_REPORTS?: string;
  B2_REPORTS_KEY_ID?: string;
  B2_REPORTS_APP_KEY?: string;
};

const trim = (value: unknown) => String(value ?? "").trim();

/** Classify an object key by path convention (keys themselves are never rewritten). */
export function resolveB2Purpose(key: string): B2Purpose {
  const k = String(key ?? "").replace(/^\/+/, "");
  if (!k) return "default";

  // Route libraries (Track / Journey)
  if (k.startsWith("libraries/routes/")) return "track";

  // Legacy IMEI-dated telemetry archives
  if (k.startsWith("telemetry-archive/")) return "track";

  // Asset telemetry: .../assets/{id}/telemetry/...
  if (/\/assets\/[^/]+\/telemetry(\/|$)/.test(k)) return "track";

  // Report archives: .../reports/{yyyy}/{mm}/... or top-level reports/
  if (k.startsWith("reports/") || /\/reports\/\d{4}\/\d{2}\//.test(k)) return "reports";

  return "default";
}

export type B2BucketCredentials = {
  purpose: B2Purpose;
  bucketName: string;
  bucketId: string;
  keyId: string;
  appKey: string;
};

function defaultBucketName(env: B2PurposeEnv): string {
  return trim(env.B2_BUCKET_NAME ?? env.B2_BUCKET);
}

function trackBucketName(env: B2PurposeEnv): string {
  return trim(env.B2_BUCKET_NAME_TRACK ?? env.B2_BUCKET_TRACK);
}

function reportsBucketName(env: B2PurposeEnv): string {
  return trim(env.B2_BUCKET_NAME_REPORTS ?? env.B2_BUCKET_REPORTS);
}

/** True when at least the legacy/default B2 credentials + bucket are present. */
export function b2DefaultConfigured(env: B2PurposeEnv): boolean {
  return Boolean(
    trim(env.B2_KEY_ID) &&
      trim(env.B2_APP_KEY) &&
      (trim(env.B2_BUCKET_ID) || defaultBucketName(env))
  );
}

/** True when Track-specific credentials + bucket are present (no fallback). */
export function b2TrackConfigured(env: B2PurposeEnv): boolean {
  return Boolean(
    trim(env.B2_TRACK_KEY_ID) &&
      trim(env.B2_TRACK_APP_KEY) &&
      (trim(env.B2_BUCKET_ID_TRACK) || trackBucketName(env))
  );
}

/** True when Reports-specific credentials + bucket are present (no fallback). */
export function b2ReportsConfigured(env: B2PurposeEnv): boolean {
  return Boolean(
    trim(env.B2_REPORTS_KEY_ID) &&
      trim(env.B2_REPORTS_APP_KEY) &&
      (trim(env.B2_BUCKET_ID_REPORTS) || reportsBucketName(env))
  );
}

/**
 * Resolve credentials for a purpose.
 * Track/Reports fall back to default when purpose env is incomplete so deploys
 * remain safe until operators add dedicated keys.
 */
export function resolveB2Credentials(env: B2PurposeEnv, purpose: B2Purpose): B2BucketCredentials | null {
  if (purpose === "track" && b2TrackConfigured(env)) {
    return {
      purpose: "track",
      bucketName: trackBucketName(env),
      bucketId: trim(env.B2_BUCKET_ID_TRACK),
      keyId: trim(env.B2_TRACK_KEY_ID),
      appKey: trim(env.B2_TRACK_APP_KEY)
    };
  }
  if (purpose === "reports" && b2ReportsConfigured(env)) {
    return {
      purpose: "reports",
      bucketName: reportsBucketName(env),
      bucketId: trim(env.B2_BUCKET_ID_REPORTS),
      keyId: trim(env.B2_REPORTS_KEY_ID),
      appKey: trim(env.B2_REPORTS_APP_KEY)
    };
  }
  if (!b2DefaultConfigured(env)) return null;
  return {
    purpose: "default",
    bucketName: defaultBucketName(env),
    bucketId: trim(env.B2_BUCKET_ID),
    keyId: trim(env.B2_KEY_ID),
    appKey: trim(env.B2_APP_KEY)
  };
}

/** Credentials for writing a key (purpose from key, with safe fallback). */
export function resolveB2CredentialsForKey(env: B2PurposeEnv, key: string): B2BucketCredentials | null {
  return resolveB2Credentials(env, resolveB2Purpose(key));
}

/**
 * Ordered read targets for dual-read.
 * Track/Reports try purpose bucket first, then legacy default (never delete old).
 */
export function resolveB2ReadCredentials(env: B2PurposeEnv, key: string): B2BucketCredentials[] {
  const purpose = resolveB2Purpose(key);
  const primary = resolveB2Credentials(env, purpose);
  if (!primary) return [];
  if (purpose === "default" || primary.purpose === "default") return [primary];
  const fallback = resolveB2Credentials(env, "default");
  if (!fallback) return [primary];
  // Same physical bucket — no need to dual-read
  if (
    (primary.bucketId && fallback.bucketId && primary.bucketId === fallback.bucketId) ||
    (primary.bucketName && fallback.bucketName && primary.bucketName === fallback.bucketName)
  ) {
    return [primary];
  }
  return [primary, fallback];
}
