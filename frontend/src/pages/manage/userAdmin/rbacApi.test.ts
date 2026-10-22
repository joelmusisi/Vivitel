import { describe, expect, it } from "vitest";
import { pickRbacUserFromResponse } from "./rbacApi";

describe("pickRbacUserFromResponse", () => {
  it("reads a single user payload", () => {
    const user = pickRbacUserFromResponse(
      { user: { id: "u1", name: "Jane Doe", email: "jane@example.com", status: "active" } },
      "u1"
    );
    expect(user?.name).toBe("Jane Doe");
    expect(user?.email).toBe("jane@example.com");
  });

  it("finds the user in a list when the editor used to ignore users[]", () => {
    const user = pickRbacUserFromResponse(
      {
        users: [
          { id: "other", name: "Other", email: "other@example.com", status: "active" },
          { id: "u1", name: "Jane Doe", email: "jane@example.com", status: "active" }
        ]
      },
      "u1"
    );
    expect(user?.email).toBe("jane@example.com");
  });

  it("does not invent a blank record when the list has no match", () => {
    expect(pickRbacUserFromResponse({ users: [{ id: "other", name: "Other", email: "o@x.com" }] }, "u1")).toBeNull();
  });
});
