import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getHierarchy } from "../utils/api";
import { activateSiteContext, activateTenantContext, readUserScopedJson, writeUserScopedJson } from "../utils/tenantContext";

export type DbProfileOption = {
  key: string;
  label: string;
  tenantId: string;
  dealerId: string;
  dealerName: string;
  orgId: string;
  orgName: string;
  dbId: string;
  dbName: string;
  sites: string[];
};

type DbProfileState = {
  selectedDb: string;
  setSelectedDb: (next: string) => void;
  dbOptions: DbProfileOption[];
  activeOption: DbProfileOption | null;
  dbLabel: string;
  reloadProfiles: () => Promise<void>;
  /** Apply the selected database as the active org-ribbon DB context. */
  applySelectedDb: () => void;
};

const STORAGE_KEY = "vivi.dbProfile.selected";

type HierarchySite = { id?: string; name?: string };
type HierarchyDb = { id?: string; name?: string; sites?: HierarchySite[] };
type HierarchyOrg = { id?: string; name?: string; databases?: HierarchyDb[] };
type HierarchyDealer = { id?: string; name?: string; organisations?: HierarchyOrg[] };

function loadInitialSelectedDb(): string {
  return String(readUserScopedJson<string>(STORAGE_KEY) ?? "").trim() || "__current__";
}

function readCurrentDbKey(): string {
  if (typeof window === "undefined") return "";
  return String(window.localStorage.getItem("vivi.activeDbId") ?? "").trim();
}

function buildOptionsFromHierarchy(hierarchy: unknown): DbProfileOption[] {
  const dealers = Array.isArray((hierarchy as { dealers?: HierarchyDealer[] })?.dealers)
    ? ((hierarchy as { dealers: HierarchyDealer[] }).dealers ?? [])
    : [];
  const opts: DbProfileOption[] = [];

  for (const dealer of dealers) {
    const dealerId = String(dealer?.id ?? "").trim();
    const dealerName = String(dealer?.name ?? "").trim();
    for (const org of Array.isArray(dealer?.organisations) ? dealer.organisations : []) {
      const orgId = String(org?.id ?? "").trim();
      const orgName = String(org?.name ?? "").trim();
      for (const db of Array.isArray(org?.databases) ? org.databases : []) {
        const dbId = String(db?.id ?? "").trim();
        const dbName = String(db?.name ?? "").trim();
        if (!dbId && !dbName) continue;
        const sites = (Array.isArray(db?.sites) ? db.sites : [])
          .map((s) => String(s?.name ?? "").trim())
          .filter(Boolean);
        const tenantId = [dealerId, orgId, dbId].filter(Boolean).join(":");
        opts.push({
          key: dbId || `name:${dbName}`,
          label: dbName || dbId,
          tenantId,
          dealerId,
          dealerName,
          orgId,
          orgName,
          dbId,
          dbName: dbName || dbId,
          sites
        });
      }
    }
  }

  opts.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  return opts;
}

function activateDatabaseOption(option: DbProfileOption) {
  if (typeof window === "undefined") return;

  const previousSite = String(window.localStorage.getItem("vivi.activeSite") ?? "").trim();
  if (option.dealerId) window.localStorage.setItem("vivi.activeDealerId", option.dealerId);
  if (option.orgId) window.localStorage.setItem("vivi.activeOrgId", option.orgId);
  if (option.dbId) window.localStorage.setItem("vivi.activeDbId", option.dbId);
  window.localStorage.setItem("vivi.selectedScope", "db");
  window.localStorage.setItem("vivi.activeDbSites", JSON.stringify(option.sites.length ? option.sites : ["Default"]));
  window.localStorage.removeItem("vivi.activeSite");
  window.localStorage.removeItem("vivi.activeSiteId");

  if (option.tenantId) {
    activateTenantContext(option.tenantId);
    window.localStorage.setItem("vivi.tenantId", option.tenantId);
  }
  activateSiteContext(previousSite, "");

  const nextPath = [option.dealerName, option.orgName, option.dbName].filter(Boolean).join(" / ");
  if (nextPath) window.localStorage.setItem("vivi.selectedPath", nextPath);

  window.dispatchEvent(new Event("vivi:orgchange"));
  window.dispatchEvent(new Event("vivi:contextchange"));
}

const DbProfileContext = createContext<DbProfileState | null>(null);

export function DbProfileProvider({ children }: { children: React.ReactNode }) {
  const [selectedDb, setSelectedDbState] = useState<string>(() => loadInitialSelectedDb());
  const [dbOptions, setDbOptions] = useState<DbProfileOption[]>([]);

  const reloadProfiles = useCallback(async () => {
    try {
      const hierarchy = await getHierarchy();
      setDbOptions(buildOptionsFromHierarchy(hierarchy));
    } catch {
      setDbOptions([]);
    }
  }, []);

  useEffect(() => {
    void reloadProfiles();
    const onOrg = () => {
      void reloadProfiles();
      const current = readCurrentDbKey();
      if (current) {
        setSelectedDbState((prev) => (prev === "__current__" ? current : prev));
      }
    };
    window.addEventListener("vivi:orgchange", onOrg);
    return () => window.removeEventListener("vivi:orgchange", onOrg);
  }, [reloadProfiles]);

  useEffect(() => {
    writeUserScopedJson(STORAGE_KEY, selectedDb);
  }, [selectedDb]);

  const resolvedKey = useMemo(() => {
    if (selectedDb === "__current__") return readCurrentDbKey() || selectedDb;
    return selectedDb;
  }, [selectedDb, dbOptions]);

  const activeOption = useMemo(() => {
    const key = resolvedKey;
    if (!key || key === "__current__") {
      const current = readCurrentDbKey();
      return dbOptions.find((o) => o.dbId === current || o.key === current) ?? null;
    }
    return dbOptions.find((o) => o.key === key || o.dbId === key) ?? null;
  }, [dbOptions, resolvedKey]);

  const setSelectedDb = useCallback(
    (next: string) => {
      const value = String(next || "").trim() || "__current__";
      setSelectedDbState(value);
      const option =
        value === "__current__"
          ? dbOptions.find((o) => o.dbId === readCurrentDbKey())
          : dbOptions.find((o) => o.key === value || o.dbId === value);
      if (option && option.dbId !== readCurrentDbKey()) {
        activateDatabaseOption(option);
      }
    },
    [dbOptions]
  );

  const applySelectedDb = useCallback(() => {
    if (activeOption) activateDatabaseOption(activeOption);
  }, [activeOption]);

  const dbLabel = activeOption?.label || "Current database";

  const value = useMemo(
    () => ({
      selectedDb,
      setSelectedDb,
      dbOptions,
      activeOption,
      dbLabel,
      reloadProfiles,
      applySelectedDb
    }),
    [selectedDb, setSelectedDb, dbOptions, activeOption, dbLabel, reloadProfiles, applySelectedDb]
  );

  return <DbProfileContext.Provider value={value}>{children}</DbProfileContext.Provider>;
}

export function useDbProfile(): DbProfileState {
  const ctx = useContext(DbProfileContext);
  if (!ctx) {
    throw new Error("useDbProfile must be used within DbProfileProvider");
  }
  return ctx;
}

export function useDbProfileOptional(): DbProfileState | null {
  return useContext(DbProfileContext);
}
