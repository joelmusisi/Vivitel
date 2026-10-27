import { describe, expect, it } from "vitest";
import {
  resolveB2Purpose,
  resolveB2Credentials,
  resolveB2CredentialsForKey,
  resolveB2ReadCredentials,
  b2TrackConfigured,
  b2ReportsConfigured
} from "./b2BucketRouter";

const baseEnv = {
  B2_KEY_ID: "default-key",
  B2_APP_KEY: "default-secret",
  B2_BUCKET: "old-bucket"
};

const fullEnv = {
  ...baseEnv,
  B2_TRACK_KEY_ID: "track-key",
  B2_TRACK_APP_KEY: "track-secret",
  B2_BUCKET_TRACK: "VIVI-TRACK",
  B2_REPORTS_KEY_ID: "reports-key",
  B2_REPORTS_APP_KEY: "reports-secret",
  B2_BUCKET_REPORTS: "Vivi-Reports"
};

describe("resolveB2Purpose", () => {
  it("routes telemetry and routes libraries to track", () => {
    expect(
      resolveB2Purpose("dealer/a/org/b/db/c/site/s/assets/truck/telemetry/2026/07/26/e1.json.gz")
    ).toBe("track");
    expect(resolveB2Purpose("libraries/routes/tenant/acme/site/wh.json")).toBe("track");
    expect(resolveB2Purpose("telemetry-archive/t/imei/2026/01/01/e.json")).toBe("track");
  });

  it("routes report archives to reports", () => {
    expect(resolveB2Purpose("dealer/a/org/b/db/c/site/s/reports/2026/03/rep.json.gz")).toBe("reports");
    expect(resolveB2Purpose("reports/export/x.json")).toBe("reports");
  });

  it("keeps device artifacts on default", () => {
    expect(resolveB2Purpose("default/firmware/abc")).toBe("default");
    expect(resolveB2Purpose("downloads/mitac-software/Vivitel_Mitac_Pack.zip")).toBe("default");
  });
});

describe("resolveB2Credentials", () => {
  it("falls back to default when track/reports env missing", () => {
    expect(b2TrackConfigured(baseEnv)).toBe(false);
    expect(b2ReportsConfigured(baseEnv)).toBe(false);
    const track = resolveB2Credentials(baseEnv, "track");
    expect(track?.purpose).toBe("default");
    expect(track?.bucketName).toBe("old-bucket");
  });

  it("uses dedicated track/reports buckets when configured", () => {
    expect(resolveB2Credentials(fullEnv, "track")?.bucketName).toBe("VIVI-TRACK");
    expect(resolveB2Credentials(fullEnv, "reports")?.bucketName).toBe("Vivi-Reports");
    expect(resolveB2CredentialsForKey(fullEnv, "libraries/routes/tenant/x/site/y.json")?.bucketName).toBe(
      "VIVI-TRACK"
    );
  });

  it("dual-reads track then default", () => {
    const reads = resolveB2ReadCredentials(
      fullEnv,
      "dealer/a/org/b/db/c/site/s/assets/t/telemetry/2026/01/01/e.json"
    );
    expect(reads.map((r) => r.bucketName)).toEqual(["VIVI-TRACK", "old-bucket"]);
  });
});
