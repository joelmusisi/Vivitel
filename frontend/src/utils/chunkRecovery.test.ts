import { describe, expect, it } from "vitest";
import { isChunkLoadError } from "./chunkRecovery";

describe("chunkRecovery", () => {
  it("detects dynamic import failures", () => {
    expect(
      isChunkLoadError(
        new Error("Failed to fetch dynamically imported module: https://example.com/static/Streams-abc.js")
      )
    ).toBe(true);
    expect(isChunkLoadError(new Error("Loading chunk 12 failed"))).toBe(true);
    expect(isChunkLoadError(new Error("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError(new Error("Unable to preload CSS for /static/foo.css"))).toBe(true);
    expect(isChunkLoadError(new Error("Cannot read properties of null"))).toBe(false);
  });
});
