import { describe, expect, it } from "vitest";
import {
  assetConfigurationStatus,
  buildConfigGroupSourceFingerprint,
  buildConfigGroupSourceSnapshot,
  CONFIGURATION_CHANGE,
  CONFIGURATION_STATUS,
  configurationChangeLabel,
  configurationGroupCompileSucceeded,
  configurationStatusCellLabel,
  groupConfigurationStatus,
  hasConfigurationSourceChanged,
  isBlockingCompileError,
  type ConfigGroupSourceRecords
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

describe("configuration change fingerprint", () => {
  type Group = { site: string; notificationBinding?: string; locationBinding?: string; deviceBinding?: string };

  const baseGroup: Group = { site: "WJL", notificationBinding: "notif:wjl:patrol", deviceBinding: "GPSV" };

  const baseSources = (): ConfigGroupSourceRecords => ({
    notificationBindings: [
      {
        id: "notif:wjl:patrol",
        name: "Patrol",
        site: "WJL",
        assetCount: 3,
        groupCount: 1,
        monitoredEvents: ["Overspeed", "Harsh braking"]
      }
    ],
    locationBindings: [{ id: "loc:wjl:yard", name: "Yard", site: "WJL", locationsConfig: [{ id: "y1", name: "Yard" }] }],
    deviceBindings: [
      {
        id: "dev:wjl:gpsv",
        name: "GPSV",
        site: "WJL",
        deviceType: "FMB",
        lines: [{ id: "l1", wire: "1", parameter: "Ignition" }],
        advancedSettings: { odometer: true }
      }
    ],
    libraryItems: [
      {
        description: "Overspeed",
        type: "Alarm",
        availability: "Available",
        traccarNotificationId: 11,
        parameters: { record: { delay: { hours: "0", minutes: "0", seconds: "10" }, userAlerts: { email: true } } }
      },
      { description: "Harsh braking", type: "Alarm", availability: "Available" },
      { description: "Idling", type: "Alarm", availability: "Available" }
    ]
  });

  const compiledFor = (group: Group, sources: ConfigGroupSourceRecords) => ({
    compiledAt: "2026-01-01T00:00:00.000Z",
    acceptedCount: 1,
    totalCount: 1,
    assets: [{ assetKey: "a", label: "A", imei: "1", registration: "R1", accepted: true }],
    sourceSnapshot: buildConfigGroupSourceSnapshot(group, buildConfigGroupSourceFingerprint(group, sources))
  });

  /** Compile against base sources, then evaluate the column against edited sources / group. */
  const changedAfter = (
    edit: (sources: ConfigGroupSourceRecords) => void,
    nextGroup: Group = baseGroup
  ) => {
    const compileAcceptance = compiledFor(baseGroup, baseSources());
    const sources = baseSources();
    edit(sources);
    return hasConfigurationSourceChanged({
      ...nextGroup,
      // Saves bump timestamps; the fingerprint, not the timestamp, must decide.
      updatedAt: "2026-02-01T00:00:00.000Z",
      linkedSourceUpdatedAt: "2026-02-01T00:00:00.000Z",
      currentSourceFingerprint: buildConfigGroupSourceFingerprint(nextGroup, sources),
      compileAcceptance
    });
  };

  it("does not flag an unchanged save (timestamps, counts, ids, key order)", () => {
    expect(
      changedAfter((sources) => {
        const binding = sources.notificationBindings[0];
        binding.updatedAt = "2026-02-01T00:00:00.000Z";
        binding.assetCount = 9;
        binding.monitoredEvents = ["Harsh braking", "Overspeed"];
        sources.libraryItems[0].traccarNotificationId = 99;
        sources.deviceBindings[0] = { advancedSettings: { odometer: true }, ...sources.deviceBindings[0] };
      })
    ).toBe(false);
  });

  it("flags a renamed notification binding or device binding", () => {
    expect(changedAfter((sources) => (sources.notificationBindings[0].name = "Patrol v2"))).toBe(true);
    expect(
      changedAfter(
        (sources) => (sources.deviceBindings[0].name = "GPSV2"),
        { ...baseGroup, deviceBinding: "GPSV2" }
      )
    ).toBe(true);
  });

  it("flags a renamed notification", () => {
    expect(
      changedAfter((sources) => {
        sources.libraryItems[0].description = "Overspeed 80";
        sources.notificationBindings[0].monitoredEvents = ["Overspeed 80", "Harsh braking"];
      })
    ).toBe(true);
  });

  it("flags notification and device parameter changes", () => {
    expect(
      changedAfter((sources) => {
        const params = sources.libraryItems[0].parameters as any;
        params.record.delay.seconds = "30";
      })
    ).toBe(true);
    expect(
      changedAfter((sources) => {
        const params = sources.libraryItems[0].parameters as any;
        params.record.userAlerts.sms = true;
      })
    ).toBe(true);
    expect(
      changedAfter((sources) => {
        (sources.deviceBindings[0].lines as any[])[0].parameter = "Panic";
      })
    ).toBe(true);
  });

  it("flags notifications added to or removed from the binding", () => {
    expect(
      changedAfter((sources) => (sources.notificationBindings[0].monitoredEvents = ["Overspeed", "Harsh braking", "Idling"]))
    ).toBe(true);
    expect(changedAfter((sources) => (sources.notificationBindings[0].monitoredEvents = ["Overspeed"]))).toBe(true);
  });

  it("flags bindings added to or removed from the group", () => {
    expect(changedAfter(() => undefined, { ...baseGroup, locationBinding: "Yard" })).toBe(true);
    expect(changedAfter(() => undefined, { site: "WJL", notificationBinding: "notif:wjl:patrol" })).toBe(true);
  });

  it("clears after recompiling against the edited sources", () => {
    const sources = baseSources();
    sources.notificationBindings[0].monitoredEvents = ["Overspeed"];
    const fingerprint = buildConfigGroupSourceFingerprint(baseGroup, sources);
    const input = {
      ...baseGroup,
      currentSourceFingerprint: fingerprint,
      compileAcceptance: compiledFor(baseGroup, sources)
    };
    expect(hasConfigurationSourceChanged(input)).toBe(false);
    expect(configurationChangeLabel(input, 1)).toBe("");
    expect(
      configurationChangeLabel(
        { ...input, compileAcceptance: compiledFor(baseGroup, baseSources()) },
        1
      )
    ).toBe(CONFIGURATION_CHANGE.CHANGED);
  });

  it("waits for sources instead of guessing from timestamps", () => {
    expect(
      hasConfigurationSourceChanged({
        ...baseGroup,
        linkedSourceUpdatedAt: "2026-02-01T00:00:00.000Z",
        compileAcceptance: compiledFor(baseGroup, baseSources())
      })
    ).toBe(false);
  });
});
