import { describe, expect, it } from "vitest";
import { slugTraccarScopeToken } from "./traccarSiteScope";

describe("slugTraccarScopeToken", () => {
  it("slugifies legacy scoped library ids", () => {
    expect(slugTraccarScopeToken("MMULU COMPANY")).toBe("mmulu-company");
  });
});
