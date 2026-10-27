export const GPSIOT_DEFAULT_BASE_URL = "https://api.gpsiot.net";
export const GPSIOT_REGION = "uk";

export type GpsIotEnv = {
  GPSIOT_BASE_URL?: string;
  GPSIOT_WEB_API_KEY?: string;
  GPSIOT_WEB_SECRET_KEY?: string;
  /** Shared secret GPS IoT puts on forwarded HTTP pushes (Authorization Bearer). */
  GPSIOT_FORWARD_TOKEN?: string;
};

export type GpsIotSecrets = {
  baseUrl: string;
  webApiKey: string;
  webSecretKey: string;
};

/**
 * Web API Key and Web Secret Key belong to the United Kingdom host only.
 * Other regions never receive them, even when the same worker process holds the env values.
 */
export function readGpsIotSecrets(region: string, env: GpsIotEnv): GpsIotSecrets | null {
  if (String(region ?? "").trim().toLowerCase() !== GPSIOT_REGION) return null;
  const webApiKey = String(env.GPSIOT_WEB_API_KEY ?? "").trim();
  const webSecretKey = String(env.GPSIOT_WEB_SECRET_KEY ?? "").trim();
  if (!webApiKey || !webSecretKey) return null;
  const baseUrl = String(env.GPSIOT_BASE_URL ?? GPSIOT_DEFAULT_BASE_URL)
    .trim()
    .replace(/\/+$/, "");
  return {
    baseUrl: baseUrl || GPSIOT_DEFAULT_BASE_URL,
    webApiKey,
    webSecretKey
  };
}

/** Site create, rename, and delete on the South Africa host. The United Kingdom routes do not use this. */
export function readZaGpsIotSecrets(region: string, env: GpsIotEnv): GpsIotSecrets | null {
  if (String(region ?? "").trim().toLowerCase() !== "za") return null;
  const webApiKey = String(env.GPSIOT_WEB_API_KEY ?? "").trim();
  const webSecretKey = String(env.GPSIOT_WEB_SECRET_KEY ?? "").trim();
  if (!webApiKey || !webSecretKey) return null;
  const baseUrl = String(env.GPSIOT_BASE_URL ?? GPSIOT_DEFAULT_BASE_URL)
    .trim()
    .replace(/\/+$/, "");
  return {
    baseUrl: baseUrl || GPSIOT_DEFAULT_BASE_URL,
    webApiKey,
    webSecretKey
  };
}
