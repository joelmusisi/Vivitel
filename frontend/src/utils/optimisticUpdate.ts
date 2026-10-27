import { endSavingError, showSaveDone } from "./saveFeedback";
import { showToast } from "./toast";

export type OptimisticRequestResult =
  | boolean
  | {
      ok?: boolean;
      stored?: boolean;
      deleted?: boolean;
      error?: string;
      status?: number;
    };

function resultSucceeded(result: OptimisticRequestResult): boolean {
  if (typeof result === "boolean") return result;
  if (result.ok === false || result.stored === false || result.deleted === false) return false;
  if (result.ok === true || result.stored === true || result.deleted === true) return true;
  return !String(result.error ?? "").trim();
}

function resultError(result: OptimisticRequestResult): string {
  if (typeof result === "boolean") return "";
  return String(result.error ?? "").trim();
}

export type OptimisticUpdateArgs<T> = {
  getSnapshot: () => T;
  apply: () => void;
  rollback: (snapshot: T) => void;
  request: () => Promise<OptimisticRequestResult>;
  errorMessage?: string | ((result: OptimisticRequestResult) => string);
  /** Show the Saved leaflet as soon as the UI updates (default true). */
  successFeedback?: boolean;
  onSuccess?: () => void | Promise<void>;
};

/**
 * Update local UI immediately, persist in the background, and restore the snapshot on failure.
 */
export async function runOptimisticUpdate<T>(args: OptimisticUpdateArgs<T>): Promise<boolean> {
  const snapshot = args.getSnapshot();
  args.apply();
  if (args.successFeedback !== false) showSaveDone();

  try {
    const result = await args.request();
    if (resultSucceeded(result)) {
      await args.onSuccess?.();
      return true;
    }
    args.rollback(snapshot);
    const fallback = "Unable to save. Please try again.";
    const message =
      typeof args.errorMessage === "function" ? args.errorMessage(result) : args.errorMessage || resultError(result) || fallback;
    endSavingError();
    showToast(message, "error");
    return false;
  } catch (error) {
    args.rollback(snapshot);
    const fallback = "Unable to save. Please try again.";
    const message =
      typeof args.errorMessage === "function"
        ? args.errorMessage({ ok: false, error: String((error as Error)?.message ?? error ?? "") })
        : args.errorMessage || fallback;
    endSavingError();
    showToast(message, "error");
    return false;
  }
}
