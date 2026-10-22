import { describe, expect, it } from "vitest";
import {
  assetConfigurationStatus,
  CONFIGURATION_STATUS,
  configurationGroupCompileSucceeded,
  configurationStatusCellLabel,
  groupConfigurationStatus,
  isBlockingCompileError
} from "./configGroupCompileStatus";

describe("configGroupCompileStatus", () => {
  it("maps per-asset outcomes to the three configuration statuses", () => {
    expect(assetConfigurationStatus({ accepted: true })).toBe(CONFIGURATION_STATUS.ACCEPTED);
    expect(assetConfigurationStatus({ accepted: false, error: "link failed" })).toBe(
      CONFIGURATION_STATUS.FAILED
    );
    expect(assetConfigurationStatus({ accepted: false })).toBe(CONFIGURATION_STATUS.UPLOAD_REQUESTED);
    expect(assetConfigurationStatus(undefined)).toBe(CONFIGURATION_STATUS.UPLOAD_REQUESTED);
  });

  it("derives group status from compile acceptance", () => {
    expect(groupConfigurationStatus(undefined, 2)).toBe(CONFIGURATION_STATUS.UPLOAD_REQUESTED);
    expect(
      groupConfigurationStatus(
        {
          compiledAt: "2026-01-01T00:00:00.000Z",
          acceptedCount: 2,
          totalCount: 2,
          assets: [
            { assetKey: "a", label: "A", imei: "1", registration: "R1", accepted: true },
            { assetKey: "b", label: "B", imei: "2", registration: "R2", accepted: true }
          ]
        },
        2
      )
    ).toBe(CONFIGURATION_STATUS.ACCEPTED);
    expect(
      groupConfigurationStatus(
        {
          compiledAt: "2026-01-01T00:00:00.000Z",
          acceptedCount: 1,
          totalCount: 2,
          assets: [
            { assetKey: "a", label: "A", imei: "1", registration: "R1", accepted: true },
            {
              assetKey: "b",
              label: "B",
              imei: "2",
              registration: "R2",
              accepted: false,
              error: "permission failed"
            }
          ]
        },
        2
      )
    ).toBe(CONFIGURATION_STATUS.FAILED);
    expect(configurationStatusCellLabel(undefined, 3)).toContain("Upload Requested");
  });

  it("does not treat Traccar proxy noise as a blocking compile error", () => {
    expect(isBlockingCompileError("Traccar upstream unavailable")).toBe(false);
    expect(isBlockingCompileError("Notification 1027: null body status")).toBe(false);
    expect(isBlockingCompileError("Notification binding \"Patrol\" not found for site \"WJL\".")).toBe(true);
    expect(
      configurationGroupCompileSucceeded({
        acceptedCount: 1,
        assetsInGroup: 1,
        errors: ["Attribute 874: Traccar upstream unavailable"]
      })
    ).toBe(true);
    expect(
      configurationGroupCompileSucceeded({
        acceptedCount: 1,
        assetsInGroup: 1,
        errors: ["Device binding \"GPSV\" not found for site \"WJL\"."]
      })
    ).toBe(false);
  });
});
