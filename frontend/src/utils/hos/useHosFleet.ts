import { useCallback, useEffect, useState } from "react";
import { loadHosFleetSnapshot } from "./api";
import type { HosFleetSnapshot } from "./types";

export function useHosFleet(options?: { fromMs?: number; toMs?: number; auto?: boolean }) {
  const [snapshot, setSnapshot] = useState<HosFleetSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await loadHosFleetSnapshot({
        fromMs: options?.fromMs,
        toMs: options?.toMs
      });
      setSnapshot(next);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [options?.fromMs, options?.toMs]);

  useEffect(() => {
    if (options?.auto === false) return;
    void reload();
  }, [reload, options?.auto]);

  return { snapshot, busy, error, reload, setSnapshot };
}
