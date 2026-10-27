import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  readActiveTenantId,
  readUserScopedJson,
  writeUserScopedJson
} from "../utils/tenantContext";

export type FleetEntityMode = "asset" | "driver";

type FleetFilterState = {
  selectedSites: string[];
  setSelectedSites: React.Dispatch<React.SetStateAction<string[]>>;
  selectedAssets: string[];
  setSelectedAssets: React.Dispatch<React.SetStateAction<string[]>>;
  entityMode: FleetEntityMode;
  setEntityMode: (next: FleetEntityMode) => void;
  /** Empty selection = all sites in active database scope. */
  matchesSite: (siteNameOrId?: string | null, altId?: string | null) => boolean;
  /** Empty selection = all assets/regs. */
  matchesAsset: (regOrId?: string | null, altId?: string | null) => boolean;
  clearSites: () => void;
  clearAssets: () => void;
  clearAll: () => void;
};

const SITES_KEY = "vivi.fleetFilter.selectedSites";
const ASSETS_KEY = "vivi.fleetFilter.selectedAssets";
const ENTITY_KEY = "vivi.fleetFilter.entityMode";

const normalizeToken = (value: unknown) => String(value ?? "").trim().toLowerCase();

function parseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x ?? "").trim()).filter(Boolean);
}

function loadInitialSites(): string[] {
  return parseStringArray(readUserScopedJson<string[]>(SITES_KEY));
}

function loadInitialAssets(): string[] {
  return parseStringArray(readUserScopedJson<string[]>(ASSETS_KEY));
}

function loadInitialEntityMode(): FleetEntityMode {
  const raw = String(readUserScopedJson<string>(ENTITY_KEY) ?? "").trim().toLowerCase();
  return raw === "driver" ? "driver" : "asset";
}

const FleetFilterContext = createContext<FleetFilterState | null>(null);

export function FleetFilterProvider({ children }: { children: React.ReactNode }) {
  const [tenantEpoch, setTenantEpoch] = useState(0);
  const [selectedSites, setSelectedSites] = useState<string[]>(() => loadInitialSites());
  const [selectedAssets, setSelectedAssets] = useState<string[]>(() => loadInitialAssets());
  const [entityMode, setEntityMode] = useState<FleetEntityMode>(() => loadInitialEntityMode());

  useEffect(() => {
    const reload = () => {
      setSelectedSites(loadInitialSites());
      setSelectedAssets(loadInitialAssets());
      setEntityMode(loadInitialEntityMode());
      setTenantEpoch((n) => n + 1);
    };
    window.addEventListener("vivi:orgchange", reload);
    window.addEventListener("vivi:contextchange", reload);
    return () => {
      window.removeEventListener("vivi:orgchange", reload);
      window.removeEventListener("vivi:contextchange", reload);
    };
  }, []);

  useEffect(() => {
    writeUserScopedJson(SITES_KEY, selectedSites);
  }, [selectedSites, tenantEpoch]);

  useEffect(() => {
    writeUserScopedJson(ASSETS_KEY, selectedAssets);
  }, [selectedAssets, tenantEpoch]);

  useEffect(() => {
    writeUserScopedJson(ENTITY_KEY, entityMode);
  }, [entityMode, tenantEpoch]);

  // Clear multi-select when tenant or site changes so leftover filters never empty the new page.
  useEffect(() => {
    let tenant = readActiveTenantId();
    let site =
      typeof window === "undefined" ? "" : String(window.localStorage.getItem("vivi.activeSite") ?? "").trim();
    const onStorage = () => {
      const nextTenant = readActiveTenantId();
      const nextSite =
        typeof window === "undefined" ? "" : String(window.localStorage.getItem("vivi.activeSite") ?? "").trim();
      if (nextTenant !== tenant || nextSite !== site) {
        tenant = nextTenant;
        site = nextSite;
        setSelectedSites([]);
        setSelectedAssets([]);
      }
    };
    window.addEventListener("vivi:orgchange", onStorage);
    window.addEventListener("vivi:contextchange", onStorage);
    return () => {
      window.removeEventListener("vivi:orgchange", onStorage);
      window.removeEventListener("vivi:contextchange", onStorage);
    };
  }, []);

  const siteLookup = useMemo(() => {
    const set = new Set<string>();
    for (const s of selectedSites) {
      const t = String(s || "").trim();
      if (t) set.add(t);
      const n = normalizeToken(t);
      if (n) set.add(n);
    }
    return set;
  }, [selectedSites]);

  const assetLookup = useMemo(() => {
    const set = new Set<string>();
    for (const a of selectedAssets) {
      const t = String(a || "").trim();
      if (t) set.add(t);
      const n = normalizeToken(t);
      if (n) set.add(n);
    }
    return set;
  }, [selectedAssets]);

  const matchesSite = useCallback(
    (siteNameOrId?: string | null, altId?: string | null) => {
      if (!siteLookup.size) return true;
      const a = String(siteNameOrId || "").trim();
      const b = String(altId || "").trim();
      if (a && (siteLookup.has(a) || siteLookup.has(normalizeToken(a)))) return true;
      if (b && (siteLookup.has(b) || siteLookup.has(normalizeToken(b)))) return true;
      return false;
    },
    [siteLookup]
  );

  const matchesAsset = useCallback(
    (regOrId?: string | null, altId?: string | null) => {
      if (!assetLookup.size) return true;
      const a = String(regOrId || "").trim();
      const b = String(altId || "").trim();
      if (a && (assetLookup.has(a) || assetLookup.has(normalizeToken(a)))) return true;
      if (b && (assetLookup.has(b) || assetLookup.has(normalizeToken(b)))) return true;
      return false;
    },
    [assetLookup]
  );

  const clearSites = useCallback(() => setSelectedSites([]), []);
  const clearAssets = useCallback(() => setSelectedAssets([]), []);
  const clearAll = useCallback(() => {
    setSelectedSites([]);
    setSelectedAssets([]);
  }, []);

  const value = useMemo(
    () => ({
      selectedSites,
      setSelectedSites,
      selectedAssets,
      setSelectedAssets,
      entityMode,
      setEntityMode,
      matchesSite,
      matchesAsset,
      clearSites,
      clearAssets,
      clearAll
    }),
    [
      selectedSites,
      selectedAssets,
      entityMode,
      matchesSite,
      matchesAsset,
      clearSites,
      clearAssets,
      clearAll
    ]
  );

  return <FleetFilterContext.Provider value={value}>{children}</FleetFilterContext.Provider>;
}

export function useFleetFilter(): FleetFilterState {
  const ctx = useContext(FleetFilterContext);
  if (!ctx) {
    throw new Error("useFleetFilter must be used within FleetFilterProvider");
  }
  return ctx;
}

/** Safe hook for optional consumers outside the provider (returns passthrough matchers). */
export function useFleetFilterOptional(): FleetFilterState | null {
  return useContext(FleetFilterContext);
}
