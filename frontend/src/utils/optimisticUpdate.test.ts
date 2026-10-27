import { beforeEach, describe, expect, it, vi } from "vitest";
import { runOptimisticUpdate } from "./optimisticUpdate";

vi.mock("./saveFeedback", () => ({
  showSaveDone: vi.fn(),
  endSavingError: vi.fn()
}));

vi.mock("./toast", () => ({
  showToast: vi.fn()
}));

describe("runOptimisticUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies immediately and keeps the update when the request succeeds", async () => {
    let rows = ["a"];
    const ok = await runOptimisticUpdate({
      getSnapshot: () => rows,
      apply: () => {
        rows = ["a", "b"];
      },
      rollback: (snapshot) => {
        rows = snapshot;
      },
      request: async () => ({ stored: true })
    });
    expect(ok).toBe(true);
    expect(rows).toEqual(["a", "b"]);
  });

  it("rolls back and toasts when the request fails", async () => {
    const { showToast } = await import("./toast");
    let rows = ["a"];
    const ok = await runOptimisticUpdate({
      getSnapshot: () => rows,
      apply: () => {
        rows = [];
      },
      rollback: (snapshot) => {
        rows = snapshot;
      },
      request: async () => ({ deleted: false, error: "nope" }),
      errorMessage: "Delete failed"
    });
    expect(ok).toBe(false);
    expect(rows).toEqual(["a"]);
    expect(showToast).toHaveBeenCalledWith("Delete failed", "error");
    const { endSavingError } = await import("./saveFeedback");
    expect(endSavingError).toHaveBeenCalled();
  });

  it("does not treat uniqueness conflicts as success", async () => {
    let rows = [{ id: "1", email: "a@x" }];
    const ok = await runOptimisticUpdate({
      getSnapshot: () => rows,
      apply: () => {
        rows = [...rows, { id: "2", email: "a@x" }];
      },
      rollback: (snapshot) => {
        rows = snapshot;
      },
      request: async () => ({ stored: false, status: 409, error: "Driver Email Exists" }),
      errorMessage: (result) => (typeof result === "object" && result.status === 409 ? "Driver Email Exists" : "Save failed")
    });
    expect(ok).toBe(false);
    expect(rows).toEqual([{ id: "1", email: "a@x" }]);
  });
});
