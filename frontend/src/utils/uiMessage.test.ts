import { describe, expect, it } from "vitest";
import { looksLikeRawId, sanitizeFeedbackLabel } from "./uiMessage";
import { roleDisplayName } from "./standardRoles";

describe("sanitizeFeedbackLabel", () => {
  it("replaces UUIDs with the fallback", () => {
    expect(sanitizeFeedbackLabel("54e446f6-9735-41de-B4f3-8b49a0d44571", "Role updated")).toBe("Role updated");
    expect(sanitizeFeedbackLabel("54e446f6 9735 41de B4f3 8b49a0d44571", "Saved")).toBe("Saved");
  });

  it("keeps human-readable save copy", () => {
    expect(sanitizeFeedbackLabel("Role updated", "Saved")).toBe("Role updated");
  });
});

describe("looksLikeRawId", () => {
  it("detects hyphenated and compact ids", () => {
    expect(looksLikeRawId("54e446f6-9735-41de-b4f3-8b49a0d44571")).toBe(true);
    expect(looksLikeRawId("Role updated")).toBe(false);
  });
});

describe("roleDisplayName", () => {
  it("uses the standard key when the stored name is an id", () => {
    expect(
      roleDisplayName({
        name: "54e446f6-9735-41de-b4f3-8b49a0d44571",
        standardRoleKey: "admin"
      })
    ).toBe("Admin");
  });

  it("keeps a real role name", () => {
    expect(roleDisplayName({ name: "Dispatch lead" })).toBe("Dispatch lead");
  });
});
